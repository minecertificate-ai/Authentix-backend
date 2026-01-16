

1) Storage (Supabase Storage)
Bucket: authentix (private)
Purpose: store all binary assets (PDFs, images, CSV/Excel imports, ZIP exports, branding images, etc.) securely per organization.
Current top-level folder roots (observed)
* certificate_templates/
* certificates/
* deliveries/
* exports/
* file_imports/
* invoices/
* org_branding/(+ you said profile not created yet — we’ll add it later when profile photo is added)
How storage is “tracked” in DB
You do not rely on storage paths alone.Instead, you store the canonical metadata in:
✅ public.filesand other tables reference files.id (foreign keys) to “attach” a file to a template/version/certificate/import/invoice/delivery attachment.
Why this is important:
* DB stays the source of truth (auditability, soft-delete, ownership by org)
* You can rotate paths/keys later without breaking data references
* Access control can be validated with DB + RLS logic

2) Core “Tenant / Auth / Access” Tables
profiles
What it stores: one row per authenticated user.
* Basic identity fields: first_name, last_name, email
* Soft delete + timestamps
Used in:
* user profile (/users/me)
* audit logs (app_audit_logs.actor_user_id)
* “created_by_user_id” across the system
Relations:
* profiles.id corresponds to auth.users.id
* organization_members.user_id -> profiles.id

organizations
What it stores: one row per tenant/company.
* Identity: name, legal_name, email, phone, website_url
* Branding pointer: logo_file_id
* Access identifiers: application_id, api_key_hash
* Certificate numbering controls: certificate_prefix, certificate_seq, certificate_number_format
* Billing/trial state: billing_status, trial_started_at, trial_ends_at, counters, pricing defaults
* Optional industry: industry_id
Used in:
* multi-tenant isolation for everything
* billing & trial enforcement
* certificate numbering / invoice numbering
* org settings screen
Relations:
* parent for almost all entities: templates, certificates, imports, billing, deliveries, logs, files

organization_roles
What it stores: role definitions per organization (owner/admin/member + future custom roles)
* key, name
* (should include is_system if your backend seeds it)
Used in:
* permissions/authorization checks (who can upload templates, issue certs, manage billing)
Relations:
* organization_members.role_id -> organization_roles.id
* role_permissions.role_id -> organization_roles.id

organization_members
What it stores: membership of users inside orgs.
* organization_id, user_id
* role_id
* status invited/active/suspended
* username (per-org identifier)
Used in:
* access gate for every org feature (templates/certs/imports/billing)
* RLS helper functions like is_member_of_org(org_id)

role_permissions
What it stores: “role → permission” mapping (fine-grained authorization)
* composite PK (role_id, permission)
Used in:
* permission checks for UI/Backend (ex: templates.delete, billing.manage, etc.)

organization_invitations
What it stores: invite flow to add people into an org
* invite token hash + status + expires_at
Used in:
* team management screens (invite members)
* accept invite endpoint (future)

3) Categories / Subcategories / Industry Customization
industries
What it stores: master list of industries (e.g. edutech now, more later)
Used in:
* deciding which default categories appear for an org

certificate_categories
What it stores: base categories (and org-specific categories if organization_id is set)
* required: industry_id, key, name
* optional grouping: group_key (UI dividers like “Course Certificates”, “Company Work”)
* optional ordering: sort_order
* optional organization_id (for org-created categories)
Used in:
* template upload screen (category dropdown)
* certificate generation configuration
* reporting/filtering/search

certificate_subcategories
What it stores: subcategories for a category (courses like AI/ML/HR/IOT, etc.)
* belongs to: category_id
* optional org-scoped (custom) + soft delete marker
Used in:
* template upload (subcategory dropdown after category selection)
* analytics and filtering

Overrides: allow per-org rename/hide without changing defaults
organization_category_overrides
What it stores: org-specific changes to a base category:
* rename (name_override)
* hide (is_hidden)
* ordering (sort_order)
organization_subcategory_overrides
Same concept for subcategories.
Used in:
* settings screen where org can rename/hide defaults
* effective lists shown to users

Views for “effective” UI lists
v_effective_categories
v_effective_subcategories
What they do: merge base + org custom + org overrides into what the UI should show.
Used in:
* category/subcategory dropdown endpoints
* avoids complicated merge logic in frontend

4) File Registry (Central for Storage)
files
What it stores: the canonical metadata for any storage object:
* org ownership: organization_id
* location: bucket, path
* classification: kind (template_source, template_preview, certificate_pdf, org_logo, etc.)
* metadata: original_name, mime_type, size_bytes, checksum_sha256
* soft delete marker
Used in:
* template files (source + preview)
* import source files
* generated certificate pdf + preview
* invoices pdf
* delivery attachments
* org logo and later profile pictures
Relations: referenced by:
* certificate_template_versions.source_file_id
* certificate_template_versions.preview_file_id
* certificates.certificate_file_id
* certificates.certificate_preview_file_id
* billing_invoices.pdf_file_id
* file_import_jobs.source_file_id
* delivery_message_items.attachment_file_id
* organizations.logo_file_id

5) Templates (Design Assets + Field Layout)
certificate_templates
What it stores: the “template entity”
* org-scoped
* category + subcategory
* title
* status (draft/active/archived)
* pointer to latest version (if you use versions)
Used in:
* templates section listing (cards)
* selecting template in generate flow

certificate_template_versions
What it stores: the actual uploaded design file + preview for a template
* version_number
* source_file_id, preview_file_id
* page_count, normalized_pages
* created_by
Used in:
* preview image shown in template cards
* keeping track of actual file for generation engine
Note: if your product decision is “no reupload/versioning”, you can still keep this table but only ever have 1 version per template (v1). Or you can simplify later. Right now your DB supports versioning.

certificate_template_fields
What it stores: the field placement on the template pages
* field_key, label, type (text/date/qrcode/custom)
* position: page_number, x, y, width, height
* style JSON
* required
Used in:
* “Design fields” step in generate flow
* reusing previous placements when user selects a recent-used template

View: v_templates_list
What it does: provides a single queryable listing of templates with their latest preview/source fields resolved.
Used in:
* templates page list endpoint (fast UI)
* generate-certificate “select existing template” list

6) Import Jobs (Upload Data to Generate Certificates)
file_import_jobs
What it stores: an uploaded file + mapping configuration for bulk recipients
* org, template, category, subcategory, version
* source_file_id (CSV/XLSX)
* mapping JSON (column mapping)
* counts: row_count/success_count/failed_count
* status lifecycle
Used in:
* generate-certificate flow (import stage)
* showing recent imports / saved data

file_import_rows
What it stores: parsed rows from import file (row-by-row status)
* raw data
* validation errors
* per-row status
Used in:
* debugging bad rows
* partial success handling

7) Generation & Issuance (Jobs + Certificates)
certificate_generation_jobs
What it stores: one “generate run”
* org, requested_by
* status + timing + error JSON
* options JSON
Used in:
* tracking bulk generation progress
* audit + billing usage events

generation_job_recipients
What it stores: recipients for a job
* name/email/phone + recipient_data JSON
Used in:
* delivery and certificate generation linking

generation_job_templates
What it stores: which template(s) were used in a job
* template_id + template_version_id + category/subcategory snapshot
Used in:
* multi-template generation cases
* reporting/history

certificates
What it stores: each issued certificate (the core product record)
* links: org, job, template, version, category, subcategory
* recipient identity and data
* files: certificate_file_id (PDF), certificate_preview_file_id
* certificate_number sequencing
* verification: token hash + verification_path + QR payload URL
* status lifecycle: issued/expired/revoked/reissued
Used in:
* certificates list UI
* download/preview
* verification page (public)
* billing usage tracking

certificate_verification_events
What it stores: each scan/verification attempt
* scanned_at, result, ip_hash, user_agent, metadata
Used in:
* analytics and fraud monitoring
* “recent verifications” widgets

Views for listing + verification
v_certificates_list
Used in: UI list screen of certificates with file paths resolved.
v_certificate_verification
Used in: verification endpoint/page (public) to show org name/logo, cert preview, status.

8) Delivery (Email/WhatsApp Sending + Tracking)
delivery_integrations
What it stores: the configured providers for an org (email/whatsapp)
* channel, provider, display_name
* default flags
* config JSON (non-secret)
* metadata like from_email, whatsapp ids
Used in:
* org settings (configure delivery)
* sending messages

delivery_integration_secrets
What it stores: secret references stored in Vault
* maps integration_id + secret_type → vault_secret_id
Used in:
* backend uses service role to fetch secret from vault at send time

delivery_templates
What it stores: message bodies per org/channel
* email subject/body or whatsapp template name/language
* variables JSON
Used in:
* certificate delivery content

delivery_messages
What it stores: one message send attempt to one recipient
* status timeline: queued/sent/delivered/read/failed
* provider_message_id + error fields
Used in:
* delivery tracking UI
* retries, reporting

delivery_message_items
What it stores: attachments/linked certificates for a message
* certificate_id, optional attachment_file_id

delivery_provider_webhook_events
What it stores: raw webhook payloads for delivery statuses
* used to update delivery_messages state safely

9) Billing (Trial → Paid + Invoices + Provider Events)
billing_price_books
What it stores: pricing plans (default and future plans)
billing_periods
What it stores: monthly billing window per org with pricing snapshot
billing_usage_events
What it stores: billable events (certificate issuance, etc.)
billing_invoices
What it stores: invoice header + totals + references to PDF file
billing_invoice_items
What it stores: invoice line items
billing_orders, billing_payments, billing_refunds
What they store: provider-specific order/payment/refund records
billing_provider_events + billing_provider_events_safe
What they store: webhook ingestion and safe view for UI/debug
billing_credits_debits
What it stores: adjustments applied to invoices
Used in:
* trial enforcement
* invoice generation
* payment reconciliation (Razorpay later)

10) Dashboard & Observability
dashboard_stats_cache
What it stores: precomputed org stats (counts) to avoid expensive queries.
Used in:
* dashboard load should rely on this to avoid N+1 and heavy counting.

app_audit_logs
What it stores: who did what, when
* actor_user_id, organization_id, action, metadata
Used in:
* org audit log page
* internal traceability

11) Key Relationships (High-Level)
Tenant backbone
* organizations is the root tenant entity.
* profiles is the user entity.
* organization_members links users to orgs and is used for access.
Templates
* certificate_templates (org) → certificate_template_versions → certificate_template_fields
Generation
* certificate_generation_jobs → generation_job_recipients + generation_job_templates → certificates
Files
* files is referenced by templates/certs/imports/invoices/delivery attachments/org logo.
Categories
* industries → certificate_categories → certificate_subcategories
* org-specific: overrides tables + effective views
Delivery
* delivery_integrations + delivery_integration_secrets + delivery_templates
* delivery_messages + delivery_message_items + delivery_provider_webhook_events
Billing
* billing_periods + billing_usage_events → billing_invoices + items
* provider events link to org and payment/order IDs

12) What goes in Storage vs DB (Rule of thumb)
DB stores:
* IDs, metadata, ownership, status, relationships
* anything you need to query/sort/filter/audit
Storage stores:
* binary artifacts: PDF/PNG/JPG/ZIP/CSV/XLSX
* never store secrets directly (secrets go to Vault, referenced by vault_secret_id)