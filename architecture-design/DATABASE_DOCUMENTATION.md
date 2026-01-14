# AUTHENTIX DATABASE + STORAGE DOCUMENTATION (DETAILED)

Last updated: 2026-01-14
Sources: Supabase PostgREST OpenAPI (/rest/v1) and Storage REST (/storage/v1).

## Overview
- Supabase project: https://brkyyeropjslfzwnhxcw.supabase.co
- Tables (public schema): 43
- Views (public schema): 5
- RPC functions (public schema): 24
- Storage buckets: 1

## Schemas
- public: application data (detailed below).
- Other schemas are not exposed via PostgREST in this environment.
- To list all schemas from SQL, run:
  - SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;

## Storage
### Bucket: authentix
- id: authentix
- name: authentix
- public: false
- type: STANDARD
- file_size_limit: 52428800 bytes
- allowed_mime_types: application/pdf, text/csv, application/zip, application/json, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.presentationml.presentation, image/png, image/jpeg, image/webp, image/gif, image/svg+xml, image/heic, image/heif, image/tiff, image/bmp, image/avif
- created_at: 2026-01-11T10:39:04.502Z
- updated_at: 2026-01-11T10:39:04.502Z

Observed object count: 7
Observed folder roots:
- certificate_templates
- certificates
- deliveries
- exports
- file_imports
- invoices
- org_branding

### File registry (media mapping)
- Canonical file metadata lives in `files` (bucket, path, kind, mime_type, size).
- Tables referencing `files.id`:
  - billing_invoices.pdf_file_id
  - certificate_template_versions.preview_file_id
  - certificate_template_versions.source_file_id
  - certificates.certificate_file_id
  - certificates.certificate_preview_file_id
  - delivery_message_items.attachment_file_id
  - file_import_jobs.source_file_id
  - v_certificate_verification.certificate_preview_file_id
  - v_certificates_list.certificate_file_id
  - v_certificates_list.certificate_preview_file_id
  - v_templates_list.latest_preview_file_id
  - v_templates_list.latest_source_file_id
- Storage-related columns (bucket/path/file references):
  - billing_invoices.pdf_file_id
  - certificate_template_versions.preview_file_id
  - certificate_template_versions.source_file_id
  - certificates.certificate_file_id
  - certificates.certificate_preview_file_id
  - certificates.verification_path
  - delivery_message_items.attachment_file_id
  - file_import_jobs.source_file_id
  - files.bucket
  - files.path
  - organizations.logo_file_id
  - v_certificate_verification.certificate_preview_file_id
  - v_certificate_verification.logo_bucket
  - v_certificate_verification.logo_file_id
  - v_certificate_verification.logo_path
  - v_certificate_verification.preview_bucket
  - v_certificate_verification.preview_path
  - v_certificate_verification.verification_path
  - v_certificates_list.certificate_bucket
  - v_certificates_list.certificate_file_id
  - v_certificates_list.certificate_path
  - v_certificates_list.certificate_preview_file_id
  - v_certificates_list.preview_bucket
  - v_certificates_list.preview_path
  - v_certificates_list.verification_path
  - v_templates_list.latest_preview_file_id
  - v_templates_list.latest_source_file_id
  - v_templates_list.preview_bucket
  - v_templates_list.preview_path

## Schema inventory (public)
### Tables
- app_audit_logs
- billing_credits_debits
- billing_invoice_items
- billing_invoices
- billing_orders
- billing_payments
- billing_periods
- billing_price_books
- billing_provider_events
- billing_provider_events_safe
- billing_refunds
- billing_usage_events
- certificate_categories
- certificate_generation_jobs
- certificate_subcategories
- certificate_template_fields
- certificate_template_versions
- certificate_templates
- certificate_verification_events
- certificates
- dashboard_stats_cache
- delivery_integration_secrets
- delivery_integrations
- delivery_message_items
- delivery_messages
- delivery_provider_webhook_events
- delivery_templates
- file_import_jobs
- file_import_rows
- files
- generation_job_recipients
- generation_job_templates
- industries
- invoice_line_items
- organization_category_overrides
- organization_invitations
- organization_members
- organization_pricing_overrides
- organization_roles
- organization_subcategory_overrides
- organizations
- profiles
- role_permissions

### Views
- v_certificate_verification
- v_certificates_list
- v_effective_categories
- v_effective_subcategories
- v_templates_list

## Relationships (foreign keys)
- app_audit_logs.actor_user_id -> profiles.id
- app_audit_logs.organization_id -> organizations.id
- billing_credits_debits.applied_to_invoice_id -> billing_invoices.id
- billing_credits_debits.organization_id -> organizations.id
- billing_invoice_items.invoice_id -> billing_invoices.id
- billing_invoices.organization_id -> organizations.id
- billing_invoices.pdf_file_id -> files.id
- billing_invoices.period_id -> billing_periods.id
- billing_orders.invoice_id -> billing_invoices.id
- billing_orders.organization_id -> organizations.id
- billing_payments.invoice_id -> billing_invoices.id
- billing_payments.organization_id -> organizations.id
- billing_periods.organization_id -> organizations.id
- billing_provider_events_safe.organization_id -> organizations.id
- billing_provider_events.organization_id -> organizations.id
- billing_refunds.organization_id -> organizations.id
- billing_usage_events.certificate_id -> certificates.id
- billing_usage_events.organization_id -> organizations.id
- billing_usage_events.period_id -> billing_periods.id
- certificate_categories.industry_id -> industries.id
- certificate_categories.organization_id -> organizations.id
- certificate_generation_jobs.organization_id -> organizations.id
- certificate_generation_jobs.requested_by_user_id -> profiles.id
- certificate_subcategories.category_id -> certificate_categories.id
- certificate_subcategories.organization_id -> organizations.id
- certificate_template_fields.template_version_id -> certificate_template_versions.id
- certificate_template_versions.created_by_user_id -> profiles.id
- certificate_template_versions.preview_file_id -> files.id
- certificate_template_versions.source_file_id -> files.id
- certificate_template_versions.template_id -> certificate_templates.id
- certificate_templates.category_id -> certificate_categories.id
- certificate_templates.created_by_user_id -> profiles.id
- certificate_templates.latest_version_id -> certificate_template_versions.id
- certificate_templates.organization_id -> organizations.id
- certificate_templates.subcategory_id -> certificate_subcategories.id
- certificate_verification_events.certificate_id -> certificates.id
- certificate_verification_events.organization_id -> organizations.id
- certificates.category_id -> certificate_categories.id
- certificates.certificate_file_id -> files.id
- certificates.certificate_preview_file_id -> files.id
- certificates.generation_job_id -> certificate_generation_jobs.id
- certificates.organization_id -> organizations.id
- certificates.reissued_from_certificate_id -> certificates.id
- certificates.revoked_by_user_id -> profiles.id
- certificates.subcategory_id -> certificate_subcategories.id
- certificates.template_id -> certificate_templates.id
- certificates.template_version_id -> certificate_template_versions.id
- dashboard_stats_cache.organization_id -> organizations.id
- delivery_integration_secrets.integration_id -> delivery_integrations.id
- delivery_integrations.organization_id -> organizations.id
- delivery_message_items.attachment_file_id -> files.id
- delivery_message_items.certificate_id -> certificates.id
- delivery_message_items.message_id -> delivery_messages.id
- delivery_messages.generation_job_id -> certificate_generation_jobs.id
- delivery_messages.organization_id -> organizations.id
- delivery_messages.recipient_id -> generation_job_recipients.id
- delivery_provider_webhook_events.organization_id -> organizations.id
- delivery_templates.organization_id -> organizations.id
- file_import_jobs.category_id -> certificate_categories.id
- file_import_jobs.created_by_user_id -> profiles.id
- file_import_jobs.organization_id -> organizations.id
- file_import_jobs.source_file_id -> files.id
- file_import_jobs.subcategory_id -> certificate_subcategories.id
- file_import_jobs.template_id -> certificate_templates.id
- file_import_jobs.template_version_id -> certificate_template_versions.id
- file_import_rows.import_job_id -> file_import_jobs.id
- files.created_by_user_id -> profiles.id
- files.organization_id -> organizations.id
- generation_job_recipients.job_id -> certificate_generation_jobs.id
- generation_job_templates.category_id -> certificate_categories.id
- generation_job_templates.job_id -> certificate_generation_jobs.id
- generation_job_templates.subcategory_id -> certificate_subcategories.id
- generation_job_templates.template_id -> certificate_templates.id
- generation_job_templates.template_version_id -> certificate_template_versions.id
- organization_category_overrides.base_category_id -> certificate_categories.id
- organization_category_overrides.organization_id -> organizations.id
- organization_invitations.invited_by_user_id -> profiles.id
- organization_invitations.organization_id -> organizations.id
- organization_invitations.role_id -> organization_roles.id
- organization_members.organization_id -> organizations.id
- organization_members.role_id -> organization_roles.id
- organization_members.user_id -> profiles.id
- organization_pricing_overrides.organization_id -> organizations.id
- organization_roles.organization_id -> organizations.id
- organization_subcategory_overrides.base_subcategory_id -> certificate_subcategories.id
- organization_subcategory_overrides.organization_id -> organizations.id
- organizations.industry_id -> industries.id
- role_permissions.role_id -> organization_roles.id
- v_certificate_verification.certificate_preview_file_id -> files.id
- v_certificate_verification.organization_id -> organizations.id
- v_certificates_list.category_id -> certificate_categories.id
- v_certificates_list.certificate_file_id -> files.id
- v_certificates_list.certificate_preview_file_id -> files.id
- v_certificates_list.organization_id -> organizations.id
- v_certificates_list.subcategory_id -> certificate_subcategories.id
- v_certificates_list.template_id -> certificate_templates.id
- v_certificates_list.template_version_id -> certificate_template_versions.id
- v_effective_subcategories.category_id -> certificate_categories.id
- v_templates_list.category_id -> certificate_categories.id
- v_templates_list.latest_preview_file_id -> files.id
- v_templates_list.latest_source_file_id -> files.id
- v_templates_list.latest_version_id -> certificate_template_versions.id
- v_templates_list.organization_id -> organizations.id
- v_templates_list.subcategory_id -> certificate_subcategories.id

## Tables (public)
### `app_audit_logs`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (FK -> organizations.id)
- actor_user_id: uuid (FK -> profiles.id)
- actor_ip_hash: text
- action: text (required)
- entity_type: text
- entity_id: uuid
- severity: text (required, default: info)
- metadata: jsonb
- created_at: timestamp with time zone (required, default: now())

### `billing_credits_debits`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- amount_paise: bigint (required)
- reason: text (required)
- applied_to_invoice_id: uuid (FK -> billing_invoices.id)
- created_at: timestamp with time zone (required, default: now())

### `billing_invoice_items`
- id: uuid (required, PK, default: gen_random_uuid())
- invoice_id: uuid (required, FK -> billing_invoices.id)
- item_type: public.billing_line_item_type (required, enum: platform_fee|certificate_usage|adjustment)
- description: text (required)
- quantity: integer (required, default: 1)
- unit_price_paise: bigint (required)
- amount_paise: bigint (required)
- tax_paise: bigint (required)
- metadata: jsonb (required)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())

### `billing_invoices`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- invoice_number: text (required)
- status: public.billing_invoice_status (required, default: draft, enum: draft|issued|paid|partially_paid|void|expired|refunded)
- currency: text (required, default: INR)
- issue_date: date (required, default: (now()))
- due_date: date
- subtotal_paise: bigint (required, default: 0)
- tax_paise: bigint (required, default: 0)
- total_paise: bigint (required, default: 0)
- amount_paid_paise: bigint (required, default: 0)
- amount_due_paise: bigint (required, default: 0)
- period_id: uuid (FK -> billing_periods.id)
- bill_to: jsonb (required)
- seller_snapshot: jsonb (required)
- pdf_file_id: uuid (FK -> files.id)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())

### `billing_orders`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- provider: public.billing_provider (required, default: razorpay, enum: razorpay)
- razorpay_order_id: text (required)
- receipt: text
- invoice_id: uuid (FK -> billing_invoices.id)
- currency: text (required, default: INR)
- amount_paise: bigint (required)
- status: public.billing_order_status (required, default: created, enum: created|paid|attempted|failed|cancelled)
- notes: jsonb (required)
- created_at: timestamp with time zone (required, default: now())

### `billing_payments`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- provider: public.billing_provider (required, default: razorpay, enum: razorpay)
- razorpay_payment_id: text (required)
- razorpay_order_id: text
- invoice_id: uuid (FK -> billing_invoices.id)
- currency: text (required, default: INR)
- amount_paise: bigint (required)
- status: public.billing_payment_status (required, enum: created|authorized|captured|failed|refunded)
- method: text
- email: public.citext
- contact: text
- authorized_at: timestamp with time zone
- captured_at: timestamp with time zone
- raw: jsonb (required)
- created_at: timestamp with time zone (required, default: now())

### `billing_periods`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- period_start: date (required)
- period_end: date (required)
- status: public.billing_period_status (required, default: open, enum: open|locked|invoiced|paid|void)
- currency: text (required, default: INR)
- platform_fee_monthly_paise: bigint (required)
- platform_fee_waived: boolean (required, default: false)
- per_certificate_fee_paise: bigint (required)
- gst_rate_bps: integer (required)
- created_at: timestamp with time zone (required, default: now())

### `billing_price_books`
- id: uuid (required, PK, default: gen_random_uuid())
- key: text (required)
- name: text (required)
- currency: text (required, default: INR)
- platform_fee_monthly_paise: bigint (required)
- per_certificate_fee_paise: bigint (required)
- gst_rate_bps: integer (required)
- is_default: boolean (required, default: false)
- is_active: boolean (required, default: true)
- created_at: timestamp with time zone (required, default: now())

### `billing_provider_events`
- id: uuid (required, PK, default: gen_random_uuid())
- provider: public.billing_provider (required, default: razorpay, enum: razorpay)
- event_name: text (required)
- payload_hash: text (required)
- signature_header: text
- is_signature_valid: boolean (required, default: false)
- status: public.provider_event_status (required, default: received, enum: received|verified|processed|ignored|failed)
- received_at: timestamp with time zone (required, default: now())
- processed_at: timestamp with time zone
- processing_error: text
- organization_id: uuid (FK -> organizations.id)
- razorpay_order_id: text
- razorpay_payment_id: text
- razorpay_refund_id: text
- payload: jsonb (required)

### `billing_provider_events_safe`
- id: uuid (PK)
- provider: public.billing_provider (enum: razorpay)
- event_name: text
- status: public.provider_event_status (enum: received|verified|processed|ignored|failed)
- received_at: timestamp with time zone
- processed_at: timestamp with time zone
- processing_error: text
- organization_id: uuid (FK -> organizations.id)
- razorpay_order_id: text
- razorpay_payment_id: text
- razorpay_refund_id: text
- is_signature_valid: boolean

### `billing_refunds`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- provider: public.billing_provider (required, default: razorpay, enum: razorpay)
- razorpay_refund_id: text (required)
- razorpay_payment_id: text (required)
- currency: text (required, default: INR)
- amount_paise: bigint (required)
- status: public.billing_refund_status (required, enum: created|processed|failed)
- raw: jsonb (required)
- created_at: timestamp with time zone (required, default: now())

### `billing_usage_events`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- event_type: text (required)
- occurred_at: timestamp with time zone (required, default: now())
- certificate_id: uuid (FK -> certificates.id)
- quantity: integer (required, default: 1)
- unit_price_paise: bigint (required)
- gst_rate_bps: integer (required)
- amount_paise: bigint (required)
- tax_paise: bigint (required)
- period_id: uuid (FK -> billing_periods.id)
- metadata: jsonb (required)
- created_at: timestamp with time zone (required, default: now())

### `certificate_categories`
- id: uuid (required, PK, default: gen_random_uuid())
- industry_id: uuid (required, FK -> industries.id)
- key: text (required)
- name: text (required)
- created_at: timestamp with time zone (required, default: now())
- organization_id: uuid (FK -> organizations.id)
- group_key: text
- sort_order: integer

### `certificate_generation_jobs`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- status: public.job_status (required, default: queued, enum: queued|running|completed|failed|cancelled)
- options: jsonb
- requested_by_user_id: uuid (FK -> profiles.id)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- completed_at: timestamp with time zone
- error: jsonb

### `certificate_subcategories`
- id: uuid (required, PK, default: gen_random_uuid())
- category_id: uuid (required, FK -> certificate_categories.id)
- key: text (required)
- name: text (required)
- created_at: timestamp with time zone (required, default: now())
- organization_id: uuid (FK -> organizations.id)
- sort_order: integer
- deleted_at: timestamp with time zone

### `certificate_template_fields`
- id: uuid (required, PK, default: gen_random_uuid())
- template_version_id: uuid (required, FK -> certificate_template_versions.id)
- field_key: text (required)
- label: text (required)
- type: public.template_field_type (required, enum: text|date|qrcode|custom)
- page_number: integer (required, default: 1)
- x: numeric (required)
- y: numeric (required)
- width: numeric
- height: numeric
- style: jsonb
- required: boolean (required, default: false)
- created_at: timestamp with time zone (required, default: now())

### `certificate_template_versions`
- id: uuid (required, PK, default: gen_random_uuid())
- template_id: uuid (required, FK -> certificate_templates.id)
- version_number: integer (required)
- source_file_id: uuid (required, FK -> files.id)
- page_count: integer (required, default: 1)
- normalized_pages: jsonb
- created_by_user_id: uuid (FK -> profiles.id)
- created_at: timestamp with time zone (required, default: now())
- preview_file_id: uuid (FK -> files.id)

### `certificate_templates`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- category_id: uuid (required, FK -> certificate_categories.id)
- subcategory_id: uuid (required, FK -> certificate_subcategories.id)
- title: text (required)
- status: public.template_status (required, default: draft, enum: draft|active|archived)
- latest_version_id: uuid (FK -> certificate_template_versions.id)
- created_by_user_id: uuid (FK -> profiles.id)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- deleted_at: timestamp with time zone

### `certificate_verification_events`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- certificate_id: uuid (required, FK -> certificates.id)
- scanned_at: timestamp with time zone (required, default: now())
- result: text (required)
- ip_hash: text
- user_agent: text
- metadata: jsonb

### `certificates`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- generation_job_id: uuid (required, FK -> certificate_generation_jobs.id)
- template_id: uuid (required, FK -> certificate_templates.id)
- template_version_id: uuid (required, FK -> certificate_template_versions.id)
- category_id: uuid (required, FK -> certificate_categories.id)
- subcategory_id: uuid (required, FK -> certificate_subcategories.id)
- recipient_name: text (required)
- recipient_email: public.citext
- recipient_phone: text
- recipient_data: jsonb (required)
- certificate_file_id: uuid (FK -> files.id)
- certificate_preview_file_id: uuid (FK -> files.id)
- certificate_number: text (required)
- issued_at: timestamp with time zone (required, default: now())
- expires_at: timestamp with time zone
- status: public.certificate_status (required, default: issued, enum: issued|expired|revoked|reissued)
- revoked_at: timestamp with time zone
- reissued_from_certificate_id: uuid (FK -> certificates.id)
- verification_token_hash: text (required)
- verification_path: text (required)
- qr_payload_url: text (required)
- created_at: timestamp with time zone (required, default: now())
- validity_interval: interval
- revoked_reason: text
- revoked_by_user_id: uuid (FK -> profiles.id)

### `dashboard_stats_cache`
- organization_id: uuid (required, PK, FK -> organizations.id)
- computed_at: timestamp with time zone (required, default: now())
- certificates_count: bigint (required, default: 0)
- templates_count: bigint (required, default: 0)
- imports_count: bigint (required, default: 0)
- verifications_count: bigint (required, default: 0)

### `delivery_integration_secrets`
- integration_id: uuid (required, PK, FK -> delivery_integrations.id)
- secret_type: public.delivery_secret_type (required, PK, enum: whatsapp_access_token|whatsapp_webhook_verify_token|smtp_password|email_api_key)
- vault_secret_id: uuid (required)
- created_at: timestamp with time zone (required, default: now())

### `delivery_integrations`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- channel: public.delivery_channel (required, enum: email|whatsapp)
- provider: text (required)
- display_name: text (required)
- is_active: boolean (required, default: true)
- is_default: boolean (required, default: false)
- from_email: public.citext
- from_name: text
- whatsapp_phone_number: text
- whatsapp_phone_number_id: text
- whatsapp_waba_id: text
- config: jsonb (required)
- created_by: uuid
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- deleted_at: timestamp with time zone

### `delivery_message_items`
- id: uuid (required, PK, default: gen_random_uuid())
- message_id: uuid (required, FK -> delivery_messages.id)
- certificate_id: uuid (required, FK -> certificates.id)
- attachment_file_id: uuid (FK -> files.id)
- created_at: timestamp with time zone (required, default: now())

### `delivery_messages`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- generation_job_id: uuid (required, FK -> certificate_generation_jobs.id)
- recipient_id: uuid (required, FK -> generation_job_recipients.id)
- channel: public.delivery_channel (required, enum: email|whatsapp)
- status: public.delivery_status (required, default: queued, enum: queued|sent|delivered|read|failed)
- to_email: public.citext
- to_phone: text
- provider: text
- provider_message_id: text
- queued_at: timestamp with time zone (required, default: now())
- sent_at: timestamp with time zone
- delivered_at: timestamp with time zone
- read_at: timestamp with time zone
- failed_at: timestamp with time zone
- error_code: text
- error_message: text
- created_at: timestamp with time zone (required, default: now())

### `delivery_provider_webhook_events`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (FK -> organizations.id)
- channel: public.delivery_channel (required, enum: email|whatsapp)
- provider: text (required)
- provider_message_id: text
- event_type: text (required)
- payload: jsonb (required)
- received_at: timestamp with time zone (required, default: now())

### `delivery_templates`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- channel: public.delivery_channel (required, enum: email|whatsapp)
- name: text (required)
- is_active: boolean (required, default: true)
- is_default: boolean (required, default: false)
- whatsapp_template_name: text
- whatsapp_language: text
- email_subject: text
- body: text (required)
- variables: jsonb (required)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())

### `file_import_jobs`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- template_id: uuid (required, FK -> certificate_templates.id)
- template_version_id: uuid (required, FK -> certificate_template_versions.id)
- category_id: uuid (required, FK -> certificate_categories.id)
- subcategory_id: uuid (required, FK -> certificate_subcategories.id)
- source_file_id: uuid (FK -> files.id)
- source_format: text (required)
- mapping: jsonb (required)
- status: public.import_status (required, default: queued, enum: queued|processing|completed|failed)
- row_count: integer (required, default: 0)
- success_count: integer (required, default: 0)
- failed_count: integer (required, default: 0)
- created_by_user_id: uuid (FK -> profiles.id)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- completed_at: timestamp with time zone
- error: jsonb

### `file_import_rows`
- id: uuid (required, PK, default: gen_random_uuid())
- import_job_id: uuid (required, FK -> file_import_jobs.id)
- row_index: integer (required)
- data: jsonb (required)
- raw_data: jsonb
- status: text (required, default: ok)
- errors: jsonb
- created_at: timestamp with time zone (required, default: now())

### `files`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- bucket: text (required, default: authentix)
- path: text (required)
- kind: public.file_kind (required, default: other, enum: template_source|template_preview|import_source|certificate_pdf|certificate_preview|zip_bundle|org_logo|other)
- original_name: text
- mime_type: text
- size_bytes: bigint
- checksum_sha256: text
- created_by_user_id: uuid (FK -> profiles.id)
- created_at: timestamp with time zone (required, default: now())
- deleted_at: timestamp with time zone

### `generation_job_recipients`
- id: uuid (required, PK, default: gen_random_uuid())
- job_id: uuid (required, FK -> certificate_generation_jobs.id)
- recipient_name: text (required)
- recipient_email: public.citext
- recipient_phone: text
- recipient_data: jsonb (required)
- created_at: timestamp with time zone (required, default: now())

### `generation_job_templates`
- id: uuid (required, PK, default: gen_random_uuid())
- job_id: uuid (required, FK -> certificate_generation_jobs.id)
- template_id: uuid (required, FK -> certificate_templates.id)
- template_version_id: uuid (required, FK -> certificate_template_versions.id)
- category_id: uuid (required, FK -> certificate_categories.id)
- subcategory_id: uuid (required, FK -> certificate_subcategories.id)

### `industries`
- id: uuid (required, PK, default: gen_random_uuid())
- key: text (required)
- name: text (required)
- created_at: timestamp with time zone (required, default: now())

### `invoice_line_items`
- id: uuid (required, PK, default: extensions.uuid_generate_v4())
- invoice_id: uuid (required)
- certificate_id: uuid
- description: text (required)
- quantity: integer (required, default: 1)
- unit_price: numeric (required)
- amount: numeric (required)
- created_at: timestamp with time zone (default: now())

### `organization_category_overrides`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- base_category_id: uuid (required, FK -> certificate_categories.id)
- name_override: text
- is_hidden: boolean (required, default: false)
- sort_order: integer
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())

### `organization_invitations`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- email: public.citext (required)
- role_id: uuid (required, FK -> organization_roles.id)
- token_hash: text (required)
- status: public.invite_status (required, default: pending, enum: pending|accepted|expired|revoked)
- invited_by_user_id: uuid (required, FK -> profiles.id)
- expires_at: timestamp with time zone (required)
- accepted_at: timestamp with time zone
- created_at: timestamp with time zone (required, default: now())

### `organization_members`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- user_id: uuid (required, FK -> profiles.id)
- username: public.citext (required)
- role_id: uuid (required, FK -> organization_roles.id)
- status: public.member_status (required, default: active, enum: invited|active|suspended)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- deleted_at: timestamp with time zone

### `organization_pricing_overrides`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- effective_from: timestamp with time zone (required, default: now())
- platform_fee_monthly_paise: bigint
- per_certificate_fee_paise: bigint
- gst_rate_bps: integer
- notes: text
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())

### `organization_roles`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (FK -> organizations.id)
- key: text (required)
- name: text (required)
- created_at: timestamp with time zone (required, default: now())
- is_system: boolean (required, default: false)

### `organization_subcategory_overrides`
- id: uuid (required, PK, default: gen_random_uuid())
- organization_id: uuid (required, FK -> organizations.id)
- base_subcategory_id: uuid (required, FK -> certificate_subcategories.id)
- name_override: text
- is_hidden: boolean (required, default: false)
- sort_order: integer
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())

### `organizations`
- id: uuid (required, PK, default: gen_random_uuid())
- slug: text (required)
- name: text (required)
- legal_name: text
- email: public.citext
- phone: text
- address_line1: text
- address_line2: text
- city: text
- state_province: text
- postal_code: text
- country: text
- tax_id: text
- website_url: text
- org_type: text
- logo_file_id: uuid
- application_id: text (required)
- api_key_hash: text (required)
- certificate_prefix: text (required, default: ORG)
- certificate_seq: bigint (required, default: 0)
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- deleted_at: timestamp with time zone
- certificate_number_format: text (required, default: {prefix}-{seq:6})
- billing_status: public.organization_billing_status (required, default: trialing, enum: trialing|active|past_due|disabled)
- trial_started_at: timestamp with time zone (required, default: now())
- trial_ends_at: timestamp with time zone
- trial_free_certificates_limit: integer (required, default: 10)
- trial_free_certificates_used: integer (required, default: 0)
- platform_fee_monthly_paise_default: bigint (required, default: 39900)
- per_certificate_fee_paise_default: bigint (required, default: 1000)
- gst_rate_bps_default: integer (required, default: 1800)
- platform_fee_waived: boolean (required, default: false)
- invoice_seq: bigint (required, default: 0)
- invoice_digits: integer (required, default: 6)
- billing_email: public.citext
- billing_address: jsonb (required)
- gstin: text
- industry_id: uuid (FK -> industries.id)

### `profiles`
- id: uuid (required, PK)
- first_name: text
- last_name: text
- email: public.citext
- created_at: timestamp with time zone (required, default: now())
- updated_at: timestamp with time zone (required, default: now())
- deleted_at: timestamp with time zone

### `role_permissions`
- role_id: uuid (required, PK, FK -> organization_roles.id)
- permission: text (required, PK)
- created_at: timestamp with time zone (required, default: now())

## Views (public)
### `v_certificate_verification`
- certificate_id: uuid (PK)
- organization_id: uuid (FK -> organizations.id)
- organization_name: text
- organization_slug: text
- website_url: text
- logo_file_id: uuid
- logo_bucket: text
- logo_path: text
- certificate_number: text
- status: public.certificate_status (enum: issued|expired|revoked|reissued)
- issued_at: timestamp with time zone
- expires_at: timestamp with time zone
- revoked_at: timestamp with time zone
- revoked_reason: text
- recipient_name: text
- recipient_email: public.citext
- recipient_phone: text
- category_name: text
- subcategory_name: text
- certificate_preview_file_id: uuid (FK -> files.id)
- preview_bucket: text
- preview_path: text
- verification_path: text
- qr_payload_url: text
- verification_token_hash: text

### `v_certificates_list`
- certificate_id: uuid (PK)
- organization_id: uuid (FK -> organizations.id)
- certificate_number: text
- status: public.certificate_status (enum: issued|expired|revoked|reissued)
- issued_at: timestamp with time zone
- expires_at: timestamp with time zone
- revoked_at: timestamp with time zone
- revoked_reason: text
- recipient_name: text
- recipient_email: public.citext
- recipient_phone: text
- category_id: uuid (FK -> certificate_categories.id)
- category_name: text
- subcategory_id: uuid (FK -> certificate_subcategories.id)
- subcategory_name: text
- template_id: uuid (FK -> certificate_templates.id)
- template_title: text
- template_version_id: uuid (FK -> certificate_template_versions.id)
- certificate_file_id: uuid (FK -> files.id)
- certificate_bucket: text
- certificate_path: text
- certificate_preview_file_id: uuid (FK -> files.id)
- preview_bucket: text
- preview_path: text
- verification_path: text
- qr_payload_url: text
- created_at: timestamp with time zone

### `v_effective_categories`
- organization_id: uuid (PK)
- category_id: uuid (PK)
- key: text
- name: text
- group_key: text
- sort_order: integer
- is_org_custom: boolean
- is_hidden: boolean

### `v_effective_subcategories`
- organization_id: uuid (PK)
- subcategory_id: uuid (PK)
- category_id: uuid (FK -> certificate_categories.id)
- key: text
- name: text
- sort_order: integer
- is_org_custom: boolean
- is_hidden: boolean

### `v_templates_list`
- template_id: uuid (PK)
- organization_id: uuid (FK -> organizations.id)
- title: text
- status: public.template_status (enum: draft|active|archived)
- created_at: timestamp with time zone
- updated_at: timestamp with time zone
- category_id: uuid (FK -> certificate_categories.id)
- category_name: text
- subcategory_id: uuid (FK -> certificate_subcategories.id)
- subcategory_name: text
- latest_version_id: uuid (FK -> certificate_template_versions.id)
- latest_version_number: integer
- latest_page_count: integer
- latest_source_file_id: uuid (FK -> files.id)
- latest_preview_file_id: uuid (FK -> files.id)
- preview_bucket: text
- preview_path: text

## RPC functions (public schema)
- append_audit_log(p_action: text, p_actor_user_id: uuid, p_entity_id: uuid, p_entity_type: text, p_metadata: jsonb, p_org_id: uuid, p_severity: text)
- apply_payment_to_invoice(p_amount_paise: bigint, p_invoice_id: uuid, p_payment_ref?: text)
- assert_period_open(p_period_id: uuid)
- can_issue_certificate(p_org_id: uuid)
- create_invoice_for_period(p_org_id: uuid, p_period_start: date)
- current_user_id()
- ensure_billing_period(p_org_id: uuid, p_period_start: date)
- ensure_billing_periods_for_month(p_period_start: date)
- event_trigger_fn()
- generate_api_key(company_uuid: uuid)
- get_org_effective_pricing(p_at?: timestamp with time zone, p_org_id: uuid)
- get_user_role()
- is_member_of_org(org_id: uuid)
- mark_expired_certificates()
- next_certificate_number(p_organization_id: uuid)
- next_invoice_number(p_org_id: uuid)
- recompute_invoice_totals(p_invoice_id: uuid)
- record_certificate_usage_event(p_certificate_id: uuid, p_occurred_at?: timestamp with time zone, p_org_id: uuid, p_quantity?: integer)
- revoke_certificate(p_certificate_id: uuid, p_reason: text, p_revoked_by: uuid)
- sha256_hex(input: text)
- show_limit()
- show_trgm(: text)
- verify_api_key(provided_key: text)
- verify_certificate(token: text)

## Enums
- billing_invoice_status: draft | expired | issued | paid | partially_paid | refunded | void
- billing_line_item_type: adjustment | certificate_usage | platform_fee
- billing_order_status: attempted | cancelled | created | failed | paid
- billing_payment_status: authorized | captured | created | failed | refunded
- billing_period_status: invoiced | locked | open | paid | void
- billing_provider: razorpay
- billing_refund_status: created | failed | processed
- certificate_status: expired | issued | reissued | revoked
- delivery_channel: email | whatsapp
- delivery_secret_type: email_api_key | smtp_password | whatsapp_access_token | whatsapp_webhook_verify_token
- delivery_status: delivered | failed | queued | read | sent
- file_kind: certificate_pdf | certificate_preview | import_source | org_logo | other | template_preview | template_source | zip_bundle
- import_status: completed | failed | processing | queued
- invite_status: accepted | expired | pending | revoked
- job_status: cancelled | completed | failed | queued | running
- member_status: active | invited | suspended
- organization_billing_status: active | disabled | past_due | trialing
- provider_event_status: failed | ignored | processed | received | verified
- template_field_type: custom | date | qrcode | text
- template_status: active | archived | draft

## RLS policies and enabled status
- Not exposed via PostgREST OpenAPI.
- Run these SQL queries to capture RLS details:
  - SELECT schemaname, tablename, rowsecurity, hasrules FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
  - SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

## Indexes
- Index definitions are not exposed via PostgREST OpenAPI.
- Run this SQL to capture indexes:
  - SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

## Soft delete markers
- certificate_subcategories
- certificate_templates
- delivery_integrations
- files
- organization_members
- organizations
- profiles
