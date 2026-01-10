# Database Architecture & Documentation

## Overview

The Authentix platform uses **Supabase** (PostgreSQL) as its primary database and **Supabase Storage** for file storage. The database follows a multi-tenant architecture with company-based isolation.

## ⚠️ Important Note

This documentation is generated from the **live Supabase schema** and storage metadata:
- **Generated at:** 2026-01-10T17:20:04.070Z
- **Schema source:** Supabase PostgREST OpenAPI
- **Storage source:** Supabase Storage API

Limitations:
- Indexes, RLS policies, and triggers are not exposed via PostgREST and must be verified via SQL.

## Database Provider

- **Platform**: Supabase (PostgreSQL 15+)
- **Connection**: Service role client for backend operations
- **Authentication**: Supabase Auth (JWT-based)
- **Storage**: Supabase Storage (S3-compatible)

## Storage Structure

### Supabase Storage Bucket: `minecertificate`

**Top-level folders (15)**: `audit-files/`, `branding/`, `bulk-downloads/`, `certificates-previews/`, `certificates/`, `company-logos/`, `email-attachments/`, `enterprise/`, `failed-rows/`, `imports/`, `qrcodes/`, `temp/`, `template-assets/`, `templates-previews/`, `templates/`

**Folder Structure**:
```
minecertificate/
├── audit-files/
├── branding/
├── bulk-downloads/
├── certificates-previews/
├── certificates/
├── company-logos/
├── email-attachments/
├── enterprise/
├── failed-rows/
├── imports/
├── qrcodes/
├── temp/
├── template-assets/
├── templates-previews/
└── templates/
```

**Access Control**:
- **Bucket Public:** Yes
- **File Size Limit:** 50 MB
- **Allowed MIME Types:** `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/html`, `text/css`, `application/javascript`, `font/ttf`, `font/woff`, `font/woff2`, `application/zip`
- Public bucket does not eliminate the use of signed URLs for sensitive assets.

## Database Tables

### 1. `audit_logs`

**Purpose**: Append-only audit log for sensitive actions.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `user_id` (UUID, FOREIGN KEY → users.id) - Reference ID
- `event_type` (TEXT, NOT NULL)
- `entity_type` (TEXT)
- `entity_id` (UUID) - Reference ID
- `metadata` (JSONB) - JSON object/array
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `action` (TEXT)
- `old_values` (JSONB) - JSON object/array
- `new_values` (JSONB) - JSON object/array
- `ip_address` (INET)
- `user_agent` (TEXT)

**Relationships**:
- `company_id` → `companies.id`
- `user_id` → `users.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Security auditing
- Operational tracing

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 2. `billing_profiles`

**Purpose**: Per-company pricing and tax profile for invoices.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `platform_fee_amount` (DECIMAL, NOT NULL, DEFAULT 1000)
- `certificate_unit_price` (DECIMAL, NOT NULL, DEFAULT 10)
- `currency` (TEXT, NOT NULL, DEFAULT INR)
- `gst_rate` (DECIMAL, NOT NULL, DEFAULT 18)
- `billing_cycle` (TEXT, NOT NULL, DEFAULT monthly)
- `razorpay_customer_id` (TEXT) - Reference ID
- `billing_address` (JSONB) - JSON object/array
- `auto_pay_enabled` (BOOLEAN)
- `effective_from` (DATE, NOT NULL, DEFAULT CURRENT_DATE)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Billing configuration per tenant

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 3. `certificate_categories`

**Purpose**: Category/subcategory taxonomy for certificate templates.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id) - Reference ID
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp
- `industry` (TEXT)
- `certificate_category` (TEXT, NOT NULL)
- `certificate_subcategory` (TEXT, NOT NULL)

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Template categorization
- Industry-based filtering

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 4. `certificate_events`

**Purpose**: Append-only timeline of certificate lifecycle events.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `certificate_id` (UUID, FOREIGN KEY → certificates.id, NOT NULL) - Reference ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `event_type` (TEXT, NOT NULL)
- `actor_type` (TEXT, NOT NULL)
- `actor_id` (UUID, FOREIGN KEY → users.id) - Reference ID
- `metadata` (JSONB) - JSON object/array
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time

**Relationships**:
- `certificate_id` → `certificates.id`
- `company_id` → `companies.id`
- `actor_id` → `users.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Certificate lifecycle timeline

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 5. `certificate_templates`

**Purpose**: Certificate template metadata and field definitions.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `name` (TEXT, NOT NULL)
- `course_name` (TEXT)
- `file_type` (TEXT, NOT NULL)
- `storage_path` (TEXT, NOT NULL) - Supabase Storage object path
- `preview_url` (TEXT) - Preview URL
- `description` (TEXT)
- `created_by` (UUID, FOREIGN KEY → users.id)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `fields` (JSONB) - JSONB array of field configs (x, y, fontSize, fontFamily, color, etc.)
- `fields_schema_version` (INTEGER, DEFAULT 1) - Schema version for fields array (enables future migrations)
- `width` (INTEGER)
- `height` (INTEGER)
- `certificate_category_id` (UUID, FOREIGN KEY → certificate_categories.id) - Reference ID
- `version` (INTEGER, DEFAULT 1)
- `status` (TEXT, DEFAULT active) - Template status: draft (editing), active (usable), archived (hidden)
- `usage_count` (INTEGER)
- `last_used_at` (TIMESTAMPTZ) - Timestamp
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp
- `certificate_subcategory_id` (UUID, FOREIGN KEY → certificate_categories.id) - Reference ID
- `certificate_category` (TEXT) - Snapshot of certificate category at template creation time
- `certificate_subcategory` (TEXT) - Snapshot of certificate subcategory at template creation time (optional)
- `industry` (TEXT) - Industry snapshot (e.g. edtech) copied from company at creation time

**Relationships**:
- `company_id` → `companies.id`
- `created_by` → `users.id`
- `certificate_category_id` → `certificate_categories.id`
- `certificate_subcategory_id` → `certificate_categories.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Template management
- Field layout storage

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

**Storage**:
- storage_path stores the template file in Supabase Storage.
- preview_url stores the public preview URL when available.

---

### 6. `certificates`

**Purpose**: Issued certificates with verification identifiers and snapshots.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `certificate_template_id` (UUID, FOREIGN KEY → certificate_templates.id) - Reference ID
- `recipient_name` (TEXT, NOT NULL)
- `recipient_email` (TEXT)
- `course_name` (TEXT)
- `issue_date` (DATE, NOT NULL, DEFAULT CURRENT_DATE) - Issue date
- `expiry_date` (DATE) - Expiry date
- `certificate_number` (TEXT, NOT NULL)
- `storage_path` (TEXT, NOT NULL) - Supabase Storage object path
- `preview_url` (TEXT) - Preview URL
- `verification_code` (TEXT, NOT NULL)
- `status` (TEXT, NOT NULL, DEFAULT issued) - Certificate status: issued (valid), revoked (invalidated), expired (past expiry_date)
- `issued_by` (UUID, FOREIGN KEY → users.id)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `import_job_id` (UUID) - Reference ID
- `course_date` (DATE)
- `custom_fields` (JSONB) - JSON object/array
- `verification_count` (INTEGER)
- `last_verified_at` (TIMESTAMPTZ) - Timestamp
- `pdf_url` (TEXT) - PDF URL
- `qr_url` (TEXT) - URL
- `revoke_reason` (TEXT)
- `verification_token` (TEXT) - Unique token for public verification (embedded in QR code)
- `template_snapshot` (JSONB) - Frozen snapshot of template at issue time (fields, dimensions, etc.)
- `recipient_snapshot` (JSONB) - Frozen snapshot of recipient data at issue time
- `public_url` (TEXT) - Public URL
- `qr_code_url` (TEXT) - QR code URL
- `invoice_id` (UUID, FOREIGN KEY → invoices.id) - Reference ID
- `issued_at` (TIMESTAMPTZ, DEFAULT now()) - Issue timestamp
- `revoked_at` (TIMESTAMPTZ) - Timestamp
- `revoked_by` (UUID, FOREIGN KEY → users.id)
- `revocation_reason` (TEXT)
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp
- `certificate_category_snapshot` (JSONB) - JSON object/array
- `certificate_subcategory_snapshot` (JSONB) - JSON object/array

**Relationships**:
- `company_id` → `companies.id`
- `certificate_template_id` → `certificate_templates.id`
- `issued_by` → `users.id`
- `invoice_id` → `invoices.id`
- `revoked_by` → `users.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Issued certificate registry
- Verification lookup

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

**Storage**:
- storage_path stores the generated certificate file path (if persisted).
- pdf_url/public_url/qr_code_url store generated asset URLs when used.

---

### 7. `companies`

**Purpose**: Tenant/company records and API identity.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `name` (TEXT, NOT NULL)
- `logo` (TEXT) - Logo URL
- `email` (TEXT) - Email address
- `phone` (TEXT) - Phone number
- `website` (TEXT)
- `address` (TEXT)
- `city` (TEXT)
- `state` (TEXT)
- `country` (TEXT)
- `postal_code` (TEXT)
- `billing_address` (TEXT)
- `billing_city` (TEXT)
- `billing_state` (TEXT)
- `billing_country` (TEXT)
- `billing_postal_code` (TEXT)
- `gst_number` (TEXT)
- `cin_number` (TEXT)
- `tax_id` (TEXT) - Reference ID
- `gst_document_url` (TEXT) - URL
- `cin_document_url` (TEXT) - URL
- `industry` (TEXT)
- `company_size` (TEXT)
- `timezone` (TEXT, DEFAULT UTC)
- `last_active_at` (TIMESTAMPTZ) - Timestamp
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `application_id` (TEXT, NOT NULL) - Immutable company identifier (format: xen__). Used for API auth and storage paths.
- `status` (TEXT, DEFAULT active) - Company account status: active, suspended, closed
- `billing_plan` (TEXT)
- `api_key_hash` (TEXT) - Bcrypt hash of API key (NEVER store plaintext)
- `api_enabled` (BOOLEAN)
- `api_key_created_at` (TIMESTAMPTZ) - Timestamp
- `api_key_last_rotated_at` (TIMESTAMPTZ) - Timestamp
- `currency` (TEXT, DEFAULT INR)
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp (NULL = active)
- `environment` (TEXT, NOT NULL, DEFAULT test) - Logical environment: dev (local), test (staging), beta (pre-prod), prod (production). Used for safety guards, not tenant isolation.
- `business_type` (TEXT) - Primary business domain of the company. Used to filter certificate categories and subcategories.

**Relationships**:
- None

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Tenant management
- API identity

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

**Storage**:
- logo stores the public URL to the company logo in storage.

---

### 8. `company_settings`

**Purpose**: Per-company branding and messaging settings.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `email_delivery_enabled` (BOOLEAN, DEFAULT true)
- `whatsapp_delivery_enabled` (BOOLEAN)
- `api_access_enabled` (BOOLEAN)
- `email_from_name` (TEXT)
- `email_from_address` (TEXT)
- `email_reply_to` (TEXT)
- `whatsapp_business_account_id` (TEXT) - Meta Business Account ID
- `whatsapp_phone_number_id` (TEXT) - Meta Phone Number ID (used in API calls)
- `whatsapp_access_token` (TEXT) - Meta access token (encrypted, long-lived)
- `logo_url` (TEXT) - URL
- `primary_color` (TEXT, DEFAULT #ff5400)
- `max_certificates_per_batch` (INTEGER, DEFAULT 50)
- `max_import_rows` (INTEGER, DEFAULT 10000)
- `branding` (JSONB) - JSON object/array
- `limits` (JSONB) - JSON object/array
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Branding + comms configuration

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 9. `email_messages`

**Purpose**: Outbound email send log and delivery status.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `certificate_id` (UUID, FOREIGN KEY → certificates.id) - Reference ID
- `email_template_id` (UUID, FOREIGN KEY → email_templates.id) - Reference ID
- `recipient_email` (TEXT, NOT NULL)
- `subject_snapshot` (TEXT, NOT NULL) - Frozen email subject at send time
- `body_snapshot` (TEXT, NOT NULL) - Frozen email body at send time (for audit/legal)
- `provider` (TEXT)
- `provider_message_id` (TEXT) - Reference ID
- `status` (TEXT, NOT NULL, DEFAULT queued) - Status value
- `failure_reason` (TEXT)
- `sent_at` (TIMESTAMPTZ) - Timestamp
- `delivered_at` (TIMESTAMPTZ) - Timestamp
- `opened_at` (TIMESTAMPTZ) - Timestamp
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time

**Relationships**:
- `company_id` → `companies.id`
- `certificate_id` → `certificates.id`
- `email_template_id` → `email_templates.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Email delivery tracking

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 10. `email_templates`

**Purpose**: Email template library.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id) - Reference ID
- `name` (TEXT, NOT NULL)
- `subject` (TEXT, NOT NULL)
- `body` (TEXT, NOT NULL)
- `variables` (JSONB) - JSON object/array
- `is_system` (BOOLEAN)
- `active` (BOOLEAN, DEFAULT true)
- `version` (INTEGER, DEFAULT 1)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Reusable email content

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 11. `import_data_rows`

**Purpose**: Row-level data captured from import jobs.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `import_job_id` (UUID, FOREIGN KEY → import_jobs.id, NOT NULL) - Reference ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `row_number` (INTEGER, NOT NULL)
- `data` (JSONB, NOT NULL) - JSON object/array
- `is_deleted` (BOOLEAN)
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp
- `deleted_by` (UUID, FOREIGN KEY → users.id)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time

**Relationships**:
- `import_job_id` → `import_jobs.id`
- `company_id` → `companies.id`
- `deleted_by` → `users.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Bulk data storage for imports

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 12. `import_jobs`

**Purpose**: Import job metadata, status, and mapping info.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `created_by` (UUID, FOREIGN KEY → users.id)
- `file_name` (TEXT)
- `storage_path` (TEXT, NOT NULL) - Supabase Storage object path
- `status` (TEXT, NOT NULL, DEFAULT pending) - Status value
- `total_rows` (INTEGER)
- `success_count` (INTEGER)
- `failure_count` (INTEGER)
- `error_message` (TEXT)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `template_id` (UUID) - Reference ID
- `file_storage_path` (TEXT) - Legacy storage path
- `mapping` (JSONB) - JSON object/array
- `processed_rows` (INTEGER)
- `succeeded_rows` (INTEGER)
- `failed_rows` (INTEGER)
- `errors` (JSONB) - JSON object/array
- `uploaded_by` (UUID)
- `started_at` (TIMESTAMPTZ) - Timestamp
- `completed_at` (TIMESTAMPTZ) - Timestamp
- `source_type` (TEXT, DEFAULT csv) - Import source: csv, excel, api
- `data_persisted` (BOOLEAN) - True if rows stored in import_data_rows table
- `reusable` (BOOLEAN, DEFAULT true)
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp
- `certificate_category_id` (UUID, FOREIGN KEY → certificate_categories.id) - Reference ID
- `certificate_subcategory_id` (UUID, FOREIGN KEY → certificate_categories.id) - Reference ID

**Relationships**:
- `company_id` → `companies.id`
- `created_by` → `users.id`
- `certificate_category_id` → `certificate_categories.id`
- `certificate_subcategory_id` → `certificate_categories.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Import workflow tracking

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

**Storage**:
- storage_path stores the uploaded import file path.
- file_storage_path is a legacy/alternate storage path when present.

---

### 13. `invoice_line_items`

**Purpose**: Line items attached to invoices.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `invoice_id` (UUID, FOREIGN KEY → invoices.id, NOT NULL) - Reference ID
- `certificate_id` (UUID, FOREIGN KEY → certificates.id) - Reference ID
- `description` (TEXT, NOT NULL)
- `quantity` (INTEGER, NOT NULL, DEFAULT 1)
- `unit_price` (DECIMAL, NOT NULL)
- `amount` (DECIMAL, NOT NULL)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time

**Relationships**:
- `invoice_id` → `invoices.id`
- `certificate_id` → `certificates.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Invoice breakdown

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 14. `invoices`

**Purpose**: Invoice records and payment status.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `invoice_number` (TEXT, NOT NULL)
- `period_start` (DATE, NOT NULL)
- `period_end` (DATE, NOT NULL)
- `subtotal` (DECIMAL, NOT NULL)
- `tax_amount` (DECIMAL, NOT NULL)
- `total_amount` (DECIMAL, NOT NULL)
- `currency` (TEXT, DEFAULT INR)
- `status` (TEXT, NOT NULL, DEFAULT pending) - Status value
- `payment_method` (TEXT)
- `payment_gateway_id` (TEXT) - Reference ID
- `payment_gateway_response` (JSONB) - JSON object/array
- `paid_at` (TIMESTAMPTZ) - Timestamp
- `due_date` (DATE, NOT NULL)
- `notes` (TEXT)
- `pdf_url` (TEXT) - PDF URL
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp
- `gst_rate_snapshot` (DECIMAL) - GST rate (%) snapshot copied from billing_profiles at invoice creation time
- `razorpay_invoice_id` (TEXT) - Invoice ID returned by Razorpay
- `razorpay_payment_id` (TEXT) - Successful Razorpay payment ID
- `razorpay_order_id` (TEXT) - Razorpay order reference
- `razorpay_payment_link` (TEXT) - Hosted payment link generated by Razorpay
- `razorpay_status` (TEXT) - Razorpay invoice status (issued, paid, expired, cancelled)
- `issued_via` (TEXT, DEFAULT razorpay)
- `company_snapshot` (JSONB, NOT NULL) - Company legal details snapshot at invoice creation time
- `billing_snapshot` (JSONB, NOT NULL) - Billing profile snapshot (pricing, GST, currency) at invoice creation time

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Billing and payment tracking

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

**Storage**:
- pdf_url stores a generated invoice PDF URL when available.

---

### 15. `razorpay_events`

**Purpose**: Razorpay webhook event log.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id) - Reference ID
- `razorpay_event_id` (TEXT, NOT NULL) - Reference ID
- `event_type` (TEXT, NOT NULL)
- `payload` (JSONB, NOT NULL) - JSON object/array
- `signature_verified` (BOOLEAN)
- `received_at` (TIMESTAMPTZ, DEFAULT now()) - Timestamp
- `razorpay_entity_id` (TEXT) - Reference ID
- `razorpay_entity_type` (TEXT)
- `processed` (BOOLEAN)
- `amount` (DECIMAL) - Amount from Razorpay event entity
- `currency` (TEXT)
- `status` (TEXT) - Status value
- `payment_method` (TEXT)
- `fee` (DECIMAL) - Razorpay processing fee snapshot
- `tax` (DECIMAL) - GST / tax applied by Razorpay
- `error_code` (TEXT)
- `error_reason` (TEXT)

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Webhook audit + idempotency

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 16. `razorpay_refunds`

**Purpose**: Razorpay refund tracking records.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id) - Reference ID
- `razorpay_refund_id` (TEXT, NOT NULL) - Reference ID
- `razorpay_payment_id` (TEXT, NOT NULL) - Reference ID
- `amount` (DECIMAL, NOT NULL)
- `currency` (TEXT, NOT NULL)
- `status` (TEXT, NOT NULL) - Status value
- `reason` (TEXT)
- `payload` (JSONB, NOT NULL) - JSON object/array
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Refund tracking

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 17. `user_invitations`

**Purpose**: User invitation workflow records.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `email` (TEXT, NOT NULL) - Email address
- `role` (TEXT, NOT NULL, DEFAULT member)
- `invited_by` (UUID, FOREIGN KEY → users.id)
- `token` (TEXT, NOT NULL, DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text))
- `status` (TEXT, NOT NULL, DEFAULT pending) - Status value
- `expires_at` (TIMESTAMPTZ, NOT NULL, DEFAULT (now() + '7 days'::interval)) - Timestamp
- `accepted_at` (TIMESTAMPTZ) - Timestamp
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id`
- `invited_by` → `users.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Team invite flow

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 18. `users`

**Purpose**: User profiles linked to Supabase Auth.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `email` (TEXT, NOT NULL) - Email address
- `full_name` (TEXT)
- `role` (TEXT, NOT NULL, DEFAULT member)
- `invited_by` (UUID, FOREIGN KEY → users.id)
- `last_login_at` (TIMESTAMPTZ) - Timestamp
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `status` (TEXT, DEFAULT active) - User status: active (logged in), invited (pending), disabled
- `last_seen_at` (TIMESTAMPTZ) - Last activity timestamp (updated on each request)
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id`
- `invited_by` → `users.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Auth profile + tenant linkage

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 19. `verification_logs`

**Purpose**: Verification attempts and results.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `certificate_id` (UUID, FOREIGN KEY → certificates.id) - Reference ID
- `verifier_ip` (TEXT)
- `verifier_user_agent` (TEXT)
- `verifier_location` (TEXT)
- `result` (TEXT, NOT NULL)
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `ip_address` (INET)
- `user_agent` (TEXT)
- `verified_at` (TIMESTAMPTZ, DEFAULT now()) - Timestamp

**Relationships**:
- `company_id` → `companies.id`
- `certificate_id` → `certificates.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Verification audit trail

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 20. `whatsapp_messages`

**Purpose**: Outbound WhatsApp send log and delivery status.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Reference ID
- `certificate_id` (UUID, FOREIGN KEY → certificates.id) - Reference ID
- `whatsapp_template_id` (UUID, FOREIGN KEY → whatsapp_templates.id) - Reference ID
- `conversation_type` (TEXT) - Meta conversation category (user_initiated, business_initiated, etc.)
- `conversation_id` (TEXT) - Reference ID
- `recipient_phone` (TEXT, NOT NULL)
- `message_payload` (JSONB, NOT NULL) - Exact JSON payload sent to Meta API (for debugging/replay)
- `meta_message_id` (TEXT) - Meta-assigned message ID (returned from send API, used in webhooks)
- `status` (TEXT, NOT NULL, DEFAULT queued) - Status value
- `failure_reason` (TEXT)
- `error_code` (TEXT)
- `pricing_model` (TEXT) - Meta pricing model (conversation-based pricing)
- `price_category` (TEXT)
- `billable` (BOOLEAN, DEFAULT true) - Whether this message incurs Meta charges
- `sent_at` (TIMESTAMPTZ) - Timestamp
- `delivered_at` (TIMESTAMPTZ) - Timestamp
- `read_at` (TIMESTAMPTZ) - Timestamp
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `cost_amount` (DECIMAL)
- `cost_currency` (TEXT)
- `cost_snapshot` (JSONB) - Meta billing cost snapshot at send time

**Relationships**:
- `company_id` → `companies.id`
- `certificate_id` → `certificates.id`
- `whatsapp_template_id` → `whatsapp_templates.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- WhatsApp delivery tracking

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

### 21. `whatsapp_templates`

**Purpose**: WhatsApp template library.

**Columns**:
- `id` (UUID, PRIMARY KEY, NOT NULL, DEFAULT extensions.uuid_generate_v4()) - Primary key
- `company_id` (UUID, FOREIGN KEY → companies.id) - Reference ID
- `name` (TEXT, NOT NULL)
- `meta_template_name` (TEXT, NOT NULL) - Template name registered with Meta (e.g., certificate_delivery_v2)
- `meta_template_id` (TEXT) - Meta-assigned template ID (returned after approval)
- `language_code` (TEXT, NOT NULL, DEFAULT en_US)
- `category` (TEXT, NOT NULL)
- `status` (TEXT, NOT NULL, DEFAULT pending) - Status value
- `quality_rating` (TEXT) - Meta quality rating (affects rate limits): GREEN (high), YELLOW (medium), RED (low)
- `rejection_reason` (TEXT)
- `body_template` (TEXT, NOT NULL)
- `variables` (JSONB) - JSON object/array
- `is_system` (BOOLEAN)
- `last_synced_at` (TIMESTAMPTZ) - Timestamp
- `created_at` (TIMESTAMPTZ, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMPTZ, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMPTZ) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id`

**Indexes**:
- PRIMARY KEY on `id`
- Other indexes not available via PostgREST (verify in Supabase)

**Usage**:
- Reusable WhatsApp templates

**Backend Access**:
- Accessed via Supabase repositories/services (see src/domains).

---

## Table Relationships Diagram

```
certificate_categories (1) ──< (many) certificate_templates
certificate_categories (1) ──< (many) import_jobs
certificate_templates (1) ──< (many) certificates
certificates (1) ──< (many) certificate_events
certificates (1) ──< (many) email_messages
certificates (1) ──< (many) invoice_line_items
certificates (1) ──< (many) verification_logs
certificates (1) ──< (many) whatsapp_messages
companies (1) ──< (many) audit_logs
companies (1) ──< (many) billing_profiles
companies (1) ──< (many) certificate_categories
companies (1) ──< (many) certificate_events
companies (1) ──< (many) certificate_templates
companies (1) ──< (many) certificates
companies (1) ──< (many) company_settings
companies (1) ──< (many) email_messages
companies (1) ──< (many) email_templates
companies (1) ──< (many) import_data_rows
companies (1) ──< (many) import_jobs
companies (1) ──< (many) invoices
companies (1) ──< (many) razorpay_events
companies (1) ──< (many) razorpay_refunds
companies (1) ──< (many) user_invitations
companies (1) ──< (many) users
companies (1) ──< (many) verification_logs
companies (1) ──< (many) whatsapp_messages
companies (1) ──< (many) whatsapp_templates
email_templates (1) ──< (many) email_messages
import_jobs (1) ──< (many) import_data_rows
invoices (1) ──< (many) certificates
invoices (1) ──< (many) invoice_line_items
users (1) ──< (many) audit_logs
users (1) ──< (many) certificate_events
users (1) ──< (many) certificate_templates
users (1) ──< (many) certificates
users (1) ──< (many) import_data_rows
users (1) ──< (many) import_jobs
users (1) ──< (many) user_invitations
users (1) ──< (many) users
whatsapp_templates (1) ──< (many) whatsapp_messages
```

## Multi-Tenant Isolation

### Strategy

All tables use `company_id` for tenant isolation:
- **Backend enforces**: All queries filter by `company_id`
- **Row-Level Security**: Managed in Supabase (verify policies in dashboard)
- **Service Role**: Backend uses service role client (bypasses RLS)

### Isolation Pattern

Every repository method:
1. Accepts `companyId` parameter
2. Filters queries by `company_id = companyId`
3. Validates ownership before updates/deletes

Example:
```typescript
// TemplateRepository
async findById(id: string, companyId: string) {
  return this.supabase
    .from('certificate_templates')
NaN
    .eq('id', id)
    .eq('company_id', companyId);
}
```

## Soft Deletes

### Tables with Soft Delete

- `certificate_categories`
- `certificate_templates`
- `certificates`
- `companies`
- `email_templates`
- `import_data_rows`
- `import_jobs`
- `invoices`
- `user_invitations`
- `users`
- `whatsapp_templates`

### Pattern

```sql
WHERE deleted_at IS NULL
```

## Indexes Strategy

- Primary keys are indexed by default.
- Additional indexes are not exposed via PostgREST; verify via Supabase SQL editor.

## Data Types

### UUID
- Used for all primary keys and foreign keys
- Generated by Supabase (`uuid_generate_v4()`)

### TEXT
- Used for strings (names, emails, URLs, etc.)
- No length limits (PostgreSQL TEXT type)

### JSONB
- Used for flexible data structures (fields, payloads, metadata)

### DECIMAL
- Used for monetary values (prices, amounts)

### BOOLEAN
- Used for flags (revoked, processed, api_enabled, etc.)

### TIMESTAMPTZ
- Used for all date/time fields (timezone-aware)
- Default: `now()`

## Storage Details

### Supabase Storage Bucket: `minecertificate`

**Configuration**:
- **Bucket Public:** Yes
- **File Size Limit:** 50 MB
- **Allowed MIME Types:** `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/html`, `text/css`, `application/javascript`, `font/ttf`, `font/woff`, `font/woff2`, `application/zip`

**Path Patterns (observed + code usage)**:
- Templates: `templates/<company_id>/<timestamp>-<random>.<ext>`
- Imports: `imports/<company_id>/<timestamp>-<random>.<ext>`
- Company logos: `company-logos/<company_id>/logo_<timestamp>.<ext>`
- Bulk downloads: `bulk-downloads/<company_id>/<timestamp>-certificates.zip>`

**URL Generation**:
- **Public URLs**: `supabase.storage.from("minecertificate").getPublicUrl(path)`
- **Signed URLs**: `supabase.storage.from("minecertificate").createSignedUrl(path, expirySeconds)`

## Functions & Triggers

### Database Functions

- `event_trigger_fn`
- `generate_api_key`
- `get_user_company_id`
- `get_user_role`
- `verify_api_key`
- `verify_certificate`

### Triggers

- Trigger inventory is not available via PostgREST. Verify via SQL.

## Migration Strategy

### Supabase Migrations

Migrations are managed through Supabase:
- SQL migration files (if using Supabase CLI)
- Supabase Dashboard (if using UI)

### Schema Changes

1. Create migration file
2. Test in development
3. Apply to production
4. Update backend types if needed

## Backup & Recovery

### Supabase Backups

- **Automatic Backups**: Supabase handles daily backups
- **Point-in-Time Recovery**: Available (if enabled)
- **Manual Backups**: Via Supabase Dashboard

### Data Retention

- **Soft Deletes**: Retained indefinitely (for audit)
- **Hard Deletes**: Manual process (if needed)

## Performance Considerations

### Query Optimization

1. **Indexes**: Verify and add indexes for common filters
2. **Pagination**: All list endpoints should use pagination
3. **Selective Fields**: Only select required columns
4. **JSONB Queries**: Use JSONB operators for efficient queries

### Connection Pooling

- Supabase handles connection pooling
- Backend uses a service role client (reused)

### Caching

- No application-level caching
- Consider Redis for future optimization

## Security

### Row-Level Security (RLS)

- Policies are managed in Supabase; verify via SQL and dashboard.
- Backend uses service role for server-side access.

### Data Encryption

- **At Rest**: Supabase encrypts database
- **In Transit**: TLS/SSL for all connections
- **API Keys**: Store only hashes in database

### Access Control

- **JWT Verification**: All protected endpoints verify JWT
- **Company Isolation**: All queries filter by company_id
- **API Keys**: Alternative authentication for programmatic access

## Monitoring

### Query Performance

- Supabase Dashboard provides query analytics
- Monitor slow queries and index usage

### Storage Usage

- Monitor Supabase Storage usage
- Clean up old files (if needed)
- Implement retention policies (if needed)

## How to Verify Actual Database Schema

This documentation is generated from the live Supabase schema, but indexes, policies, and triggers are not included. To verify full details:

### Method 1: Supabase Dashboard
1. Go to Supabase Dashboard
2. Navigate to **Database > Tables**
3. Click on any table to see:
   - All columns with data types
   - Constraints (primary keys, foreign keys, unique)
   - Indexes
   - Default values
   - Nullable status

### Method 2: SQL Queries

Run these queries in Supabase SQL Editor:

**Get all columns for a table:**
```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'certificates'
ORDER BY ordinal_position;
```

**Get all indexes:**
```sql
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'certificates';
```

**Get all foreign keys:**
```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
```

### Method 3: Supabase CLI

If you have Supabase CLI installed:
```bash
supabase db dump --schema public > schema.sql
```

## Future Enhancements

- **Schema Sync**: Automate schema documentation from actual database
- **Archiving**: Archive old certificates/imports
- **Full-Text Search**: Add search indexes for names/descriptions
- **Read Replicas**: For read-heavy workloads