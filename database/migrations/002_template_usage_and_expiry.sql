-- Migration: 002_template_usage_and_expiry
-- Description: Add template usage history tracking and certificate expiry enhancements
-- Date: 2026-01-17

-- ============================================================================
-- 1. CREATE template_usage_history TABLE
-- ============================================================================
-- Tracks templates used for generation and in-progress designs
-- Used for "Recent Used Templates" section in generate certificate flow

CREATE TABLE IF NOT EXISTS template_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
  template_version_id UUID REFERENCES certificate_template_versions(id) ON DELETE SET NULL,

  -- Usage type: 'generated' = used to generate certificates, 'in_progress' = user started designing
  usage_type TEXT NOT NULL CHECK (usage_type IN ('generated', 'in_progress')),

  -- For 'generated' type: link to the generation job
  generation_job_id UUID REFERENCES certificate_generation_jobs(id) ON DELETE SET NULL,

  -- For 'in_progress' type: snapshot of current field state (JSONB)
  -- Stores array of field objects with position, styling, etc.
  field_snapshot JSONB,

  -- Metadata
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certificates_count INTEGER DEFAULT 0, -- Only for 'generated' type

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching recent usage by org + user
CREATE INDEX IF NOT EXISTS idx_template_usage_org_user
  ON template_usage_history(organization_id, user_id, last_used_at DESC);

-- Index for looking up by template
CREATE INDEX IF NOT EXISTS idx_template_usage_template
  ON template_usage_history(template_id);

-- Unique constraint: only one in-progress per user per template
CREATE UNIQUE INDEX IF NOT EXISTS ux_template_usage_in_progress
  ON template_usage_history(organization_id, user_id, template_id)
  WHERE usage_type = 'in_progress';

-- Enable RLS
ALTER TABLE template_usage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own organization's usage history
CREATE POLICY "Users can view own org template usage" ON template_usage_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: Users can insert usage records for their own org
CREATE POLICY "Users can create template usage" ON template_usage_history
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    AND user_id = auth.uid()
  );

-- RLS Policy: Users can update their own usage records
CREATE POLICY "Users can update own template usage" ON template_usage_history
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: Users can delete their own usage records
CREATE POLICY "Users can delete own template usage" ON template_usage_history
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. CREATE VIEW for recent template usage with full details
-- ============================================================================

CREATE OR REPLACE VIEW v_template_usage_recent AS
SELECT
  tuh.id,
  tuh.organization_id,
  tuh.user_id,
  tuh.template_id,
  tuh.template_version_id,
  tuh.usage_type,
  tuh.generation_job_id,
  tuh.field_snapshot,
  tuh.last_used_at,
  tuh.certificates_count,
  tuh.created_at,
  tuh.updated_at,
  -- Template info
  ct.title AS template_title,
  ct.category_id,
  ct.subcategory_id,
  cat.name AS category_name,
  sub.name AS subcategory_name,
  -- Preview file info
  ctv.preview_file_id,
  pf.bucket AS preview_bucket,
  pf.path AS preview_path,
  -- Source file info
  ctv.source_file_id,
  sf.bucket AS source_bucket,
  sf.path AS source_path,
  sf.mime_type AS source_mime_type
FROM template_usage_history tuh
JOIN certificate_templates ct ON ct.id = tuh.template_id AND ct.deleted_at IS NULL
LEFT JOIN certificate_template_versions ctv ON ctv.id = tuh.template_version_id
LEFT JOIN certificate_categories cat ON cat.id = ct.category_id
LEFT JOIN certificate_subcategories sub ON sub.id = ct.subcategory_id
LEFT JOIN files pf ON pf.id = ctv.preview_file_id
LEFT JOIN files sf ON sf.id = ctv.source_file_id;

-- ============================================================================
-- 3. FUNCTION to record template usage after generation
-- ============================================================================

CREATE OR REPLACE FUNCTION record_template_generation_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- When a generation job completes, record usage
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO template_usage_history (
      organization_id,
      user_id,
      template_id,
      template_version_id,
      usage_type,
      generation_job_id,
      last_used_at,
      certificates_count
    )
    SELECT
      NEW.organization_id,
      NEW.created_by_user_id,
      NEW.template_id,
      NEW.template_version_id,
      'generated',
      NEW.id,
      NOW(),
      NEW.total_certificates
    WHERE NEW.template_id IS NOT NULL
    ON CONFLICT (organization_id, user_id, template_id)
    WHERE usage_type = 'in_progress'
    DO UPDATE SET
      usage_type = 'generated',
      generation_job_id = EXCLUDED.generation_job_id,
      last_used_at = EXCLUDED.last_used_at,
      certificates_count = COALESCE(template_usage_history.certificates_count, 0) + EXCLUDED.certificates_count,
      field_snapshot = NULL,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-recording usage on generation job completion
DROP TRIGGER IF EXISTS trg_record_template_generation ON certificate_generation_jobs;
CREATE TRIGGER trg_record_template_generation
  AFTER UPDATE ON certificate_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION record_template_generation_usage();

-- ============================================================================
-- 4. UPDATE verify_certificate function to return more data
-- ============================================================================
-- The existing function already returns most data, but we need to enhance it
-- to include preview URL and organization website

CREATE OR REPLACE FUNCTION public.verify_certificate_enhanced(p_token text)
RETURNS TABLE(
  certificate_id uuid,
  certificate_number text,
  recipient_name text,
  recipient_email text,
  course_name text,
  category_name text,
  subcategory_name text,
  issued_at timestamp with time zone,
  expires_at timestamp with time zone,
  status text,
  revoked_at timestamp with time zone,
  revoked_reason text,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_website text,
  organization_logo_bucket text,
  organization_logo_path text,
  preview_bucket text,
  preview_path text,
  result text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cert_id uuid;
  v_token_hash text;
BEGIN
  -- Hash the provided token to match against stored hash
  v_token_hash := encode(sha256(p_token::bytea), 'hex');

  -- Look up certificate by verification token hash
  RETURN QUERY
  SELECT
    c.id,
    c.certificate_number,
    c.recipient_name,
    c.recipient_email,
    sub.name AS course_name,
    cat.name AS category_name,
    sub.name AS subcategory_name,
    c.issued_at,
    c.expires_at,
    c.status::text,
    c.revoked_at,
    c.revoked_reason,
    c.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    o.website_url AS organization_website,
    lf.bucket AS organization_logo_bucket,
    lf.path AS organization_logo_path,
    pf.bucket AS preview_bucket,
    pf.path AS preview_path,
    CASE
      WHEN c.id IS NULL THEN 'not_found'
      WHEN c.status = 'revoked' THEN 'revoked'
      WHEN c.expires_at IS NOT NULL AND c.expires_at < NOW() THEN 'expired'
      ELSE 'valid'
    END AS result
  FROM certificates c
  JOIN organizations o ON o.id = c.organization_id
  JOIN certificate_categories cat ON cat.id = c.category_id
  JOIN certificate_subcategories sub ON sub.id = c.subcategory_id
  LEFT JOIN files lf ON lf.id = o.logo_file_id
  LEFT JOIN files pf ON pf.id = c.certificate_preview_file_id
  WHERE c.verification_token_hash = v_token_hash
  LIMIT 1;

  -- If no rows returned, return not_found
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::timestamp with time zone,
      NULL::timestamp with time zone,
      NULL::text,
      NULL::timestamp with time zone,
      NULL::text,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      'not_found'::text;
  END IF;
END;
$$;

-- ============================================================================
-- 5. ADD comments for documentation
-- ============================================================================

COMMENT ON TABLE template_usage_history IS 'Tracks template usage for "Recent Used Templates" feature. Records both completed generations and in-progress designs.';
COMMENT ON COLUMN template_usage_history.usage_type IS 'Type of usage: generated = used to generate certificates, in_progress = user started designing but not generated yet';
COMMENT ON COLUMN template_usage_history.field_snapshot IS 'JSON snapshot of field configuration for in_progress designs';
COMMENT ON COLUMN template_usage_history.certificates_count IS 'Running total of certificates generated using this template by this user';

COMMENT ON FUNCTION verify_certificate_enhanced IS 'Enhanced verification function that returns full certificate details including org info, preview URL, and verification result';
