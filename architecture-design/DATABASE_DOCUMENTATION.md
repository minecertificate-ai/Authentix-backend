# AUTHENTIX DATABASE + STORAGE DOCUMENTATION 

## 0) High-level goals the schema supports

Authentix is a **multi-tenant certificate generation platform** where each **organization** can:

* Upload certificate templates (PDF/DOCX/PPTX/images)
* Define fields (name, dates, QR, custom fields, etc.) with **versioning**
* Import recipients data (CSV/XLSX + manual in future)
* Generate certificates in bulk and store each generated certificate
* Send certificates via **WhatsApp / Email** with **delivery status tracking**
* Track certificate verification scans/events
* Track billing (trial, subscription, per-certificate usage, invoices, payments, refunds)
* Maintain security audit trails (who did what, when)

RLS is enabled on most public tables so tenants can only see their organization’s data.

---

## 1) Core tenant identity & access control

### 1.1 `organizations`

Represents a tenant/company using the platform.

Key columns (typical use):

* `id` (uuid): Primary identifier for multi-tenancy. Used everywhere as `organization_id`.
* `name`: Display name (e.g., “YHills”).
* `business_name`: Legal name (e.g., “YHills Pvt Ltd”).
* `email`, `phone`: Org contact details.
* `slug`: **Unique** org slug (you chose US spelling + 16-char style). Used for invoice numbers and clean identifiers.
* `application_id`: Unique “application id” used for external integrations (public identifier).
* `api_key_hash` or similar (if present): Stores hashed API key (never store raw).
* `organization_type` / `industry` fields (if present): Org domain (edtech/fintech/etc.)
* Address fields (line1/line2/city/state/postal/country/tax_id): billing + compliance.
* Billing status fields (e.g. `billing_status`, trial flags if present): used for gating usage.
* `certificate_prefix`, `certificate_number_format` (if present): Used by `next_certificate_number()` to generate certificate numbers like `XEN-<org_slug>-000001` or course-specific prefix.
* `created_at`, `updated_at`, `deleted_at`: lifecycle tracking.

Purpose:

* Single source of truth for org identity + billing configuration + certificate numbering defaults.

---

### 1.2 `profiles`

Maps user identity to application profile fields (Supabase Auth handles password).

Typical columns:

* `id` (uuid): **Same as `auth.users.id`**. (One-to-one mapping).
* `first_name`, `last_name`: User details.
* `email`: Usually mirrors auth email, used for display/search.
* `created_at`, `updated_at`: profile lifecycle.

Purpose:

* App-visible user metadata.
* **Passwords are not stored here** (handled by Supabase Auth).

---

### 1.3 `organization_members`

Links users to organizations with status + username + role reference.

Typical columns:

* `id`: membership row id.
* `organization_id`: tenant scope.
* `user_id`: Supabase auth user id.
* `username`: **Unique per organization** (supports “same username across different orgs”).
* `status`: membership state (active/invited/removed/etc).
* `role_id`: FK to `organization_roles`.
* `created_at`, `updated_at`, `deleted_at`.

Purpose:

* Multi-tenant membership model.
* Used by RLS helper functions like `is_member_of_org()` and policy checks.

---

### 1.4 `organization_invitations`

Tracks invited teammates.

Typical columns:

* `id`
* `organization_id`
* `email` (citext): invite target email.
* `role_id` or role key reference: requested role for invited user.
* `status` (invite_status enum): pending/accepted/expired/etc.
* `token_hash` (if present): secure invite token hash (never store token raw).
* `expires_at`: invitation TTL.
* `created_at`, `updated_at`.

Purpose:

* Invite flow + audit trail for onboarding.

---

### 1.5 `organization_roles` and `role_permissions`

Role system for future-proof access control.

`organization_roles` typical columns:

* `id`
* `organization_id`
* `key` (e.g. owner/admin/member)
* `name` (UI display)
* `is_system`: true for built-in roles
* timestamps

`role_permissions` typical columns:

* `role_id`
* `permission` (string permission key, e.g. `billing.manage`, `certificates.download`)
* Composite PK (role_id, permission)

Purpose:

* Flexible RBAC: roles can evolve without schema redesign.

---

## 2) Taxonomy (Industry → Category → Subcategory)

These are reference tables (RLS disabled is okay if they’re global/static).

### 2.1 `industries`

Columns:

* `id`
* `key` (unique, constrained pattern like `edtech`)
* `name`
* `created_at`

Purpose:

* Allows expanding beyond edtech later.

---

### 2.2 `certificate_categories`

Columns:

* `id`
* `industry_id` (FK)
* `key` (unique per industry)
* `name`
* `created_at`

Purpose:

* Certificate “type” grouping (course_completion/training/internship/etc).

---

### 2.3 `certificate_subcategories`

Columns:

* `id`
* `category_id` (FK)
* `key` (unique per category)
* `name`
* `created_at`

Purpose:

* Course/domain grouping inside categories (web_dev, data_science, etc).
* Used for filtering templates, imports, certificates, analytics.

---

## 3) Files and Storage mapping

### 3.1 `files`

Central registry for **every uploaded/generated file** stored in Supabase Storage.

Typical columns:

* `id`: file record id.
* `organization_id`: tenant scope.
* `kind` (file_kind enum): what the file represents (template_source, template_preview, import_original, certificate_pdf, invoice_pdf, etc).
* `bucket`: should be `authentix` for new storage.
* `path`: object path in bucket (e.g. `certificate_templates/<org_id>/<template_id>/v0001/source.pdf`).
* `mime_type`: stored for safety / correct downloads.
* `size_bytes`: optional, used for validation/monitoring.
* `checksum` / `hash` if present: tamper detection/dedup.
* `original_name`: original filename (sanitized).
* `created_by`: user id that uploaded/created it (if present).
* `created_at`

Purpose:

* One place to attach storage objects to business entities safely.
* Enables audit, cleanup, and signed URL serving.

---

### 3.2 Storage bucket: `authentix`

Bucket is private and access is controlled by RLS policies on `storage.objects`.

#### Required path convention enforced by policy

Object name must match:
`^(org_branding|certificate_templates|file_imports|certificates|exports|deliveries|invoices)/<org_uuid>/...`

That means every stored object is scoped by org UUID.

---

## 4) Certificate templates & versioning

### 4.1 `certificate_templates`

Represents a template “container” under an org.

Typical columns:

* `id`
* `organization_id`
* `category_id`, `subcategory_id`: taxonomy binding (critical).
* `name`: template display name.
* `status` (template_status enum): draft/active/archived/etc.
* `current_version_id` or current version number (if present)
* `created_at`, `updated_at`, `deleted_at`

Purpose:

* Stable template identity across revisions.
* Filters and permissions at org/category/subcategory level.

---

### 4.2 `certificate_template_versions`

Each update creates a new version record.

Typical columns:

* `id`
* `template_id`
* `version_number` (incremented by trigger `increment_template_version`)
* `source_file_id` (FK to `files`): the uploaded PDF/DOCX/PPTX/image.
* `preview_file_id` (FK to `files`): generated preview image/webp.
* `metadata` jsonb: template settings at that version (page count, canvas size, etc).
* `created_at`

Purpose:

* You can see history and later support revert/compare.

---

### 4.3 `certificate_template_fields`

Stores the “design fields” a user placed for a template version.

Typical columns:

* `id`
* `template_version_id`
* `field_key`: stable key used in imports and mapping (e.g. `recipient_name`, `course_name`, `custom_1`)
* `field_type` (template_field_type enum): text/date/qrcode/image/etc.
* `label`: user-friendly label shown in UI (important for renamed custom fields).
* `config` jsonb: coordinates, font size, alignment, QR options, etc.
* `is_required`
* `created_at`, `updated_at`

Purpose:

* Drives both sample import files and generation pipeline.
* Versioned so old generated certificates can reference exact settings.

---

## 5) Importing data

### 5.1 `file_import_jobs`

One record per uploaded import file (CSV/XLSX) or manual batch in future.

Typical columns:

* `id`
* `organization_id`
* `category_id`, `subcategory_id`: ensures import is tied to taxonomy.
* `template_id` / `template_version_id` (if present): optional but useful to tie import directly.
* `status` (import_status enum): uploaded/processing/ready/failed/etc.
* `original_file_id` (FK to `files`): points to uploaded CSV/XLSX.
* `summary` jsonb: counts, errors.
* `created_by`
* `created_at`, `updated_at`

Purpose:

* Tracks lifecycle of “data upload” step.
* Makes “Imported Data” dashboard possible.

---

### 5.2 `file_import_rows`

Stores normalized rows from import for resend/debug/history.

Typical columns:

* `id`
* `import_job_id`
* `row_index`: row number (unique per job).
* `data` jsonb: normalized key/value pair data.
* `errors` jsonb: row validation errors if any.
* `created_at`

Purpose:

* Enables resend / re-generate without re-uploading file.
* Enables previewing top N rows in UI.

---

## 6) Certificate generation & certificates

### 6.1 `certificate_generation_jobs`

Represents a batch generation request.

Typical columns:

* `id`
* `organization_id`
* `status` (job_status enum): queued/processing/completed/failed.
* `category_id`, `subcategory_id`: taxonomy for this job.
* `created_by`
* `created_at`, `updated_at`
* `options` jsonb: generation options (zip threshold, include previews, etc).

Purpose:

* Tracks progress + links all outputs.

---

### 6.2 `generation_job_templates`

Allows **one job to generate multiple certificate types/templates at once**.

Typical columns:

* `id`
* `job_id`
* `template_id`
* `template_version_id`
* `category_id`, `subcategory_id` (enforced by triggers like `enforce_job_template_taxonomy`)
* `created_at`

Purpose:

* Supports your requirement: for a single candidate generate **course + training + internship** in one run.

---

### 6.3 `generation_job_recipients`

Stores recipients for the job (from import rows or manual entry).

Typical columns:

* `id`
* `job_id`
* `recipient_name`
* `recipient_email` (citext)
* `recipient_phone`
* `recipient_data` jsonb: full row data (course, dates, custom fields, etc)
* `created_at`

Purpose:

* Central recipient list to generate certificates and send messages.

---

### 6.4 `certificates`

One row per generated certificate (per recipient per template).

Key columns (as in your design):

* `id`
* `organization_id`
* `generation_job_id`
* `template_id`
* `template_version_id`
* `category_id`, `subcategory_id`

Recipient identity:

* `recipient_name`
* `recipient_email`
* `recipient_phone`
* `recipient_data` jsonb (extra fields used during render)

Output files:

* `certificate_file_id` (FK files): final PDF
* `certificate_preview_file_id` (FK files): preview image/webp (optional)

Numbering & lifecycle:

* `certificate_number`: unique per org
* `issued_at`
* `expires_at` (nullable)
* `status` (certificate_status enum): issued/revoked/expired/etc
* `revoked_at`
* `reissued_from_certificate_id`: chain of reissues

Verification:

* `verification_token_hash`: hash of secret token
* `verification_path`: relative path like `/v/<token>`
* `qr_payload_url`: absolute URL encoded into QR

Purpose:

* Single authoritative record for validity, storage, verification, status, and history.

---

### 6.5 `certificate_verification_events`

Stores scans/verify actions for analytics and security.

Typical columns:

* `id`
* `organization_id`
* `certificate_id`
* `scanned_at`
* `ip_address` / `user_agent` (if present)
* `result` / status snapshot (verified/invalid/revoked)
* `metadata` jsonb

Purpose:

* “Verification logs” dashboard section.
* Helps detect abuse or suspicious scanning.

---

## 7) Deliveries (Email + WhatsApp) tracking

### 7.1 `delivery_integrations`

Per-organization provider configuration (NON-secret parts).

Typical columns:

* `id`
* `organization_id`
* `channel` (delivery_channel enum): email/whatsapp
* `provider`: string key like `meta_cloud`, `smtp`, `sendgrid`
* `display_name`
* `is_active`
* `is_default` (unique per org+channel)
* Email identity: `from_email`, `from_name`
* WhatsApp identity: `whatsapp_phone_number`, `whatsapp_phone_number_id`, `whatsapp_waba_id`
* `config` jsonb: non-secret settings
* timestamps including `deleted_at`

Purpose:

* Lets org configure which WhatsApp/email provider to use.
* Safe to read in UI (no secrets).

---

### 7.2 `delivery_integration_secrets`

Secret references for integrations (tokens/passwords) using Vault.

Typical columns:

* `integration_id`
* `secret_type` (delivery_secret_type enum): whatsapp_access_token, smtp_password, etc.
* `vault_secret_id`: UUID of secret stored in Vault
* `created_at`

Purpose:

* Keeps secrets encrypted and out of public tables.
* Typically accessed only by backend service role.

---

### 7.3 `delivery_templates`

WhatsApp and Email message templates selectable in UI.

Typical columns:

* `id`
* `organization_id`
* `channel` (email/whatsapp)
* `name`
* `is_active`
* `is_default` (unique per org+channel)
* WhatsApp mapping: `whatsapp_template_name`, `whatsapp_language`
* Email: `email_subject`
* `body`: content with variables (e.g. `{{recipient_name}}`)
* `variables` jsonb: declared variable list for validation/preview
* `created_at`, `updated_at`

Purpose:

* Allows “choose template + preview + send”.

---

### 7.4 `delivery_messages`

One message per recipient per channel per job (NOT per certificate).

Typical columns:

* `id`
* `organization_id`
* `generation_job_id`
* `recipient_id` (FK to generation_job_recipients or equivalent)
* `channel`
* `status` (delivery_status enum): queued/sent/delivered/read/failed
* `to_email`, `to_phone`
* `provider`, `provider_message_id`
* Timestamps: `queued_at`, `sent_at`, `delivered_at`, `read_at`, `failed_at`
* `error` / `failure_reason` (if present)
* `created_at`

Purpose:

* UI “WhatsApp Messages” and “Email Messages” history page.
* Supports status tracking from provider webhooks.

---

### 7.5 `delivery_message_items`

Links a `delivery_message` to **multiple certificates/files**, enabling:

> send 2–4 certificates to the same recipient in ONE WhatsApp/email.

Typical columns:

* `id`
* `message_id` (FK delivery_messages)
* `certificate_id` (FK certificates) — optional if attachment is not a certificate
* `file_id` (FK files) — for attachments
* Unique constraint `(message_id, certificate_id)` prevents duplicates
* `created_at`

Purpose:

* Supports “send all certificates at once” requirement.

---

### 7.6 `delivery_provider_webhook_events`

Stores raw webhook events from providers (minimal audit/debug, not “over logging”).

Typical columns:

* `id`
* `organization_id` (nullable if unknown)
* `channel`
* `provider`
* `provider_message_id`
* `event_type` (sent/delivered/read/failed)
* `payload` jsonb
* `received_at`

Purpose:

* Proof and debugging when a user says “I didn’t get it”.
* Lets you reconcile statuses without spamming application logs.

---

## 8) Billing (Pay-as-you-go + subscription + trial)

This schema supports:

* Monthly platform subscription (default 399 INR + GST)
* Per-certificate fee (default 10 INR + GST, only when certificate is generated)
* Org-specific pricing overrides
* Trial: 7 days + 10 free certificates (and customizable per org later)
* Razorpay-based payments + provider event tracking
* Invoice numbering: `XEN-<org_slug>-NNNNNN`

### 8.1 `billing_price_books`

Defines named pricing plans (even if you have only one right now).

Typical columns:

* `id`
* `key` (e.g. `startup`)
* currency fields and base pricing values
* `created_at`

Purpose:

* Central default pricing that applies to all orgs unless overridden.

---

### 8.2 `organization_pricing_overrides`

Allows you (admin) to override pricing per org.

Typical columns:

* `id`
* `organization_id`
* effective dates (`effective_from`, `effective_to`)
* override values:

  * platform fee waived or custom
  * per certificate fee custom
  * gst rate override if needed
* `created_at`

Purpose:

* “Special deal per customer” support without code hacks.

---

### 8.3 `billing_periods`

One row per org per month billing period.

Typical columns:

* `id`
* `organization_id`
* `period_start` (date)
* `period_end` (date)
* `status` (billing_period_status enum): open/closed/invoiced/paid etc
* timestamps

Purpose:

* Normalizes monthly billing timeline and invoice grouping.

---

### 8.4 `billing_usage_events`

Usage signals (e.g., certificate generated) recorded as events.

Typical columns:

* `id`
* `organization_id`
* `period_id`
* event type (e.g. certificate_generated)
* `certificate_id` (nullable FK)
* `occurred_at`
* `quantity`
* metadata jsonb

Purpose:

* Drives per-certificate billing and auditability.

---

### 8.5 `billing_invoices` & `billing_invoice_items`

Invoice header and detailed line items.

`billing_invoices` typical columns:

* `id`
* `organization_id`
* `period_id` (nullable)
* `invoice_number` (unique) using format `XEN-<org_slug>-000001`
* `issue_date`
* `status` (billing_invoice_status enum)
* totals: subtotal, gst, total, paid amount, due amount
* `created_at`

`billing_invoice_items` typical columns:

* `id`
* `invoice_id`
* `line_item_type` (billing_line_item_type): subscription, per_certificate, credit, debit
* description
* quantity, unit price, amount
* `created_at`

Purpose:

* Produces invoice PDF + UI billing history.

---

### 8.6 `billing_orders`, `billing_payments`, `billing_refunds`

Provider payment lifecycle records (Razorpay).

`billing_orders`:

* org_id
* provider order id (`razorpay_order_id`)
* amount, currency
* status (billing_order_status)
* created_at

`billing_payments`:

* org_id
* provider payment id (`razorpay_payment_id`)
* amount, currency
* status (billing_payment_status)
* created_at

`billing_refunds`:

* org_id
* provider refund id (`razorpay_refund_id`)
* amount, status (billing_refund_status)
* created_at

Purpose:

* Payment reconciliation and proof.

---

### 8.7 `billing_provider_events`

Raw provider events (webhooks) to ensure idempotency + traceability.

Typical columns:

* `id`
* `organization_id`
* provider enum (billing_provider)
* `payload_hash` (unique) prevents double-processing
* payload jsonb
* status (provider_event_status)
* `received_at`

Purpose:

* Robust webhook ingestion and audit.

---

### 8.8 `billing_credits_debits`

Manual adjustments (credits/debits) applied to accounts.

Typical columns:

* `id`
* `organization_id`
* amount
* reason
* created_at

Purpose:

* Admin-driven billing corrections.

---

## 9) Analytics cache

### `dashboard_stats_cache`

A cached snapshot of dashboard stats to avoid heavy queries.

Typical columns:

* `organization_id` (PK)
* computed stats jsonb
* `computed_at`

Purpose:

* Makes dashboard “instant” without expensive aggregation every page load.

---

## 10) Security audit logging

### `app_audit_logs`

Lightweight, “required only” audit log table (not noisy).

Typical columns:

* `id`
* `organization_id`
* `actor_user_id`: who performed action
* `action`: e.g. `template.uploaded`, `billing.invoice_created`
* `entity_type`: table/entity category (template, certificate, invoice, etc)
* `entity_id`: uuid of target entity
* `severity`: info/warn/high
* `metadata` jsonb: minimal useful context (no secrets/PII)
* `created_at`

Purpose:

* Security and compliance tracking without application log spam.

---

## 11) Key public functions and what they are used for

* `current_user_id()`
  Returns the current authenticated user id (auth.uid wrapper used by policies).

* `get_user_role()`
  Returns role key for current user (used in RLS policies and authorization checks).

* `is_member_of_org(org_id)`
  Returns true if current user is an active member of that org. Used heavily in RLS and storage policies.

* `verify_api_key(provided_key)`
  Validates API key and returns org id (service-to-service auth support).

* `next_certificate_number(p_organization_id)`
  Generates next certificate number using org prefix/format rules.

* `next_invoice_number(p_org_id)`
  Generates invoice number in your chosen format: `XEN-<org_slug>-NNNNNN`.

* `verify_certificate(token)`
  Given verification token, returns certificate verification payload for public verification page.

* `mark_expired_certificates()`
  Maintenance function that marks expired certs as expired/revoked status as per your lifecycle.

* `revoke_certificate(p_certificate_id, p_revoked_by, p_reason)`
  Marks a certificate as revoked while preserving record for audit/history.

* Billing functions:

  * `get_org_effective_pricing(p_org_id, p_at)` → resolves default + overrides
  * `ensure_billing_period(...)`, `ensure_billing_periods_for_month(...)`
  * `create_invoice_for_period(...)`
  * `apply_payment_to_invoice(...)`
  * `recompute_invoice_totals(...)`

* Enforcement triggers:

  * `enforce_import_job_org`, `enforce_import_job_taxonomy`
    Ensures import jobs always match org/taxonomy constraints.
  * `enforce_job_template_org`, `enforce_job_template_taxonomy`
    Ensures templates attached to jobs belong to the org and match category hierarchy.
  * `validate_certificate_category_hierarchy`
    Ensures category/subcategory relationships stay correct.

---

## 12) Enums (important behavior switches)

You have enums for:

* Template: `template_status`, `template_field_type`
* Jobs/imports: `job_status`, `import_status`
* Membership/invite: `member_status`, `invite_status`
* Certificates: `certificate_status`
* Delivery: `delivery_channel`, `delivery_status`, `delivery_secret_type`
* Billing: invoice/order/payment/refund statuses + provider + line item types
* File classification: `file_kind`
* Org billing: `organization_billing_status`
* Provider events: `provider_event_status`

Purpose:

* Keeps status transitions consistent and queryable.

---

## 13) Storage: folder roots + what each root stores

Bucket: **`authentix`** (private)

Root folders (these must exist as prefixes; you already created them):

1. `org_branding/<org_id>/...`

   * logos: organization logo
   * stamps: stamp images
   * signatures: signature assets
   * optional: brand assets used in certificates/verification pages

2. `certificate_templates/<org_id>/...`

   * template source files (pdf/docx/pptx/images)
   * preview renders (webp/png)
   * organized by template_id and version

3. `file_imports/<org_id>/...`

   * original uploaded CSV/XLSX
   * normalized row exports if you choose to store them (jsonl/csv)

4. `certificates/<org_id>/...`

   * generated certificate outputs (pdf)
   * optional previews

5. `exports/<org_id>/...`

   * bulk zip exports for generation jobs

6. `deliveries/<org_id>/...`

   * message attachments if you store them separately
   * delivery artifacts (optional)

7. `invoices/<org_id>/...`

   * generated invoice PDFs named like `XEN-<org_slug>-000001.pdf`
   * organized by year/month if you want

### Storage access model

* Bucket is private.
* Access is allowed only when:

  * user is authenticated AND
  * object path matches allowed roots AND
  * `is_member_of_org(<org_id extracted from path>)` is true

This prevents cross-tenant access.

---

## 14) What is intentionally NOT stored in public tables

* **Passwords**: handled by Supabase Auth (hashing + reset flows).
* Raw provider secrets: stored in Vault and referenced by `delivery_integration_secrets`.
* Raw verification tokens: only hashes are stored (`verification_token_hash`).

---

