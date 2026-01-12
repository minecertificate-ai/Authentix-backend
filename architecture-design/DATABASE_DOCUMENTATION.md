# Authentix — Database Design & Storage Architecture 

This document is the **single source of truth** for Authentix’s Supabase **Postgres schema + Storage** layout.
It explains **why each table exists**, what each column means at a **business level**, how tables relate, and how **RLS + Storage policies** enforce multi‑tenancy.

> **Important security note:** User passwords and password reset flows are handled by **Supabase Auth** (`auth.users`).  
> Authentix **must not** store passwords in public tables.

---

## 1) Core concepts & conventions

### Multi‑tenancy
Every tenant is an **organization**.
Most tables contain `organization_id` and are protected by **Row Level Security (RLS)** using helper functions (notably `is_member_of_org(org_id)`).

### IDs & timestamps
- Primary keys are UUIDs (`gen_random_uuid()`).
- Timestamps use `timestamptz` with `created_at` and (where needed) `updated_at`, `deleted_at`.
- “Soft delete” is represented by `deleted_at` (row remains for audit/history).

### Status enums
State transitions are encoded using enums, so that UI + backend can reliably filter and enforce valid states.

---

## 2) Authentication model (Supabase Auth + app profiles)

### Supabase Auth (`auth` schema)
Supabase Auth manages:
- Sign up / sign in
- Password hashing + reset flows
- Email verification / email change flows
- Sessions

### App profile layer (`public.profiles`)
Authentix stores only **app‑level profile fields** (name, etc.) and ties them to `auth.users.id`.

---

## 3) Storage model (Supabase Storage bucket: `authentix`)

### Bucket
- Bucket name: **`authentix`**
- Bucket should be **private**
- Access is controlled through RLS policies on `storage.objects`

### Required path convention (enforced by your storage policies)
Every stored object path must be scoped by org UUID and one of the approved roots:

```
(org_branding|certificate_templates|file_imports|certificates|exports|deliveries|invoices)/<org_uuid>/...
```

This guarantees:
- Users can only access files under their organization folder
- Cross‑tenant access is blocked at the database policy layer

### Folder roots (you created these as prefixes)
- `org_branding/` — organization assets (logos, stamps, signatures)
- `certificate_templates/` — uploaded templates + previews (versioned)
- `file_imports/` — uploaded CSV/XLSX (and optional normalized exports)
- `certificates/` — generated certificates (PDF + optional preview)
- `exports/` — bulk zip exports for jobs
- `deliveries/` — optional delivery artifacts (attachments/copies)
- `invoices/` — generated invoice PDFs

### Example structure for a single org
```
certificate_templates/<org_id>/<template_id>/v0001/source.pdf
certificate_templates/<org_id>/<template_id>/v0001/previews/preview.webp

file_imports/<org_id>/<import_job_id>/original.xlsx

certificates/<org_id>/<job_id>/<recipient_id>/<certificate_id>.pdf
exports/<org_id>/<job_id>/bulk.zip

deliveries/<org_id>/<delivery_message_id>/attachments/<file_id>.pdf

org_branding/<org_id>/logos/logo.webp
org_branding/<org_id>/stamps/stamp_1.png
org_branding/<org_id>/signatures/signature_1.png

invoices/<org_id>/<yyyy>/<mm>/XEN-<org_slug>-000001.pdf
```

### How “folders” work in Supabase Storage
Storage folders are **virtual**. You don’t truly “create a folder” — it appears automatically when you upload the first file with that prefix.
Creating empty placeholder objects is optional (you already created prefixes for clarity).

### Serving files safely
Recommended:
- Keep bucket private
- Generate **signed URLs** server‑side with short TTL for downloads/previews
- Never expose raw storage paths directly in the client

---

## 4) Schema overview

### 4.1 Table inventory (public schema)
These are the tables currently present in `public`:

- `app_audit_logs`
- `billing_credits_debits`
- `billing_invoice_items`
- `billing_invoices`
- `billing_orders`
- `billing_payments`
- `billing_periods`
- `billing_price_books`
- `billing_provider_events`
- `billing_refunds`
- `billing_usage_events`
- `certificate_categories`
- `certificate_generation_jobs`
- `certificate_subcategories`
- `certificate_template_fields`
- `certificate_template_versions`
- `certificate_templates`
- `certificate_verification_events`
- `certificates`
- `dashboard_stats_cache`
- `delivery_integration_secrets`
- `delivery_integrations`
- `delivery_message_items`
- `delivery_messages`
- `delivery_provider_webhook_events`
- `delivery_templates`
- `file_import_jobs`
- `file_import_rows`
- `files`
- `generation_job_recipients`
- `generation_job_templates`
- `industries`
- `invoice_line_items`
- `organization_invitations`
- `organization_members`
- `organization_pricing_overrides`
- `organization_roles`
- `organizations`
- `profiles`
- `role_permissions`

### 4.2 Enum inventory (public schema)
- `billing_invoice_status`
- `billing_line_item_type`
- `billing_order_status`
- `billing_payment_status`
- `billing_period_status`
- `billing_provider`
- `billing_refund_status`
- `certificate_status`
- `delivery_channel`
- `delivery_secret_type`
- `delivery_status`
- `file_kind`
- `import_status`
- `invite_status`
- `job_status`
- `member_status`
- `organization_billing_status`
- `provider_event_status`
- `template_field_type`
- `template_status`

### 4.3 Key helper functions (public schema)
Below are the most important functions/triggers you have in your database (business meaning, not internal Postgres helper functions):

- `after_invoice_item_change()`
- `append_audit_log()`
- `apply_payment_to_invoice()`
- `assert_period_open()`
- `can_issue_certificate()`
- `create_invoice_for_period()`
- `current_user_id()`
- `enforce_import_job_org()`
- `enforce_import_job_taxonomy()`
- `enforce_job_template_org()`
- `enforce_job_template_taxonomy()`
- `ensure_billing_period()`
- `ensure_billing_periods_for_month()`
- `generate_api_key()`
- `get_org_effective_pricing()`
- `get_user_role()`
- `handle_new_user()`
- `increment_template_version()`
- `is_member_of_org()`
- `mark_expired_certificates()`
- `next_certificate_number()`
- `next_invoice_number()`
- `prevent_environment_downgrade()`
- `recompute_invoice_totals()`
- `record_certificate_usage_event()`
- `revoke_certificate()`
- `set_updated_at()`
- `sha256_hex()`
- `update_certificate_expiry_status()`
- `update_updated_at_column()`
- `validate_certificate_category_hierarchy()`
- `verify_api_key()`
- `verify_certificate()`

---

## 5) Detailed table documentation (purpose, columns, relationships)

### 5.1 Organizations, users, roles

#### `organizations`
**Purpose:** Tenant identity + org profile + billing defaults + numbering defaults.

Key columns:
- `id` — organization UUID; the tenant boundary.
- `name`, `business_name` — display/legal name.
- `email`, `phone` — org contact details.
- `slug` — unique org slug (used for invoice/cert numbering; also nice URLs).
- `application_id` — public identifier used for external integrations.
- `api_key_hash` (or equivalent) — hashed API key (never store raw).
- `industry_id` (recommended / if present) — chosen industry; used to drive available categories.
- Address fields — billing/compliance.
- Certificate numbering config (if present): prefix/format.
- Billing/trial fields (if present): trial window, free cert limit, billing status.
- `created_at`, `updated_at`, `deleted_at`.

Relationships:
- 1 organization → many templates/import jobs/jobs/certificates/deliveries/invoices/billing events.
- Access is enforced via `organization_members` + RLS.

#### `profiles`
**Purpose:** App-visible user profile. One row per authenticated user.

Typical columns:
- `id` — equals `auth.users.id` (UUID).
- `first_name`, `last_name` (and optional display fields).
- `created_at`, `updated_at`.

**Not stored here:** passwords (Supabase Auth).

#### `organization_members`
**Purpose:** Membership mapping (user ↔ organization) + username + role assignment.

Typical columns:
- `id`
- `organization_id`
- `user_id` — `auth.users.id`
- `username` — unique per organization.
- `role_id` — FK to `organization_roles`.
- `status` — membership state (enum).
- `created_at`, `updated_at`, `deleted_at`.

RLS:
- Used by `is_member_of_org()` and most policies.

#### `organization_invitations`
**Purpose:** Track invitations for teammates (and allow resends/expiry).

Typical columns:
- `id`
- `organization_id`
- `email` — invited email.
- `role_id` — invited role.
- `status` — invite status enum.
- `token_hash` (if present) — hashed invite token.
- `expires_at`
- timestamps

#### `organization_roles`
**Purpose:** Role definitions per org (owner/admin/member, and future custom roles).

Typical columns:
- `id`
- `organization_id`
- `key` — stable identifier (`owner`, `admin`, `member`, …).
- `name` — display label.
- `is_system` — true for default roles.
- timestamps

#### `role_permissions`
**Purpose:** Permission keys per role (future-proof RBAC).

Typical columns:
- `role_id`
- `permission` — string key like `billing.manage`, `certificates.download`, `deliveries.send`, …
- Composite PK `(role_id, permission)`.

---

### 5.2 Taxonomy (industry → categories → subcategories)

These tables are typically global reference data; RLS is disabled (readable to all).

#### `industries`
**Purpose:** Industry grouping (start with edtech; expand later).

Columns:
- `id`
- `key` — stable slug like `edtech`
- `name` — label like `Education`
- `created_at`

#### `certificate_categories`
**Purpose:** Category list inside an industry.

Columns:
- `id`
- `industry_id` — FK → `industries.id`
- `key` — stable slug (`course_completion`, `training_certificate`, …)
- `name` — display name
- `created_at`

Indexes:
- `(industry_id, key)` unique
- `idx_cert_cat_industry` for fast filter

#### `certificate_subcategories`
**Purpose:** Course/domain list inside a category.

Columns:
- `id`
- `category_id` — FK → `certificate_categories.id`
- `key` — stable slug (`web_development`, `ai`, …)
- `name`
- `created_at`

Indexes:
- `(category_id, key)` unique
- `idx_cert_subcat_cat`

> **Org-specific renames / add / delete:**  
> If you implemented org-scoped overrides for taxonomy (recommended), document them in a dedicated section (see “Org taxonomy customization” in Appendix).

---

### 5.3 Files + storage registry

#### `files`
**Purpose:** Canonical registry row for every storage object (uploads + generated artifacts).

Columns (business meaning):
- `id`
- `organization_id`
- `kind` (`file_kind`) — what this file represents (template source, template preview, import original, certificate pdf, invoice pdf, export zip, branding asset, etc.)
- `bucket` — should be `authentix`
- `path` — storage object path (must follow storage policy format)
- `mime_type` — content type used for download and validation
- `size_bytes` — optional (enforce quotas/monitoring)
- `original_name` — the user’s uploaded filename
- `checksum` / hash — optional integrity/dedup
- `created_by` — user who uploaded/generated (if present)
- `created_at`

Key constraints / indexes:
- Unique `(bucket, path)` to prevent duplicates.
- Indexes on `(organization_id, created_at desc)` and `(organization_id, kind)` for listing/filtering.

---

### 5.4 Templates + field versioning

#### `certificate_templates`
**Purpose:** Template container (stable identity across versions).

Typical columns:
- `id`
- `organization_id`
- `category_id`, `subcategory_id` — taxonomy binding
- `name` — UI name
- `status` (`template_status`) — draft/active/archived
- `current_version_id` or `current_version_number` (if present)
- timestamps

Indexes:
- org listings: `(organization_id, created_at desc)`
- filter: `(organization_id, category_id, subcategory_id)`

#### `certificate_template_versions`
**Purpose:** Every template update creates a new immutable version.

Typical columns:
- `id`
- `template_id`
- `version_number` (int) — incremented by trigger
- `source_file_id` — FK → `files.id` (uploaded template file)
- `preview_file_id` — FK → `files.id` (rendered preview)
- `meta`/`metadata` jsonb — page sizes, page count, etc.
- `created_at`

Indexes:
- unique `(template_id, version_number)`
- `idx_template_versions_template`

#### `certificate_template_fields`
**Purpose:** Field placement/config for a template version (versioned).

Typical columns:
- `id`
- `template_version_id`
- `field_key` — stable key used for import mapping (`recipient_name`, `course_name`, `custom_1`, …)
- `field_type` (`template_field_type`) — text/date/qrcode/image/etc
- `label` — user-friendly label (supports custom renames)
- `config` jsonb — coordinates, font, styling, QR design options, etc.
- `is_required`
- timestamps

Indexes:
- unique `(template_version_id, field_key)`
- `idx_template_fields_version`

---

### 5.5 Importing data

#### `file_import_jobs`
**Purpose:** One row per uploaded import file (CSV/XLSX) or manual batch.

Typical columns:
- `id`
- `organization_id`
- `category_id`, `subcategory_id`
- `status` (`import_status`)
- `original_file_id` — FK → `files.id`
- `summary` jsonb — totals, errors, mapping info
- `created_by`
- timestamps

Indexes:
- org list: `(organization_id, created_at desc)`
- filter: `(organization_id, category_id, subcategory_id)`

#### `file_import_rows`
**Purpose:** Store normalized rows for resend/debug/history.

Typical columns:
- `id`
- `import_job_id`
- `row_index` — row number; unique within job
- `data` jsonb — normalized record for generation
- `errors` jsonb — per-row validation issues (optional)
- `created_at`

Indexes:
- unique `(import_job_id, row_index)`
- `idx_file_import_rows_job`

---

### 5.6 Generation jobs + certificates

#### `certificate_generation_jobs`
**Purpose:** Track a bulk generation request (progress + grouping).

Typical columns:
- `id`
- `organization_id`
- `status` (`job_status`) — queued/processing/completed/failed
- `category_id`, `subcategory_id`
- `import_job_id` (recommended / if present) — link to the data batch
- `created_by`
- timestamps
- `options` jsonb — zip threshold, include previews, delivery options, etc.

Indexes:
- `(organization_id, created_at desc)`

#### `generation_job_templates`
**Purpose:** Attach **multiple templates** to one job (generate 2–4 certificate types per recipient).

Typical columns:
- `id`
- `job_id`
- `template_id`
- `template_version_id`
- `category_id`, `subcategory_id`
- `created_at`

Indexes:
- unique `(job_id, template_id, template_version_id)`
- `idx_job_templates_job`

#### `generation_job_recipients`
**Purpose:** The recipients list for a job (from import or manual entry).

Typical columns:
- `id`
- `job_id`
- `recipient_name`
- `recipient_email` (citext)
- `recipient_phone`
- `recipient_data` jsonb — all additional merge fields
- `created_at`

Indexes:
- `idx_job_recipients_job`

#### `certificates`
**Purpose:** One record per generated certificate (per recipient × per template).

Key columns:
- Identity:
  - `id`, `organization_id`, `generation_job_id`
  - `template_id`, `template_version_id`
  - `category_id`, `subcategory_id`
- Recipient:
  - `recipient_name`, `recipient_email`, `recipient_phone`
  - `recipient_data` jsonb
- Output files:
  - `certificate_file_id` → `files.id`
  - `certificate_preview_file_id` → `files.id`
- Numbering + lifecycle:
  - `certificate_number` (unique per org)
  - `issued_at`, `expires_at`
  - `status` (`certificate_status`)
  - `revoked_at`
  - `reissued_from_certificate_id` (FK self-reference)
- Verification:
  - `verification_token_hash` (hash only)
  - `verification_path` (e.g. `/v/<token>`)
  - `qr_payload_url` (full URL embedded in QR)
- `created_at`

Indexes (core):
- unique `(organization_id, certificate_number)`
- unique `verification_token_hash`
- filter indexes for org, category/subcategory, issued_at, recipient email/phone, expiry scan.

#### `certificate_verification_events`
**Purpose:** Track QR scans + verification activity.

Typical columns:
- `id`
- `organization_id`
- `certificate_id`
- `scanned_at`
- `ip_address`, `user_agent` (if present)
- `result` / `status_snapshot`
- `metadata` jsonb

Indexes:
- `(certificate_id, scanned_at desc)`
- `(organization_id, scanned_at desc)`

---

### 5.7 Deliveries (Email + WhatsApp)

#### `delivery_integrations`
**Purpose:** Org-level provider configuration (non-secret).

Typical columns:
- `id`
- `organization_id`
- `channel` (`delivery_channel`) — email / whatsapp
- `provider` — e.g. `meta_cloud`, `smtp`, `sendgrid`
- `display_name`
- `is_active`, `is_default`
- Email identity: `from_email`, `from_name`
- WhatsApp identity: `whatsapp_phone_number`, `whatsapp_phone_number_id`, `whatsapp_waba_id`
- `config` jsonb (non-secret)
- timestamps + `deleted_at`

Indexes:
- `(organization_id)`
- `(organization_id, channel)`
- unique default per org+channel (partial unique index).

RLS:
- org members can read
- org admins/owners can manage

#### `delivery_integration_secrets`
**Purpose:** Secret references stored in Supabase Vault.

Columns:
- `integration_id`
- `secret_type` (`delivery_secret_type`)
- `vault_secret_id` (UUID in vault schema)
- `created_at`

Security:
- **No client policies** recommended.
- Access should be **service role only**.

#### `delivery_templates`
**Purpose:** Message templates selectable in UI with preview.

Typical columns:
- `id`
- `organization_id`
- `channel`
- `name`
- `is_active`, `is_default`
- WhatsApp mapping: `whatsapp_template_name`, `whatsapp_language`
- Email: `email_subject`
- `body` (supports variables like `{recipient_name}`)
- `variables` jsonb (declared variable list)
- timestamps

RLS:
- org members can read
- org admins can manage

#### `delivery_messages`
**Purpose:** One delivery message per recipient per channel per job (not per certificate).

Typical columns:
- `id`
- `organization_id`
- `generation_job_id`
- `recipient_id` (FK → `generation_job_recipients.id`)
- `channel`
- `status` (`delivery_status`)
- Destination: `to_email`, `to_phone`
- Provider: `provider`, `provider_message_id`
- Timestamps: `queued_at`, `sent_at`, `delivered_at`, `read_at`, `failed_at`
- Error fields (if present)
- `created_at`

Indexes:
- org timeline `(organization_id, created_at desc)`
- per job `(generation_job_id, channel)`
- recipient lookup

#### `delivery_message_items`
**Purpose:** Attach multiple certificates/files to a single message (send 2–4 certs at once).

Typical columns:
- `id`
- `message_id` (FK → `delivery_messages`)
- `certificate_id` (FK → `certificates`, nullable)
- `file_id` (FK → `files`, nullable)
- `created_at`

Constraints:
- Unique `(message_id, certificate_id)` to prevent duplicates.

#### `delivery_provider_webhook_events`
**Purpose:** Store raw webhook events for audit/debug.

Columns:
- `id`
- `organization_id` (nullable if not resolved)
- `channel`
- `provider`
- `provider_message_id`
- `event_type`
- `payload` jsonb
- `received_at`

Indexes:
- `(organization_id, received_at desc)`
- `(provider, provider_message_id)`

---

### 5.8 Billing (trial + subscription + pay-per-certificate)

Billing is **pay-as-you-go + subscription**:
- Monthly platform fee (default 399 INR + GST)
- Per certificate fee (default 10 INR + GST)
- Pricing can be overridden per org
- Trial: 7 days + 10 free certificates (customizable per org)
- Invoice numbering: `XEN-<org_slug>-NNNNNN`

#### `billing_price_books`
**Purpose:** Default price book(s) (start with “startup”; expand later).

Typical columns:
- `id`
- `key` (e.g. `startup`)
- Currency + unit prices
- Default GST rate
- `created_at`

#### `organization_pricing_overrides`
**Purpose:** Org-specific pricing overrides (special deals).

Typical columns:
- `id`
- `organization_id`
- `effective_from`, `effective_to`
- override values: platform fee, waived flag, per certificate fee, gst override
- `created_at`

#### `billing_periods`
**Purpose:** Monthly billing periods per org.

Columns:
- `id`
- `organization_id`
- `period_start`, `period_end`
- `status` (`billing_period_status`)
- timestamps

Constraints:
- unique `(organization_id, period_start)`

#### `billing_usage_events`
**Purpose:** Metered usage (certificate generation).

Columns:
- `id`
- `organization_id`
- `period_id`
- `event_type` / usage type
- `certificate_id` (nullable)
- `occurred_at`
- `quantity`
- `metadata` jsonb

Indexes:
- org+period and org+time indexes.

#### `billing_invoices`
**Purpose:** Invoice header (one per period, plus ad-hoc invoices if needed).

Columns:
- `id`
- `organization_id`
- `period_id` (nullable)
- `invoice_number` (unique)
- `issue_date`
- `status` (`billing_invoice_status`)
- totals (subtotal/gst/total/paid/due)
- timestamps

Constraints:
- unique `invoice_number`
- unique `(organization_id, period_id)` when period_id not null.

#### `billing_invoice_items`
**Purpose:** Invoice line items.

Columns:
- `id`
- `invoice_id`
- `line_item_type` (`billing_line_item_type`)
- `description`
- `quantity`
- unit price + amount
- timestamps

Trigger:
- `after_invoice_item_change` recomputes totals.

#### `billing_orders`
**Purpose:** Provider order intent (Razorpay order).

Columns:
- `id`
- `organization_id`
- `razorpay_order_id` (unique)
- `amount_paise`, `currency`
- `status` (`billing_order_status`)
- `created_at`

#### `billing_payments`
**Purpose:** Captured payments.

Columns:
- `id`
- `organization_id`
- `razorpay_payment_id` (unique)
- amount + currency
- `status` (`billing_payment_status`)
- timestamps

#### `billing_refunds`
**Purpose:** Refund records.

Columns:
- `id`
- `organization_id`
- `razorpay_refund_id` (unique)
- amount + currency
- `status` (`billing_refund_status`)
- timestamps

#### `billing_provider_events`
**Purpose:** Raw billing webhooks (idempotency + audit).

Columns:
- `id`
- `organization_id`
- `provider` (`billing_provider`)
- `payload_hash` (unique)
- `payload` jsonb
- `status` (`provider_event_status`)
- `received_at`

#### `billing_credits_debits`
**Purpose:** Manual adjustments (credits/debits).

Columns:
- `id`
- `organization_id`
- amount + reason
- `created_at`

#### `invoice_line_items`
**Purpose:** Certificate-level invoice linkage (your schema includes both billing_* and invoice_line_items for certificate attribution).

Typical use:
- link `invoice_id` to `certificate_id` (nullable)
- provide detailed invoice table view
- indexed for certificate lookups

---

### 5.9 Analytics cache

#### `dashboard_stats_cache`
**Purpose:** Store precomputed dashboard numbers.

Columns:
- `organization_id` (PK)
- `stats` jsonb
- `computed_at`

RLS:
- RLS disabled is acceptable if you only access through backend; otherwise enable and add policies.

---

### 5.10 Security audit

#### `app_audit_logs`
**Purpose:** Minimal, security‑relevant audit trail.

Columns:
- `id`
- `organization_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `severity`
- `metadata` jsonb (no secrets)
- `created_at`

Indexes:
- `(organization_id, created_at desc)`
- `(action, created_at desc)`

Function:
- `append_audit_log(...)` for consistent inserts.

---

## 6) RLS & policies (how access is enforced)

### RLS enabled tables
You verified RLS is enabled on most business tables. Reference tables (`industries`, `certificate_categories`, `certificate_subcategories`) intentionally have RLS disabled.

### Policy model (high level)
- **Org members** can read most org-scoped tables
- **Admins/owners** can manage configuration tables (integrations/templates)
- **Service role** handles secrets + webhook ingestion + status updates

### Storage policies
Your `storage.objects` policies for bucket `authentix` enforce:
- authenticated users only
- object path must match allowed roots
- membership must match org UUID extracted from path via regex

---

## 7) Appendix — Operational queries (schema introspection)

When you want a complete “printout” of schema (tables/columns/indexes/policies/functions), run the schema export query you already used.
Keep it in your repo so anyone can verify state against this documentation.

**Quick columns query:**
```sql
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

**RLS + policies:**
```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;
```

---

## 8) What we intentionally do NOT store in public tables
- Passwords / password reset tokens (Supabase Auth)
- Raw provider secrets (stored encrypted via Supabase Vault; referenced by IDs)
- Raw certificate verification tokens (only hashes are stored)

---

## 9) Glossary
- **Template**: the original certificate design file.
- **Template version**: immutable snapshot of template + its fields config.
- **Generation job**: batch request to generate certificates.
- **Certificate**: one issued credential for one recipient for one template.
- **Delivery message**: one outbound WhatsApp/email record for one recipient (can attach multiple certificates).
- **Billing period**: one month per org, used for invoicing.
