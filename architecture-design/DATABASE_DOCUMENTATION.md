# Database Architecture & Documentation

## Overview

The Authentix platform uses **Supabase** (PostgreSQL) as its primary database and **Supabase Storage** for file storage. The database follows a multi-tenant architecture with company-based isolation.

## ⚠️ Important Note

**This documentation is based on codebase analysis** - it was created by analyzing:
1. TypeScript entity interfaces in `src/domains/*/types.ts`
2. Repository `mapToEntity()` functions that show column mappings
3. Database queries in repository files showing `.from()` and `.select()` calls
4. Service layer usage patterns

**To get the exact, authoritative schema**, please:
- Check **Supabase Dashboard > Database > Tables** for the actual schema
- Or run SQL queries: `SELECT * FROM information_schema.columns WHERE table_name = 'table_name'`
- Or use the script: `npx tsx scripts/get-database-schema.ts` (if created)

**This documentation should be verified against the actual database schema** before making critical decisions.

## Database Provider

- **Platform**: Supabase (PostgreSQL 15+)
- **Connection**: Service role client for backend operations
- **Authentication**: Supabase Auth (JWT-based)
- **Storage**: Supabase Storage (S3-compatible)

## Storage Structure

### Supabase Storage Bucket: `minecertificate`

**Folder Structure**:
```
minecertificate/
├── templates/
│   └── {company_id}/
│       └── {timestamp}-{random}.{ext}
├── certificates/
│   └── {company_id}/
│       └── {certificate_id}.pdf
├── imports/
│   └── {company_id}/
│       └── {timestamp}-{random}.{ext}
└── logos/
    └── {company_id}/
        └── logo.{ext}
```

**Access Control**:
- **Templates**: Public URLs for preview, signed URLs for downloads
- **Certificates**: Signed URLs (1-hour expiry) for security
- **Imports**: Signed URLs for downloads
- **Logos**: Public URLs for company branding

## Database Tables

### 1. `users`

**Purpose**: User accounts (managed by Supabase Auth + custom profile)

**Columns**:
- `id` (UUID, PRIMARY KEY) - User ID (from Supabase Auth)
- `email` (TEXT, UNIQUE, NOT NULL) - User email
- `full_name` (TEXT, NULLABLE) - User's full name
- `company_id` (UUID, FOREIGN KEY → companies.id) - Associated company
- `role` (TEXT, DEFAULT 'user') - User role (user, admin, etc.)
- `created_at` (TIMESTAMP, DEFAULT now()) - Account creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time

**Relationships**:
- `company_id` → `companies.id` (Many users to one company)

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE on `email`
- INDEX on `company_id` (for company user queries)

**Usage**:
- User authentication (via Supabase Auth)
- User profile management
- Company association
- Role-based access control

**Backend Access**:
- `AuthService`: Login, signup, session verification
- `UserService`: Get user profile with company info
- `JWTVerifier`: Extract company_id from user record

---

### 2. `companies`

**Purpose**: Company/organization records

**Columns**:
- `id` (UUID, PRIMARY KEY) - Company ID
- `name` (TEXT, NOT NULL) - Company name
- `email` (TEXT, NULLABLE) - Company email
- `phone` (TEXT, NULLABLE) - Company phone
- `website` (TEXT, NULLABLE) - Company website URL
- `industry` (TEXT, NULLABLE) - Company industry (used for category filtering)
- `address` (TEXT, NULLABLE) - Street address
- `city` (TEXT, NULLABLE) - City
- `state` (TEXT, NULLABLE) - State/Province
- `country` (TEXT, NULLABLE) - Country
- `postal_code` (TEXT, NULLABLE) - Postal/ZIP code
- `gst_number` (TEXT, NULLABLE) - GST registration number
- `cin_number` (TEXT, NULLABLE) - CIN registration number
- `logo` (TEXT, NULLABLE) - Logo storage path/URL
- `application_id` (TEXT, NULLABLE, UNIQUE) - API application ID (format: `app_{env}_{random}`)
- `api_enabled` (BOOLEAN, DEFAULT false) - API access enabled flag
- `api_key_hash` (TEXT, NULLABLE) - Hashed API key (bcrypt)
- `api_key_created_at` (TIMESTAMP, NULLABLE) - API key creation time
- `api_key_last_rotated_at` (TIMESTAMP, NULLABLE) - Last API key rotation time
- `created_at` (TIMESTAMP, DEFAULT now()) - Company creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMP, NULLABLE) - Soft delete timestamp

**Relationships**:
- One-to-many with `users` (via `users.company_id`)
- One-to-many with `certificate_templates` (via `certificate_templates.company_id`)
- One-to-many with `certificates` (via `certificates.company_id`)
- One-to-many with `import_jobs` (via `import_jobs.company_id`)
- One-to-many with `invoices` (via `invoices.company_id`)
- One-to-one with `billing_profiles` (via `billing_profiles.company_id`)

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE on `application_id`
- INDEX on `industry` (for category filtering)
- INDEX on `deleted_at` (for soft delete queries)

**Usage**:
- Company profile management
- API key management
- Industry-based category filtering
- Multi-tenant isolation

**Backend Access**:
- `CompanyService`: CRUD operations
- `CompanyRepository`: Data access
- `TemplateService`: Get company industry for categories

---

### 3. `certificate_templates`

**Purpose**: Certificate template definitions

**Columns**:
- `id` (UUID, PRIMARY KEY) - Template ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Owner company
- `name` (TEXT, NOT NULL) - Template name
- `description` (TEXT, NULLABLE) - Template description
- `file_type` (TEXT, NOT NULL) - File type: 'pdf', 'png', 'jpg', 'jpeg'
- `storage_path` (TEXT, NOT NULL) - Storage path in Supabase Storage
- `preview_url` (TEXT, NULLABLE) - Public preview URL
- `status` (TEXT, DEFAULT 'draft') - Status: 'draft', 'active', 'archived'
- `fields` (JSONB, DEFAULT '[]') - Array of field definitions (CertificateField[])
- `width` (INTEGER, NULLABLE) - Template width in pixels/points
- `height` (INTEGER, NULLABLE) - Template height in pixels/points
- `certificate_category` (TEXT, NULLABLE) - Category name
- `certificate_subcategory` (TEXT, NULLABLE) - Subcategory name
- `created_by` (UUID, FOREIGN KEY → users.id, NULLABLE) - Creator user ID
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMP, NULLABLE) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id` (Many templates to one company)
- `created_by` → `users.id` (Many templates to one user)

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `company_id` (for company queries)
- INDEX on `status` (for status filtering)
- INDEX on `certificate_category` (for category filtering)
- INDEX on `deleted_at` (for soft delete queries)
- INDEX on `(company_id, status)` (composite for common queries)

**JSONB Field Structure** (`fields`):
```json
[
  {
    "id": "string",
    "type": "name" | "course" | "date" | "start_date" | "end_date" | "custom" | "qr_code",
    "x": number,
    "y": number,
    "width": number,
    "height": number,
    "fontSize": number,
    "fontFamily": string,
    "color": string (hex),
    "textAlign": "left" | "center" | "right",
    "prefix": string (optional),
    "suffix": string (optional),
    "dateFormat": string (optional)
  }
]
```

**Usage**:
- Template management
- Certificate generation (uses template fields)
- Category-based organization

**Backend Access**:
- `TemplateService`: CRUD operations
- `TemplateRepository`: Data access
- `CertificateService`: Uses templates for generation

**Storage**:
- Files stored in: `templates/{company_id}/{filename}`
- Public URLs for preview
- Signed URLs for secure access

---

### 4. `certificate_categories`

**Purpose**: Certificate categories and subcategories (industry-specific)

**Columns**:
- `id` (UUID, PRIMARY KEY) - Category ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NULLABLE) - Company-specific category (NULL = system-wide)
- `industry` (TEXT, NULLABLE) - Industry filter (NULL = all industries)
- `certificate_category` (TEXT, NOT NULL) - Category name
- `certificate_subcategory` (TEXT, NULLABLE) - Subcategory name
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMP, NULLABLE) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id` (Many categories to one company, NULL for system-wide)

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `industry` (for industry filtering)
- INDEX on `company_id` (for company-specific categories)
- INDEX on `certificate_category` (for category queries)
- INDEX on `deleted_at` (for soft delete queries)
- INDEX on `(industry, company_id)` (composite for category queries)

**Usage**:
- Organize templates by category
- Industry-specific category filtering
- System-wide and company-specific categories

**Backend Access**:
- `TemplateService.getCategories()`: Get categories for company's industry
- `TemplateRepository.getCategories()`: Query categories

**Query Logic**:
- Filters by company's industry (from `companies.industry`)
- Includes system-wide categories (`company_id IS NULL`)
- Includes company-specific categories (`company_id = {companyId}`)

---

### 5. `certificates`

**Purpose**: Generated certificate records

**Columns** (based on `CertificateEntity` interface):
- `id` (UUID, PRIMARY KEY) - Certificate ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Owner company
- `certificate_template_id` (UUID, FOREIGN KEY → certificate_templates.id, NULLABLE) - Source template
- `recipient_name` (TEXT, NOT NULL) - Certificate recipient name
- `recipient_email` (TEXT, NULLABLE) - Recipient email address
- `course_name` (TEXT, NULLABLE) - Course/training name
- `issue_date` (DATE/TEXT, NOT NULL) - Certificate issue date
- `expiry_date` (DATE/TEXT, NULLABLE) - Certificate expiry date (if applicable)
- `certificate_number` (TEXT, NOT NULL) - Unique certificate number
- `storage_path` (TEXT, NOT NULL) - Storage path in Supabase Storage
- `preview_url` (TEXT, NULLABLE) - Preview URL
- `verification_code` (TEXT, NOT NULL) - Verification code
- `verification_token` (TEXT, NULLABLE, UNIQUE) - Unique verification token (may be null)
- `status` (TEXT, DEFAULT 'issued') - Status: 'issued', 'revoked', 'expired'
- `issued_by` (UUID, FOREIGN KEY → users.id, NULLABLE) - User who issued certificate
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time

**Note**: Some columns may differ from actual database. Verify in Supabase Dashboard.

**Relationships**:
- `company_id` → `companies.id` (Many certificates to one company)
- `template_id` → `certificate_templates.id` (Many certificates to one template)

**Indexes** (inferred - verify in database):
- PRIMARY KEY on `id`
- UNIQUE on `verification_token` (if not null, for verification lookups)
- UNIQUE on `verification_code` (for verification lookups)
- INDEX on `company_id` (for company queries)
- INDEX on `certificate_template_id` (for template queries)
- INDEX on `status` (for status filtering)
- INDEX on `created_at` (for date-based queries)
- INDEX on `(company_id, status)` (composite for common queries)

**Usage**:
- Certificate records
- Verification (via `verification_token`)
- Billing (count certificates for invoicing)
- Revocation tracking

**Backend Access**:
- `CertificateService`: Generate certificates, list certificates
- `VerificationService`: Verify certificates
- `BillingRepository`: Count certificates for billing

**Storage**:
- PDF files stored in: `certificates/{company_id}/{certificate_id}.pdf`
- Signed URLs generated on-demand (1-hour expiry)

**Verification**:
- `verification_code`: Used for verification (may be different from token)
- `verification_token`: Alternative verification method (nullable)
- Both used in public verification endpoint

---

### 6. `import_jobs`

**Purpose**: Data import job records

**Columns** (based on `ImportJobEntity` interface):
- `id` (UUID, PRIMARY KEY) - Import job ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Owner company
- `created_by` (UUID, FOREIGN KEY → users.id, NULLABLE) - Creator user ID
- `file_name` (TEXT, NOT NULL) - Original file name
- `storage_path` (TEXT, NOT NULL) - Storage path in Supabase Storage
- `file_storage_path` (TEXT, NULLABLE) - Alternative storage path
- `status` (TEXT, DEFAULT 'pending') - Status: 'pending', 'processing', 'completed', 'failed'
- `total_rows` (INTEGER, DEFAULT 0) - Total data rows
- `success_count` (INTEGER, DEFAULT 0) - Successfully processed rows
- `failure_count` (INTEGER, DEFAULT 0) - Failed rows
- `processed_rows` (INTEGER, DEFAULT 0) - Processed rows count
- `succeeded_rows` (INTEGER, DEFAULT 0) - Succeeded rows count
- `failed_rows` (INTEGER, DEFAULT 0) - Failed rows count
- `error_message` (TEXT, NULLABLE) - Error message (if failed)
- `errors` (JSONB, NULLABLE) - Detailed error information
- `mapping` (JSONB, NULLABLE) - Field mapping configuration
- `source_type` (TEXT, DEFAULT 'csv') - Source type: 'csv', 'excel', 'api'
- `data_persisted` (BOOLEAN, DEFAULT false) - Whether data is persisted
- `reusable` (BOOLEAN, DEFAULT true) - Reusable import flag
- `certificate_category_id` (UUID, NULLABLE) - Assigned category ID
- `certificate_subcategory_id` (UUID, NULLABLE) - Assigned subcategory ID
- `template_id` (UUID, FOREIGN KEY → certificate_templates.id, NULLABLE) - Linked template
- `started_at` (TIMESTAMP, NULLABLE) - Processing start time
- `completed_at` (TIMESTAMP, NULLABLE) - Processing completion time
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMP, NULLABLE) - Soft delete timestamp

**Note**: Some columns may differ from actual database. Verify in Supabase Dashboard.

**Relationships**:
- `company_id` → `companies.id` (Many imports to one company)
- `certificate_template_id` → `certificate_templates.id` (Many imports to one template)
- `created_by` → `users.id` (Many imports to one user)

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `company_id` (for company queries)
- INDEX on `status` (for status filtering)
- INDEX on `created_at` (for date-based queries)
- INDEX on `(company_id, status)` (composite for common queries)

**Usage**:
- Track data import jobs
- Store import metadata
- Link to templates for certificate generation

**Backend Access**:
- `ImportService`: CRUD operations
- `ImportRepository`: Data access
- `DashboardRepository`: Get recent imports

**Storage**:
- Files stored in: `imports/{company_id}/{filename}`
- Signed URLs for downloads

---

### 7. `import_data_rows`

**Purpose**: Individual data rows from import jobs

**Columns** (based on `ImportDataRowEntity` interface):
- `id` (UUID, PRIMARY KEY) - Row ID
- `import_job_id` (UUID, FOREIGN KEY → import_jobs.id, NOT NULL) - Parent import job
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Owner company
- `row_number` (INTEGER, NOT NULL) - Row number in original file
- `data` (JSONB, NOT NULL) - Row data as key-value pairs
- `is_deleted` (BOOLEAN, DEFAULT false) - Soft delete flag
- `deleted_at` (TIMESTAMP, NULLABLE) - Soft delete timestamp
- `deleted_by` (UUID, FOREIGN KEY → users.id, NULLABLE) - User who deleted
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time

**Note**: Some columns may differ from actual database. Verify in Supabase Dashboard.

**Relationships**:
- `import_job_id` → `import_jobs.id` (Many rows to one import job)

**Indexes** (inferred - verify in database):
- PRIMARY KEY on `id`
- INDEX on `import_job_id` (for import job queries)
- INDEX on `company_id` (for company queries)
- INDEX on `row_number` (for ordering)
- INDEX on `is_deleted` (for soft delete filtering)
- INDEX on `(import_job_id, row_number)` (composite for pagination)

**JSONB Field Structure** (`data`):
```json
{
  "column_name_1": "value1",
  "column_name_2": "value2",
  ...
}
```

**Usage**:
- Store parsed CSV/XLSX data
- Used for certificate generation
- Paginated access for large imports

**Backend Access**:
- `ImportService.getData()`: Get paginated data rows
- `ImportRepository.getDataRows()`: Query data rows

---

### 8. `billing_profiles`

**Purpose**: Company billing configuration

**Columns**:
- `id` (UUID, PRIMARY KEY) - Billing profile ID
- `company_id` (UUID, FOREIGN KEY → companies.id, UNIQUE, NOT NULL) - Company (one-to-one)
- `platform_fee_amount` (DECIMAL, DEFAULT 0) - Platform fee per invoice
- `certificate_unit_price` (DECIMAL, NOT NULL) - Price per certificate
- `gst_rate` (DECIMAL, DEFAULT 0.18) - GST rate (18% default)
- `currency` (TEXT, DEFAULT 'INR') - Currency code
- `razorpay_customer_id` (TEXT, NULLABLE) - Razorpay customer ID
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time

**Relationships**:
- `company_id` → `companies.id` (One-to-one relationship)

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE on `company_id` (ensures one profile per company)

**Usage**:
- Billing configuration per company
- Pricing structure
- Razorpay integration

**Backend Access**:
- `BillingService.getBillingOverview()`: Get billing profile
- `BillingRepository.getBillingProfile()`: Query billing profile

---

### 9. `invoices`

**Purpose**: Invoice records

**Columns**:
- `id` (UUID, PRIMARY KEY) - Invoice ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Billing company
- `invoice_number` (TEXT, UNIQUE, NOT NULL) - Unique invoice number
- `period_start` (DATE, NOT NULL) - Billing period start
- `period_end` (DATE, NOT NULL) - Billing period end
- `subtotal` (DECIMAL, NOT NULL) - Subtotal amount
- `tax_amount` (DECIMAL, NOT NULL) - Tax amount (GST)
- `total_amount` (DECIMAL, NOT NULL) - Total amount
- `currency` (TEXT, DEFAULT 'INR') - Currency code
- `status` (TEXT, DEFAULT 'draft') - Status: 'draft', 'sent', 'paid', 'cancelled', 'partially_paid'
- `razorpay_invoice_id` (TEXT, NULLABLE) - Razorpay invoice ID
- `razorpay_payment_link` (TEXT, NULLABLE) - Razorpay payment link
- `razorpay_status` (TEXT, NULLABLE) - Razorpay status
- `razorpay_payment_id` (TEXT, NULLABLE) - Razorpay payment ID
- `due_date` (DATE, NOT NULL) - Payment due date
- `paid_at` (TIMESTAMP, NULLABLE) - Payment timestamp
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time
- `updated_at` (TIMESTAMP, DEFAULT now()) - Last update time
- `deleted_at` (TIMESTAMP, NULLABLE) - Soft delete timestamp

**Relationships**:
- `company_id` → `companies.id` (Many invoices to one company)

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE on `invoice_number`
- INDEX on `company_id` (for company queries)
- INDEX on `status` (for status filtering)
- INDEX on `razorpay_invoice_id` (for Razorpay lookups)
- INDEX on `created_at` (for date-based queries)
- INDEX on `(company_id, status)` (composite for common queries)

**Usage**:
- Invoice management
- Payment tracking
- Razorpay integration

**Backend Access**:
- `BillingService`: List invoices, get invoice details
- `BillingRepository`: Data access
- `RazorpayWebhookHandler`: Update invoice status from webhooks

---

### 10. `invoice_line_items`

**Purpose**: Invoice line items (detailed charges)

**Columns** (based on `InvoiceLineItemEntity` interface):
- `id` (UUID, PRIMARY KEY) - Line item ID
- `invoice_id` (UUID, FOREIGN KEY → invoices.id, NOT NULL) - Parent invoice
- `description` (TEXT, NOT NULL) - Item description
- `quantity` (INTEGER, NOT NULL) - Quantity
- `unit_price` (DECIMAL, NOT NULL) - Unit price
- `amount` (DECIMAL, NOT NULL) - Line total (quantity × unit_price)
- `certificate_id` (UUID, FOREIGN KEY → certificates.id, NULLABLE) - Linked certificate (if applicable)
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time

**Note**: Some columns may differ from actual database. Verify in Supabase Dashboard.

**Relationships**:
- `invoice_id` → `invoices.id` (Many line items to one invoice)

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `invoice_id` (for invoice queries)

**Usage**:
- Detailed invoice breakdown
- Certificate charges
- Platform fees

**Backend Access**:
- `BillingRepository.getLineItems()`: Get line items for invoice

---

### 11. `verification_logs`

**Purpose**: Certificate verification history

**Columns** (based on `VerificationLogEntity` interface):
- `id` (UUID, PRIMARY KEY) - Log ID
- `company_id` (UUID, FOREIGN KEY → companies.id, NOT NULL) - Company
- `certificate_id` (UUID, FOREIGN KEY → certificates.id, NULLABLE) - Verified certificate
- `result` (TEXT, NOT NULL) - Result: 'valid', 'revoked', 'expired', 'not_found'
- `verifier_ip` (TEXT, NULLABLE) - Requester IP address
- `verifier_user_agent` (TEXT, NULLABLE) - Requester user agent
- `verified_at` (TIMESTAMP, DEFAULT now()) - Verification timestamp
- `created_at` (TIMESTAMP, DEFAULT now()) - Creation time

**Note**: Some columns may differ from actual database. Verify in Supabase Dashboard.

**Relationships**:
- `certificate_id` → `certificates.id` (Many logs to one certificate)

**Indexes** (inferred - verify in database):
- PRIMARY KEY on `id`
- INDEX on `company_id` (for company queries)
- INDEX on `certificate_id` (for certificate queries)
- INDEX on `verified_at` (for date-based queries)
- INDEX on `result` (for result filtering)
- INDEX on `(company_id, verified_at)` (composite for dashboard queries)

**Usage**:
- Verification audit trail
- Analytics
- Security tracking

**Backend Access**:
- `VerificationService`: Create verification log
- `DashboardRepository`: Get recent verifications

---

### 12. `razorpay_events`

**Purpose**: Razorpay webhook events (immutable log)

**Columns**:
- `id` (UUID, PRIMARY KEY) - Event ID
- `razorpay_event_id` (TEXT, UNIQUE, NULLABLE) - Razorpay event ID (for idempotency)
- `event_type` (TEXT, NOT NULL) - Event type (e.g., 'invoice.paid')
- `payload` (JSONB, NOT NULL) - Full webhook payload
- `signature` (TEXT, NOT NULL) - Webhook signature
- `processed` (BOOLEAN, DEFAULT false) - Processing status
- `processed_at` (TIMESTAMP, NULLABLE) - Processing timestamp
- `error` (TEXT, NULLABLE) - Processing error (if any)
- `created_at` (TIMESTAMP, DEFAULT now()) - Event received time

**Relationships**:
- None (standalone event log)

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE on `razorpay_event_id` (for idempotency)
- INDEX on `event_type` (for event type filtering)
- INDEX on `processed` (for processing status)
- INDEX on `created_at` (for date-based queries)

**Usage**:
- Webhook event logging
- Idempotency (prevent duplicate processing)
- Audit trail
- Debugging

**Backend Access**:
- `RazorpayWebhookHandler`: Store and process events

**Idempotency**:
- Uses `razorpay_event_id` to prevent duplicate processing
- Events stored before processing
- Processing status tracked

---

## Table Relationships Diagram

```
companies (1) ──< (many) users
companies (1) ──< (many) certificate_templates
companies (1) ──< (many) certificates
companies (1) ──< (many) import_jobs
companies (1) ──< (many) invoices
companies (1) ──< (1) billing_profiles

certificate_templates (1) ──< (many) certificates
certificate_templates (1) ──< (many) import_jobs

import_jobs (1) ──< (many) import_data_rows

invoices (1) ──< (many) invoice_line_items

certificates (1) ──< (many) verification_logs

users (1) ──< (many) certificate_templates (created_by)
users (1) ──< (many) import_jobs (created_by)
```

## Multi-Tenant Isolation

### Strategy

All tables use `company_id` for tenant isolation:
- **Backend enforces**: All queries filter by `company_id`
- **Row-Level Security**: Not used (backend handles isolation)
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
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)  // Tenant isolation
    .maybeSingle();
}
```

## Soft Deletes

### Tables with Soft Delete

- `certificate_templates` (deleted_at)
- `companies` (deleted_at)
- `invoices` (deleted_at)

### Pattern

```sql
WHERE deleted_at IS NULL
```

All queries exclude soft-deleted records:
```typescript
.is('deleted_at', null)
```

## Indexes Strategy

### Primary Keys
- All tables use UUID primary keys
- Generated by Supabase (default)

### Foreign Key Indexes
- All foreign keys are indexed for join performance

### Composite Indexes
- Common query patterns have composite indexes:
  - `(company_id, status)` - For filtered company queries
  - `(company_id, deleted_at)` - For soft delete queries
  - `(industry, company_id)` - For category queries

### Unique Constraints
- `users.email` - Unique email
- `companies.application_id` - Unique application ID
- `certificates.verification_token` - Unique verification token
- `invoices.invoice_number` - Unique invoice number
- `razorpay_events.razorpay_event_id` - Unique event ID (idempotency)

## Data Types

### UUID
- Used for all primary keys and foreign keys
- Generated by Supabase (uuid_generate_v4())

### TEXT
- Used for strings (names, emails, URLs, etc.)
- No length limits (PostgreSQL TEXT type)

### JSONB
- Used for flexible data structures:
  - `certificate_templates.fields` - Field definitions
  - `certificates.metadata` - Additional certificate data
  - `import_data_rows.data` - Row data (key-value pairs)
  - `import_jobs.metadata` - Import metadata
  - `razorpay_events.payload` - Webhook payload

### DECIMAL
- Used for monetary values (prices, amounts)
- Precision: 10,2 (standard for currency)

### BOOLEAN
- Used for flags (revoked, processed, api_enabled, etc.)

### TIMESTAMP
- Used for all date/time fields
- Timezone-aware (TIMESTAMPTZ)
- Default: `now()`

### DATE
- Used for dates without time (issue_date, expiry_date, period_start, etc.)

## Storage Details

### Supabase Storage Bucket: `minecertificate`

**Configuration**:
- **Public Access**: Templates and logos (public URLs)
- **Private Access**: Certificates and imports (signed URLs)
- **File Size Limit**: 50MB (configured in Fastify multipart)

**Path Patterns**:
1. **Templates**: `templates/{company_id}/{timestamp}-{random}.{ext}`
2. **Certificates**: `certificates/{company_id}/{certificate_id}.pdf`
3. **Imports**: `imports/{company_id}/{timestamp}-{random}.{ext}`
4. **Logos**: `logos/{company_id}/logo.{ext}`

**URL Generation**:
- **Public URLs**: `supabase.storage.from('minecertificate').getPublicUrl(path)`
- **Signed URLs**: `supabase.storage.from('minecertificate').createSignedUrl(path, expirySeconds)`

**Signed URL Expiry**:
- Template previews: 1 hour (3600 seconds)
- Certificate downloads: 1 hour (3600 seconds)
- Import downloads: 1 hour (3600 seconds)

## Functions & Triggers

### Database Functions

(If any custom functions exist, document them here)

### Triggers

(If any triggers exist, document them here)

**Common Patterns**:
- `updated_at` auto-update (if implemented)
- Soft delete cascades (if implemented)

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

1. **Indexes**: All foreign keys and common filters indexed
2. **Pagination**: All list endpoints use pagination
3. **Selective Fields**: Only select required columns
4. **JSONB Queries**: Use JSONB operators for efficient queries

### Connection Pooling

- Supabase handles connection pooling
- Backend uses single service role client (reused)

### Caching

- No application-level caching
- Consider Redis for future optimization

## Security

### Row-Level Security (RLS)

- **Not Enabled**: Backend enforces tenant isolation in code
- **Service Role**: Backend uses service role (bypasses RLS)
- **Future**: Consider enabling RLS for defense-in-depth

### Data Encryption

- **At Rest**: Supabase encrypts database
- **In Transit**: TLS/SSL for all connections
- **API Keys**: Hashed with bcrypt

### Access Control

- **JWT Verification**: All protected endpoints verify JWT
- **Company Isolation**: All queries filter by company_id
- **API Keys**: Alternative authentication for programmatic access

## Monitoring

### Query Performance

- Supabase Dashboard provides query analytics
- Monitor slow queries
- Index usage statistics

### Storage Usage

- Monitor Supabase Storage usage
- Clean up old files (if needed)
- Implement retention policies (if needed)

## How to Verify Actual Database Schema

Since this documentation is based on codebase analysis, you should verify the actual schema:

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
  column_default,
  character_maximum_length,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'certificates'
ORDER BY ordinal_position;
```

**Get all constraints:**
```sql
SELECT
  tc.constraint_name,
  tc.constraint_type,
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'certificates';
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

### Method 3: Use the Script

A script has been created at `scripts/get-database-schema.ts` that attempts to query the schema. However, Supabase's REST API has limitations, so SQL queries are more reliable.

### Method 4: Supabase CLI

If you have Supabase CLI installed:
```bash
supabase db dump --schema public > schema.sql
```

This exports the complete schema including:
- Table definitions
- Column types and constraints
- Indexes
- Foreign keys
- Functions
- Triggers

## Future Enhancements

- **Partitioning**: Consider partitioning large tables by date
- **Archiving**: Archive old certificates/imports
- **Full-Text Search**: Add search indexes for names/descriptions
- **Time-Series Data**: Consider TimescaleDB for analytics
- **Read Replicas**: For read-heavy workloads
- **Schema Sync**: Automate schema documentation from actual database