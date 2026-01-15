# AUTHENTIX BACKEND - COMPLETE AUDIT REPORT

**Generated:** 2026-01-15  
**Auditor:** Senior Backend Architect + Supabase System Auditor  
**Scope:** Complete backend codebase analysis, API inventory, DB contract verification, storage mapping, auth/bootstrap flow, and performance review

---

## A) REPOSITORY MAP

### Entry Points
- **`src/index.ts`**: Serverless entry point (Vercel), builds Fastify app
- **`src/server/app.ts`**: Fastify application builder with plugins, middleware, routes
- **`src/api/v1/index.ts`**: API v1 route registration hub

### Directory Structure

```
src/
├── api/v1/                    # API route handlers (Fastify routes)
│   ├── auth.ts               # Authentication endpoints
│   ├── users.ts              # User profile endpoints
│   ├── organizations.ts       # Organization management
│   ├── templates.ts          # Certificate template CRUD
│   ├── imports.ts             # Import job management
│   ├── certificates.ts        # Certificate generation
│   ├── dashboard.ts           # Dashboard statistics
│   ├── billing.ts            # Invoice and billing
│   ├── verification.ts       # Public certificate verification
│   ├── webhooks.ts           # Razorpay webhook handler
│   ├── catalog.ts             # Category/subcategory management
│   └── companies.ts          # Company endpoints (NOT REGISTERED - see mismatch)
│
├── domains/                   # Business logic layer (service + repository pattern)
│   ├── auth/                 # Authentication service
│   ├── users/                # User profile service
│   ├── organizations/        # Organization service
│   ├── templates/            # Template service + PDF preview generation
│   ├── imports/              # Import job service
│   ├── certificates/         # Certificate generation service
│   ├── dashboard/             # Dashboard service (with caching)
│   ├── billing/               # Billing service
│   ├── verification/          # Verification service (uses RPC)
│   ├── webhooks/             # Razorpay webhook handler
│   ├── catalog/              # Catalog service
│   └── companies/            # Company service (duplicate of organizations?)
│
└── lib/                      # Shared utilities and infrastructure
    ├── auth/                 # JWT verification, middleware
    ├── cache/                # JWT cache, signed URL cache, dashboard cache
    ├── config/               # Environment configuration
    ├── errors/               # Error handling
    ├── logging/              # Request logging, redaction
    ├── middleware/           # Context, idempotency
    ├── razorpay/             # Razorpay client
    ├── security/              # CORS, CSRF, rate limiting, cookies
    ├── storage/               # Path validation
    ├── supabase/              # Supabase client (service role)
    ├── types/                 # Common TypeScript types
    ├── uploads/               # File validation, checksum, filename sanitization
    └── utils/                 # IDs, pagination, response helpers, validation
```

### Route Registration Flow
1. `src/index.ts` → calls `buildApp()` from `src/server/app.ts`
2. `buildApp()` → registers `/api/v1` routes via `registerV1Routes()` from `src/api/v1/index.ts`
3. `registerV1Routes()` → registers domain routes in order:
   - `registerAuthRoutes()` (no auth middleware)
   - `registerTemplateRoutes()` (with auth)
   - `registerCertificateRoutes()` (with auth)
   - `registerImportRoutes()` (with auth)
   - `registerBillingRoutes()` (with auth)
   - `registerVerificationRoutes()` (public, no auth)
   - `registerWebhookRoutes()` (signature-based auth)
   - `registerDashboardRoutes()` (with auth)
   - `registerOrganizationRoutes()` (with auth)
   - `registerUserRoutes()` (with auth)
   - `registerCatalogRoutes()` (with auth)
   - **MISSING:** `registerCompanyRoutes()` (companies.ts exists but not registered)

---

## B) API INVENTORY

### Authentication Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| POST | `/api/v1/auth/login` | auth | `src/api/v1/auth.ts:42` | none | `{ email: string, password: string }` | `{ user: {...}, session: { access_token, refresh_token, expires_at } }` | `profiles` (read) | none | Sets HttpOnly cookies + returns tokens |
| POST | `/api/v1/auth/signup` | auth | `src/api/v1/auth.ts:83` | none | `{ email, password, full_name, company_name }` | `{ message: "verification_email_sent" }` | `auth.users` (create via Supabase Auth) | none | Validates email domain (rejects personal emails) |
| POST | `/api/v1/auth/logout` | auth | `src/api/v1/auth.ts:116` | bearer/cookie | none | `{ message: "Logged out successfully" }` | none | none | Clears cookies |
| GET | `/api/v1/auth/session` | auth | `src/api/v1/auth.ts:157` | bearer/cookie (optional) | none | `{ user: {...} \| null, valid: boolean, email_verified: boolean }` | `profiles` (read) | none | Returns null if no token |
| GET | `/api/v1/auth/me` | auth | `src/api/v1/auth.ts:196` | bearer/cookie (optional) | query: `?email=...` | `{ user: {...}, valid: boolean, email_verified: boolean }` | `profiles` (read), `auth.users` (admin API) | none | Supports email query for cross-device polling |
| GET | `/api/v1/auth/verification-status` | auth | `src/api/v1/auth.ts:289` | none | query: `?email=...` | `{ verified: boolean }` | `auth.users` (admin API) | none | Public endpoint for polling |
| GET | `/api/v1/auth/csrf-token` | auth | `src/api/v1/auth.ts:341` | none | none | `{ csrf_token: string }` | none | none | Generates CSRF token |
| POST | `/api/v1/auth/resend-verification` | auth | `src/api/v1/auth.ts:362` | none | `{ email: string }` | `{ message: "verification_email_sent" }` | `auth.users` (admin API) | none | Rate limited |
| POST | `/api/v1/auth/bootstrap` | auth | `src/api/v1/auth.ts:405` | jwt-only (no membership) | none (empty body allowed) | `{ organization: {...}, membership: {...}, user: {...}, trial: {...} }` | `profiles`, `organizations`, `organization_roles`, `organization_members`, `app_audit_logs` | none | Idempotent: returns existing if already bootstrapped |

### User Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/users/me` | users | `src/api/v1/users.ts:28` | authenticated | none | `{ profile: {...}, organization: {...} \| null, membership: {...} \| null }` | `profiles`, `organization_members`, `organizations`, `organization_roles`, `files` (for logo) | none | Returns 409 if profile missing (triggers bootstrap) |

### Organization Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/organizations/me` | organizations | `src/api/v1/organizations.ts:30` | authenticated | none | `{ id, name, email, phone, website, industry, industry_id, address, city, state, country, postal_code, gst_number, cin_number, logo_file_id, logo_bucket, logo_path, logo_url, logo, created_at, updated_at }` | `organizations`, `industries`, `files` | none | Fetches industry name and logo separately (N+1) |
| PUT | `/api/v1/organizations/me` | organizations | `src/api/v1/organizations.ts:117` | authenticated | multipart or JSON | Same as GET | `organizations`, `industries`, `files` | Upload to `authentix` bucket: `org_branding/{folderId}/{fileName}` | Supports multipart for logo upload |
| GET | `/api/v1/organizations/me/api-settings` | organizations | `src/api/v1/organizations.ts:297` | authenticated | none | `{ application_id, api_key_exists, api_key_created_at, api_key_last_rotated_at }` | `organizations` | none | |
| POST | `/api/v1/organizations/me/bootstrap-identity` | organizations | `src/api/v1/organizations.ts:322` | authenticated | none | `{ application_id, api_key }` | `organizations` | none | Generates new application_id and API key |
| POST | `/api/v1/organizations/me/rotate-api-key` | organizations | `src/api/v1/organizations.ts:347` | authenticated | none | `{ application_id, api_key }` | `organizations` | none | Keeps application_id, rotates API key |

### Template Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/templates` | templates | `src/api/v1/templates.ts:37` | authenticated | query: `?status=...&include=...&page=...&limit=...` | Paginated: `{ items: [...], pagination: {...} }` | `certificate_templates` | Batch signed URLs if `include=preview_url` | Uses new schema (certificate_templates) |
| GET | `/api/v1/templates/:id` | templates | `src/api/v1/templates.ts:85` | authenticated | params: `id` | Template entity | `certificate_templates` | none | |
| POST | `/api/v1/templates` | templates | `src/api/v1/templates.ts:120` | authenticated | multipart: `file`, `title`, `category_id`, `subcategory_id` | `{ template: {...}, version: {...} }` | `certificate_templates`, `certificate_template_versions`, `files` | Upload to `authentix` bucket: `certificate_templates/{org_id}/{template_id}/v{version}/source.{ext}` | Rate limited (10/hour), validates file magic bytes |
| PUT | `/api/v1/templates/:id` | templates | `src/api/v1/templates.ts:284` | authenticated | `{ title?, status?, ... }` | Template entity | `certificate_templates` | none | |
| DELETE | `/api/v1/templates/:id` | templates | `src/api/v1/templates.ts:316` | authenticated | params: `id` | `{ id, deleted: true }` | `certificate_templates` (soft delete) | none | |
| GET | `/api/v1/templates/:id/preview` | templates | `src/api/v1/templates.ts:343` | authenticated | params: `id` | `{ preview_url: string }` | `certificate_templates`, `files` | Generate signed URL (cached) | |
| GET | `/api/v1/templates/categories` | templates | `src/api/v1/templates.ts:370` | authenticated | none | `{ categories: [...], categoryMap: {...}, industry: string \| null }` | `organizations`, `certificate_categories` | none | Legacy endpoint (uses old schema) |
| GET | `/api/v1/templates/:templateId/editor` | templates | `src/api/v1/templates.ts:392` | authenticated | params: `templateId` | `{ template: {...}, latest_version: {...}, source_file: {...}, preview_file: {...}, fields: [...] }` | `certificate_templates`, `certificate_template_versions`, `files`, `certificate_template_fields` | none | 2 queries: (template+version+files) + (fields) |
| PUT | `/api/v1/templates/:templateId/versions/:versionId/fields` | templates | `src/api/v1/templates.ts:449` | authenticated | `{ fields: [...] }` | `{ fields: [...], fields_count: number, updated_at: string }` | `certificate_template_fields` | none | Atomic replace (delete + insert), creates audit log |
| POST | `/api/v1/templates/:templateId/versions/:versionId/preview` | templates | `src/api/v1/templates.ts:563` | authenticated | params: `templateId`, `versionId` | `{ status: "generated" \| "already_exists", preview_file_id, preview_bucket, preview_path }` | `certificate_template_versions`, `files` | Upload preview to `authentix` bucket | Idempotent: skips if preview exists |

### Import Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/import-jobs` | imports | `src/api/v1/imports.ts:33` | authenticated | query: `?status=...&page=...&limit=...` | Paginated: `{ items: [...], pagination: {...} }` | `file_import_jobs` | none | |
| GET | `/api/v1/import-jobs/:id` | imports | `src/api/v1/imports.ts:75` | authenticated | params: `id` | Import job entity | `file_import_jobs` | none | |
| POST | `/api/v1/import-jobs` | imports | `src/api/v1/imports.ts:103` | authenticated | multipart: `file`, `metadata` (JSON) | Import job entity | `file_import_jobs`, `import_data_rows` (if reusable) | Upload to `authentix` bucket: `file_imports/{org_id}/{filename}` | Rate limited (10/hour), validates file magic bytes |
| GET | `/api/v1/import-jobs/:id/data` | imports | `src/api/v1/imports.ts:173` | authenticated | params: `id`, query: `?page=...&limit=...` | Paginated: `{ items: [...], pagination: {...} }` | `import_data_rows` | none | |
| GET | `/api/v1/import-jobs/:id/download` | imports | `src/api/v1/imports.ts:213` | authenticated | params: `id` | `{ download_url: string }` | `file_import_jobs` | Generate signed URL | |

### Certificate Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| POST | `/api/v1/certificates/generate` | certificates | `src/api/v1/certificates.ts:32` | authenticated | `{ template_id, data: [...], field_mappings: [...], options?: {...} }` | `{ status: "completed" \| "pending", download_url?, job_id?, total_certificates, certificates: [...] }` | `certificate_templates` (read) | Upload ZIP to `authentix` bucket: `bulk-downloads/{org_id}/{filename}` | Idempotency protection, sync for ≤50, async for >50 (TODO) |

### Dashboard Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/dashboard/stats` | dashboard | `src/api/v1/dashboard.ts:28` | authenticated | none | `{ stats: {...}, recentImports: [...], recentVerifications: [...] }` | `certificates`, `file_import_jobs`, `certificate_verification_events`, `files` (via join) | none | Uses cache (250ms → 2ms), parallel queries |

### Billing Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/billing/invoices` | billing | `src/api/v1/billing.ts:30` | authenticated | query: `?status=...&page=...&limit=...` | Paginated: `{ items: [...], pagination: {...} }` | `invoices` | none | |
| GET | `/api/v1/billing/invoices/:id` | billing | `src/api/v1/billing.ts:71` | authenticated | params: `id` | `{ invoice: {...}, line_items: [...] }` | `invoices`, `invoice_line_items` | none | |
| GET | `/api/v1/billing/overview` | billing | `src/api/v1/billing.ts:101` | authenticated | none | `{ billing_profile: {...}, current_usage: {...}, current_period: {...}, recent_invoices: [...], total_outstanding: number }` | `billing_profiles`, `certificates`, `invoices` | none | Calculates usage for current month, billing for previous month |

### Verification Endpoints (Public)

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| POST | `/api/v1/verification/verify` | verification | `src/api/v1/verification.ts:23` | none (public) | `{ token: string }` | `{ valid: boolean, certificate_id?, recipient_name?, course_name?, issued_at?, expiry_date?, status?, company_name?, company_logo?, result: "valid" \| "revoked" \| "expired" \| "not_found", message: string }` | `certificates` (via RPC `verify_certificate`), `certificate_verification_events` | none | Uses Supabase RPC function, logs verification events |

### Webhook Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| POST | `/api/v1/webhooks/razorpay` | webhooks | `src/api/v1/webhooks.ts:34` | signature (x-razorpay-signature) | Razorpay webhook payload | `{ received: boolean, stored?: boolean, processed?: boolean, error?: string }` | `billing_webhook_events` (via handler) | none | Always returns 200 OK (prevents Razorpay retries) |

### Catalog Endpoints

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/catalog/categories` | catalog | `src/api/v1/catalog.ts:30` | authenticated | none | `{ groups: [...], flat: [...] }` | `organizations`, `v_effective_categories` | none | Returns 409 if industry_id not set |
| GET | `/api/v1/catalog/categories/:categoryId/subcategories` | catalog | `src/api/v1/catalog.ts:99` | authenticated | params: `categoryId` | `{ category_id: string, items: [...] }` | `v_effective_subcategories` | none | Validates category belongs to org |

### Company Endpoints (NOT REGISTERED - MISMATCH)

| Method | Path | Domain | Handler File | Auth | Request Schema | Response Schema | DB Tables | Storage Actions | Notes |
|--------|------|--------|--------------|------|----------------|-----------------|-----------|-----------------|-------|
| GET | `/api/v1/companies/me` | companies | `src/api/v1/companies.ts:30` | authenticated | none | Company entity | `companies` | none | **ENDPOINT NOT REGISTERED** - file exists but not in index.ts |
| PUT | `/api/v1/companies/me` | companies | `src/api/v1/companies.ts:55` | authenticated | multipart or JSON | Company entity | `companies` | Upload to `minecertificate` bucket (legacy) | **ENDPOINT NOT REGISTERED** |
| GET | `/api/v1/companies/me/api-settings` | companies | `src/api/v1/companies.ts:119` | authenticated | none | API settings | `companies` | none | **ENDPOINT NOT REGISTERED** |
| PUT | `/api/v1/companies/me/api-settings` | companies | `src/api/v1/companies.ts:144` | authenticated | `{ api_enabled: boolean }` | `{ api_enabled: boolean }` | `companies` | none | **ENDPOINT NOT REGISTERED** |
| POST | `/api/v1/companies/me/bootstrap-identity` | companies | `src/api/v1/companies.ts:172` | authenticated | none | `{ application_id, api_key }` | `companies` | none | **ENDPOINT NOT REGISTERED** |
| POST | `/api/v1/companies/me/rotate-api-key` | companies | `src/api/v1/companies.ts:197` | authenticated | none | `{ application_id, api_key }` | `companies` | none | **ENDPOINT NOT REGISTERED** |

**CRITICAL ISSUE:** `companies.ts` exists but is not registered in `src/api/v1/index.ts`. This appears to be a duplicate/legacy implementation of organizations functionality. The code references `companies` table which may not exist (see DB mismatches section).

---

## C) DOMAIN MODULES

### Auth Domain

**Service:** `src/domains/auth/service.ts`
- `login()`: Validates email verification, returns session
- `signup()`: Creates user via Supabase Auth, validates email domain
- `verifySession()`: Verifies JWT, returns user info
- `logout()`: No-op (tokens expire naturally)
- `resendVerificationEmail()`: Resends verification email
- `bootstrap()`: Creates profile, organization, roles, membership, trial (idempotent)

**DB Interactions:**
- `profiles`: Read (login, verifySession), Create (bootstrap)
- `organizations`: Create (bootstrap), Read (bootstrap idempotency check)
- `organization_roles`: Create (bootstrap: owner, admin, member)
- `organization_members`: Create (bootstrap), Read (idempotency check)
- `app_audit_logs`: Create (bootstrap: org.created, member.joined)
- `auth.users`: Read via Admin API (bootstrap, verifySession)

**Error Handling:**
- `ValidationError` (400): Invalid input, email not verified, email domain rejected
- `Error` (500): Database failures, auth failures

### Users Domain

**Service:** `src/domains/users/service.ts`
- `getProfile()`: Returns user profile with organization and membership

**Repository:** `src/domains/users/repository.ts`
- `getProfile()`: Single query with joins (profiles + organization_members + organizations + organization_roles + files for logo)

**DB Interactions:**
- `profiles`: Read
- `organization_members`: Read (join)
- `organizations`: Read (join)
- `organization_roles`: Read (join)
- `files`: Read (optional, for logo)

**Error Handling:**
- Returns `null` if profile missing (triggers 409 PROFILE_NOT_READY)
- `Error` (500): Database failures

### Organizations Domain

**Service:** `src/domains/organizations/service.ts`
- `getById()`: Get organization
- `update()`: Update organization, handles logo upload
- `getAPISettings()`: Get API settings
- `bootstrapIdentity()`: Generate application_id and API key
- `rotateAPIKey()`: Rotate API key (keep application_id)

**Repository:** `src/domains/organizations/repository.ts`
- `findById()`: Read organization
- `update()`: Update organization
- `getAPISettings()`: Read API settings
- `updateAPIKeyRotatedAt()`: Update timestamp

**DB Interactions:**
- `organizations`: Read, Update
- `industries`: Read (for industry name)
- `files`: Create (logo upload), Read (logo info)

**Storage Actions:**
- Upload logo: `org_branding/{folderId}/{fileName}` in `authentix` bucket
- Creates `files` row with `kind='org_logo'`

**Error Handling:**
- `NotFoundError` (404): Organization not found
- `ValidationError` (400): Invalid input
- `Error` (500): Database/storage failures

**N+1 Issue:**
- `GET /organizations/me`: Fetches industry name separately (line 42-50), logo file separately (line 56-72)

### Templates Domain

**Service:** `src/domains/templates/service.ts`
- `getById()`: Get template
- `list()`: List templates with optional preview URLs
- `create()`: Legacy create (uses old schema)
- `createWithNewSchema()`: New create (certificate_templates + versions + files)
- `update()`: Update template
- `delete()`: Soft delete template
- `getPreviewUrl()`: Get signed preview URL (cached)
- `getCategories()`: Legacy categories (old schema)
- `getTemplateForEditor()`: Get template + version + files + fields
- `updateFields()`: Replace fields atomically
- `generatePreview()`: Generate preview (idempotent)

**Repository:** `src/domains/templates/repository.ts`
- `findById()`: Read template
- `findAll()`: List templates
- `create()`: Legacy create
- `createWithNewSchema()`: Create template record
- `createFileEntry()`: Create files row
- `createTemplateVersion()`: Create version
- `updateLatestVersion()`: Update template.latest_version_id
- `getTemplateForEditor()`: 2 queries: (template+version+files) + (fields)
- `validateTemplateAndVersion()`: Validate ownership
- `replaceFields()`: Delete + bulk insert fields
- `getVersionForPreview()`: Get version with source file
- `updatePreviewFileId()`: Update version.preview_file_id

**DB Interactions:**
- `certificate_templates`: CRUD
- `certificate_template_versions`: Create, Read
- `files`: Create (source, preview), Read
- `certificate_template_fields`: Create, Read, Delete (replace)
- `certificate_categories`: Read (legacy)
- `app_audit_logs`: Create (template.created, template.fields_updated, template.preview_generated)

**Storage Actions:**
- Upload source: `certificate_templates/{org_id}/{template_id}/v{version}/source.{ext}` in `authentix` bucket
- Upload preview: `certificate_templates/{org_id}/{template_id}/v{version}/preview.{format}` in `authentix` bucket
- Validates paths against `files_path_chk` constraint

**Error Handling:**
- `NotFoundError` (404): Template/version not found
- `ValidationError` (400): Invalid input, path constraint violation, field validation errors
- `Error` (500): Database/storage failures

**Performance:**
- `list()`: Batch generates signed URLs if `include=preview_url` (avoids N+1)
- `getTemplateForEditor()`: Uses 2 queries (template+version+files join, then fields)

### Imports Domain

**Service:** `src/domains/imports/service.ts`
- `getById()`: Get import job
- `list()`: List import jobs
- `create()`: Create import job from file
- `getDataRows()`: Get import data rows
- `getFileUrl()`: Get signed download URL

**Repository:** `src/domains/imports/repository.ts`
- `findById()`: Read import job
- `findAll()`: List import jobs
- `create()`: Create import job
- `update()`: Update import job
- `storeDataRows()`: Store import data rows
- `getDataRows()`: Get import data rows

**DB Interactions:**
- `file_import_jobs`: CRUD
- `import_data_rows`: Create, Read (if reusable)

**Storage Actions:**
- Upload file: `file_imports/{org_id}/{filename}` in `authentix` bucket
- Generate signed URL for download

**Error Handling:**
- `NotFoundError` (404): Import job not found
- `ValidationError` (400): Invalid file, empty file
- `Error` (500): Database/storage failures

**Note:** Repository references `import_jobs` table but API uses `file_import_jobs` (see mismatch).

### Certificates Domain

**Service:** `src/domains/certificates/service.ts`
- `generateCertificates()`: Generate certificates from template and data

**DB Interactions:**
- `certificate_templates`: Read (get template)

**Storage Actions:**
- Upload ZIP: `bulk-downloads/{org_id}/{filename}` in `authentix` bucket (legacy bucket `minecertificate`)
- Generate signed URL for download

**Error Handling:**
- `NotFoundError` (404): Template not found
- `ValidationError` (400): Template not active
- `Error` (500): Generation/storage failures

**Note:** Uses legacy bucket `minecertificate` instead of `authentix`. Should be updated.

### Dashboard Domain

**Service:** `src/domains/dashboard/service.ts`
- `getDashboardData()`: Get dashboard stats with caching

**Repository:** `src/domains/dashboard/repository.ts`
- `getStats()`: 4 parallel count queries
- `getRecentImports()`: List imports with file join
- `getRecentVerifications()`: List verification events with certificate join

**DB Interactions:**
- `certificates`: Count (total, revoked)
- `file_import_jobs`: Count (pending), Read (recent)
- `certificate_verification_events`: Count (today), Read (recent)
- `files`: Read (via join for import file names)

**Error Handling:**
- Returns zeros/empty arrays on errors (graceful degradation)
- Logs errors but doesn't throw

**Performance:**
- Uses cache (250ms → 2ms for cached loads)
- Parallel queries for stats

**N+1 Issues:**
- `getRecentImports()`: Joins files table (good, avoids N+1)
- `getRecentVerifications()`: Joins certificates table (good, avoids N+1)

### Billing Domain

**Service:** `src/domains/billing/service.ts`
- `getInvoice()`: Get invoice
- `listInvoices()`: List invoices
- `getInvoiceWithLineItems()`: Get invoice + line items
- `getBillingOverview()`: Get billing overview with usage calculations

**Repository:** `src/domains/billing/repository.ts`
- `findInvoiceById()`: Read invoice
- `findInvoices()`: List invoices
- `getInvoiceLineItems()`: Read line items
- `getBillingProfile()`: Read billing profile
- `getUnbilledCertificateCount()`: Count unbilled certificates

**DB Interactions:**
- `invoices`: Read
- `invoice_line_items`: Read
- `billing_profiles`: Read
- `certificates`: Count (unbilled)

**Error Handling:**
- `NotFoundError` (404): Invoice/billing profile not found
- `Error` (500): Database failures

**Note:** Repository references `company_id` but should use `organization_id` (see mismatch).

### Verification Domain

**Service:** `src/domains/verification/service.ts`
- `verifyCertificate()`: Verify certificate by token (uses RPC)

**DB Interactions:**
- `certificates`: Read (via RPC `verify_certificate`), Read (for organization_id)
- `certificate_verification_events`: Create (log verification)

**Error Handling:**
- Returns `{ valid: false, result: "not_found" }` on errors (never throws)

### Catalog Domain

**Service:** `src/domains/catalog/service.ts`
- `getCategories()`: Get categories grouped by group_key
- `getSubcategories()`: Get subcategories for category

**Repository:** `src/domains/catalog/repository.ts`
- `getOrganizationIndustry()`: Read organization.industry_id
- `getEffectiveCategories()`: Read from `v_effective_categories` view
- `getEffectiveSubcategories()`: Read from `v_effective_subcategories` view
- `validateCategoryForOrganization()`: Validate category belongs to org
- `validateSubcategoryForOrganization()`: Validate subcategory belongs to org/category

**DB Interactions:**
- `organizations`: Read (industry_id)
- `v_effective_categories`: Read (view)
- `v_effective_subcategories`: Read (view)

**Error Handling:**
- `ConflictError` (409): Organization industry not set
- `NotFoundError` (404): Category not found for organization
- `Error` (500): Database failures

### Companies Domain (Legacy/Duplicate)

**Service:** `src/domains/companies/service.ts`
- Similar to organizations service but references `companies` table

**Note:** This appears to be legacy code. The `companies` table may not exist (see mismatches). Endpoints are not registered.

---

## D) DB CONTRACT & CONSISTENCY CHECK

### Database Schema Reference
Based on `architecture-design/DATABASE_DOCUMENTATION.md` (generated from PostgREST OpenAPI).

### Backend → Database Mappings

#### Tables Referenced by Backend

1. **`profiles`**
   - Used in: `src/domains/auth/service.ts`, `src/domains/users/repository.ts`
   - Columns: `id`, `email`, `first_name`, `last_name`, `created_at`
   - ✅ Matches schema

2. **`organizations`**
   - Used in: `src/domains/auth/service.ts`, `src/domains/organizations/repository.ts`, `src/domains/users/repository.ts`, `src/domains/catalog/repository.ts`
   - Columns: `id`, `name`, `slug`, `email`, `phone`, `website_url`, `industry_id`, `address_line1`, `address_line2`, `city`, `state_province`, `country`, `postal_code`, `tax_id`, `gstin`, `logo_file_id`, `application_id`, `api_key_hash`, `billing_status`, `trial_started_at`, `trial_ends_at`, `trial_free_certificates_limit`, `trial_free_certificates_used`, `billing_address`, `created_at`, `updated_at`, `deleted_at`
   - ✅ Matches schema

3. **`organization_members`**
   - Used in: `src/domains/auth/service.ts`, `src/domains/users/repository.ts`, `src/lib/auth/jwt-verifier.ts`
   - Columns: `id`, `organization_id`, `user_id`, `username`, `role_id`, `status`, `deleted_at`
   - ✅ Matches schema

4. **`organization_roles`**
   - Used in: `src/domains/auth/service.ts`, `src/domains/users/repository.ts`, `src/lib/auth/jwt-verifier.ts`
   - Columns: `id`, `organization_id`, `key`, `name`, `is_system`
   - ✅ Matches schema

5. **`certificate_templates`**
   - Used in: `src/domains/templates/repository.ts`
   - Columns: `id`, `organization_id`, `title`, `status`, `category_id`, `subcategory_id`, `latest_version_id`, `created_by_user_id`, `created_at`, `updated_at`, `deleted_at`
   - ✅ Matches schema (new schema)

6. **`certificate_template_versions`**
   - Used in: `src/domains/templates/repository.ts`
   - Columns: `id`, `template_id`, `version_number`, `source_file_id`, `preview_file_id`, `page_count`, `normalized_pages`, `created_at`
   - ✅ Matches schema

7. **`certificate_template_fields`**
   - Used in: `src/domains/templates/repository.ts`
   - Columns: `id`, `template_version_id`, `field_key`, `label`, `type`, `page_number`, `x`, `y`, `width`, `height`, `style`, `required`, `created_at`
   - ✅ Matches schema

8. **`files`**
   - Used in: `src/domains/templates/repository.ts`, `src/domains/organizations/service.ts`, `src/domains/users/repository.ts`, `src/domains/dashboard/repository.ts`
   - Columns: `id`, `organization_id`, `bucket`, `path`, `kind`, `original_name`, `mime_type`, `size_bytes`, `checksum_sha256`, `created_by_user_id`, `created_at`, `deleted_at`
   - ✅ Matches schema
   - **Constraint:** `files_path_chk` enforces path format (validated in `src/lib/storage/path-validator.ts`)

9. **`file_import_jobs`**
   - Used in: `src/domains/imports/repository.ts`, `src/domains/dashboard/repository.ts`
   - Columns: `id`, `organization_id`, `source_file_id`, `status`, `row_count`, `created_at`, etc.
   - ✅ Matches schema
   - **Note:** Repository code references `import_jobs` in some places but should use `file_import_jobs`

10. **`import_data_rows`**
    - Used in: `src/domains/imports/repository.ts`
    - Columns: `id`, `import_job_id`, `organization_id`, `row_number`, `data`, `is_deleted`, `deleted_at`, `deleted_by`, `created_at`
    - ✅ Matches schema

11. **`certificates`**
    - Used in: `src/domains/dashboard/repository.ts`, `src/domains/billing/repository.ts`, `src/domains/verification/service.ts`
    - Columns: `id`, `organization_id`, `generation_job_id`, `template_id`, `template_version_id`, `category_id`, `subcategory_id`, `recipient_name`, `recipient_email`, `recipient_phone`, `recipient_data`, `certificate_file_id`, `certificate_preview_file_id`, `certificate_number`, `issued_at`, `expires_at`, `status`, `revoked_at`, `reissued_from_certificate_id`, `verification_token_hash`, `verification_path`, `qr_payload_url`
    - ✅ Matches schema

12. **`certificate_verification_events`**
    - Used in: `src/domains/dashboard/repository.ts`, `src/domains/verification/service.ts`
    - Columns: `id`, `organization_id`, `certificate_id`, `scanned_at`, `result`, `ip_hash`, `user_agent`, `metadata`
    - ✅ Matches schema

13. **`invoices`**
    - Used in: `src/domains/billing/repository.ts`
    - Columns: `id`, `company_id`, `invoice_number`, `period_start`, `period_end`, `subtotal`, `tax_amount`, `total_amount`, `currency`, `status`, `razorpay_invoice_id`, `razorpay_payment_link`, `razorpay_status`, `due_date`, `paid_at`, `created_at`, `updated_at`, `deleted_at`
    - ⚠️ **MISMATCH:** Backend uses `company_id` but schema may use `organization_id` (needs verification)

14. **`invoice_line_items`**
    - Used in: `src/domains/billing/repository.ts`
    - Columns: `id`, `invoice_id`, `description`, `quantity`, `unit_price`, `amount`, `certificate_id`, `created_at`
    - ✅ Matches schema

15. **`billing_profiles`**
    - Used in: `src/domains/billing/repository.ts`
    - Columns: `id`, `company_id`, `platform_fee_amount`, `certificate_unit_price`, `gst_rate`, `currency`, `razorpay_customer_id`, `created_at`, `updated_at`
    - ⚠️ **MISMATCH:** Backend uses `company_id` but schema may use `organization_id` (needs verification)

16. **`app_audit_logs`**
    - Used in: `src/domains/auth/service.ts`, `src/domains/templates/service.ts`
    - Columns: `organization_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata`, `created_at`
    - ✅ Matches schema

17. **`industries`**
    - Used in: `src/api/v1/organizations.ts`
    - Columns: `id`, `name`
    - ✅ Matches schema

18. **`v_effective_categories`** (View)
    - Used in: `src/domains/catalog/repository.ts`
    - Columns: `organization_id`, `category_id`, `key`, `name`, `group_key`, `sort_order`, `is_org_custom`, `is_hidden`
    - ✅ Matches schema

19. **`v_effective_subcategories`** (View)
    - Used in: `src/domains/catalog/repository.ts`
    - Columns: `organization_id`, `subcategory_id`, `category_id`, `key`, `name`, `sort_order`, `is_org_custom`, `is_hidden`
    - ✅ Matches schema

20. **`certificate_categories`** (Legacy)
    - Used in: `src/domains/templates/repository.ts` (legacy endpoint)
    - Columns: `certificate_category`, `certificate_subcategory`, `industry`, `organization_id`, `deleted_at`
    - ⚠️ **LEGACY:** Old schema, should migrate to new catalog system

### RPC Functions Referenced

1. **`verify_certificate(token)`**
   - Used in: `src/domains/verification/service.ts:26`
   - ✅ Matches schema

### MISMATCHES FOUND

#### P0 - Critical Blockers

1. **`companies` table references (companies.ts not registered)**
   - **File:** `src/api/v1/companies.ts`, `src/domains/companies/service.ts`, `src/domains/companies/repository.ts`
   - **Issue:** Code references `companies` table but:
     - Endpoints are not registered in `src/api/v1/index.ts`
     - `companies` table may not exist (schema shows `organizations` table)
     - Appears to be duplicate/legacy code
   - **Fix:** Remove `companies.ts` files or migrate to `organizations` if `companies` table exists

2. **Billing tables use `company_id` instead of `organization_id`**
   - **Files:** `src/domains/billing/repository.ts:16`, `src/domains/billing/repository.ts:106`, `src/domains/billing/repository.ts:133`
   - **Issue:** Backend queries use `company_id` but schema may use `organization_id`
   - **Fix:** Verify schema and update queries to use `organization_id` if needed

3. **Import repository references `import_jobs` instead of `file_import_jobs`**
   - **File:** `src/domains/imports/repository.ts:19`, `src/domains/imports/repository.ts:46`
   - **Issue:** Repository queries `import_jobs` but schema shows `file_import_jobs`
   - **Fix:** Update all references from `import_jobs` to `file_import_jobs`

#### P1 - Correctness Issues

4. **Legacy template categories endpoint uses old schema**
   - **File:** `src/api/v1/templates.ts:370`, `src/domains/templates/repository.ts:182`
   - **Issue:** `GET /templates/categories` uses `certificate_categories` (old schema) instead of `v_effective_categories`
   - **Fix:** Migrate to use catalog service or deprecate endpoint

5. **Certificate generation uses legacy bucket `minecertificate`**
   - **File:** `src/domains/certificates/service.ts:122`
   - **Issue:** Uploads to `minecertificate` bucket instead of `authentix`
   - **Fix:** Update to use `authentix` bucket

6. **Company service uses legacy bucket `minecertificate`**
   - **File:** `src/domains/companies/service.ts:47`
   - **Issue:** Uploads to `minecertificate` bucket (also endpoint not registered)
   - **Fix:** Remove or update to use `authentix` bucket

#### P2 - Performance Issues

7. **Organizations GET endpoint has N+1 queries**
   - **File:** `src/api/v1/organizations.ts:40-72`
   - **Issue:** Fetches industry name and logo file separately
   - **Fix:** Use joins or single query with selects

8. **Template list may have N+1 for preview URLs**
   - **File:** `src/domains/templates/service.ts:77`
   - **Status:** ✅ **FIXED** - Uses batch signed URL generation

#### P3 - Cleanup

9. **Legacy template schema still referenced**
   - **Files:** `src/domains/templates/repository.ts:231` (mapToEntity uses old columns)
   - **Issue:** `create()` method still uses old schema columns
   - **Fix:** Deprecate or remove legacy create method

10. **Unused/duplicate code**
    - **Files:** `src/domains/companies/*` (entire domain)
    - **Issue:** Duplicate of organizations, not registered
    - **Fix:** Remove if not needed

---

## E) STORAGE CONTRACT

### Storage Bucket: `authentix`

**Configuration:**
- Public: `false`
- Type: `STANDARD`
- File size limit: `52428800` bytes (50MB)
- Allowed MIME types: PDF, CSV, ZIP, JSON, Excel, Word, PowerPoint, Images (PNG, JPEG, WebP, GIF, SVG, HEIC, HEIF, TIFF, BMP, AVIF)

### Storage Path Format

**Allowed Roots (enforced by `files_path_chk` constraint):**
- `org_branding`
- `certificate_templates`
- `file_imports`
- `certificates`
- `exports`
- `deliveries`
- `invoices`

**Path Format Constraints:**
- Max length: 512 characters (enforced by DB constraint)
- Must start with one of the allowed roots
- Validated in: `src/lib/storage/path-validator.ts`

### Storage Operations

#### Template Source Files
- **Path:** `certificate_templates/{org_id}/{template_id}/v{version_padded}/source.{ext}`
- **Generated by:** `generateTemplateSourcePath()` in `src/lib/storage/path-validator.ts`
- **Example:** `certificate_templates/123e4567-e89b-12d3-a456-426614174000/789e0123-e45b-67c8-d901-234567890abc/v0001/source.pdf`
- **Files row:** `kind='template_source'`

#### Template Preview Files
- **Path:** `certificate_templates/{org_id}/{template_id}/v{version_padded}/preview.{format}`
- **Generated by:** `generateTemplatePreviewPath()` in `src/lib/storage/path-validator.ts`
- **Example:** `certificate_templates/123e4567-e89b-12d3-a456-426614174000/789e0123-e45b-67c8-d901-234567890abc/v0001/preview.webp`
- **Files row:** `kind='template_preview'` (inferred)

#### Organization Logos
- **Path:** `org_branding/{folderId}/{fileName}`
- **Generated by:** `src/domains/organizations/service.ts:44`
- **Example:** `org_branding/123e4567-e89b-12d3-a456-426614174000/logo_1234567890.png`
- **Files row:** `kind='org_logo'`

#### Import Files
- **Path:** `file_imports/{org_id}/{filename}`
- **Generated by:** `src/domains/imports/service.ts:123`
- **Example:** `file_imports/123e4567-e89b-12d3-a456-426614174000/import_1234567890.xlsx`
- **Files row:** Not created (imports use `file_import_jobs.source_file_id`)

#### Certificate ZIP Files (Legacy)
- **Path:** `bulk-downloads/{org_id}/{filename}`
- **Generated by:** `src/domains/certificates/service.ts:119`
- **Bucket:** `minecertificate` (legacy, should be `authentix`)
- **Issue:** Uses legacy bucket and path format

### Signed URLs

**Generation:**
- Uses `supabase.storage.from('authentix').createSignedUrl(path, expiresIn)`
- Default expiry: 3600 seconds (1 hour)
- Cached in: `src/lib/cache/signed-url-cache.ts`

**Endpoints Returning Signed URLs:**
- `GET /templates/:id/preview` → Template preview URL
- `GET /import-jobs/:id/download` → Import file download URL
- `POST /certificates/generate` → Certificate ZIP download URL

### Delete Semantics

**Soft Delete:**
- `files.deleted_at` set to timestamp (soft delete)
- Storage object NOT deleted automatically
- Cascading: None (manual cleanup required)

**Hard Delete (Cleanup):**
- Storage object deleted via `supabase.storage.from('authentix').remove([path])`
- Files row soft-deleted via `files.deleted_at`
- Performed in error cleanup paths (e.g., `src/domains/templates/service.ts:621-632`)

---

## F) AUTH/BOOTSTRAP DEEP DIVE

### Signup → Verification → Login → Bootstrap Sequence

#### Step 1: Signup (`POST /auth/signup`)
**File:** `src/domains/auth/service.ts:103`
1. Validates email domain (rejects personal emails)
2. Calls `supabase.auth.signUp()` with:
   - Email, password
   - `emailRedirectTo`: `${FRONTEND_URL}/auth/callback`
   - Metadata: `{ full_name, company_name }`
3. Returns `{ message: "verification_email_sent" }` (NO SESSION)
4. **DB:** Creates `auth.users` row (via Supabase Auth)
5. **DB:** No `profiles` row yet (created in bootstrap)

#### Step 2: Email Verification (Frontend)
1. User clicks link in email
2. Supabase Auth verifies email, sets `auth.users.email_confirmed_at`
3. Frontend redirects to `/auth/callback`
4. Frontend calls `POST /auth/bootstrap`

#### Step 3: Bootstrap (`POST /auth/bootstrap`)
**File:** `src/domains/auth/service.ts:229`
**Auth:** JWT-only (no membership required, since we're creating it)

**Idempotency Check:**
1. Checks for existing active membership (line 336-359)
2. If exists, returns existing data (line 373-396)
3. If not, proceeds with creation

**Creation Flow (if not exists):**
1. **Ensure Profile** (line 246-332):
   - Checks if `profiles.id = auth.users.id` exists
   - If not, creates profile from auth user metadata:
     - `id = userId` (MUST equal auth.users.id)
     - `first_name`, `last_name` (parsed from `full_name`)
     - `email` (from auth user)

2. **Generate Organization Slug** (line 428-460):
   - Generates 20-character lowercase slug: `[a-z]{20}`
   - Checks uniqueness (up to 10 attempts)
   - Never accepts slug from frontend (always server-generated)

3. **Generate Application ID and API Key** (line 462-469):
   - `application_id`: Generated via `generateApplicationId()` (UUID-like)
   - `api_key`: Generated via `generateAPIKey()` (random string)
   - `api_key_hash`: SHA-256 hash of API key (plaintext never stored)

4. **Create Organization** (line 472-606):
   - Inserts with:
     - `name`: From `company_name` metadata or email prefix
     - `slug`: Generated 20-char slug
     - `application_id`: Generated
     - `api_key_hash`: SHA-256 hash
     - `billing_status`: `'trialing'`
     - `trial_started_at`: `now()`
     - `trial_ends_at`: `now() + 7 days`
     - `trial_free_certificates_limit`: `10`
     - `trial_free_certificates_used`: `0`
     - `billing_address`: `{ source: 'bootstrap', status: 'incomplete', provided_at: null }` (required NOT NULL jsonb)
   - Retries on unique violation (slug collision)

5. **Create System Roles** (line 608-707):
   - Creates `organization_roles` for: `owner`, `admin`, `member`
   - Parallel checks, then parallel creates
   - Gets `owner` role ID

6. **Create Membership** (line 711-772):
   - Generates unique username (from email prefix, with suffix if needed)
   - Inserts `organization_members`:
     - `organization_id`: New org ID
     - `user_id`: User ID
     - `username`: Generated unique username
     - `role_id`: Owner role ID
     - `status`: `'active'`

7. **Create Audit Logs** (line 774-800):
   - `app_audit_logs` entries:
     - `org.created` (entity: organization)
     - `member.joined` (entity: organization_member)
   - Non-fatal (doesn't fail bootstrap if audit fails)

8. **Return Result** (line 815-824):
   - Returns: `{ organization, membership, user, trial }`

#### Step 4: Login (`POST /auth/login`)
**File:** `src/domains/auth/service.ts:54`
1. Calls `supabase.auth.signInWithPassword()`
2. **Checks email verification** (line 69-71):
   - Throws `ValidationError` if `email_confirmed_at` is null
3. Fetches profile (for `full_name`)
4. Returns session tokens + sets HttpOnly cookies
5. **DB:** Reads `profiles` (for name)

### Bootstrap Idempotency Rules

1. **Profile:** Safe to call multiple times (checks existence first)
2. **Organization:** Checked via membership lookup (if membership exists, org exists)
3. **Roles:** Checked before creation (parallel checks, only creates missing)
4. **Membership:** Checked before creation (returns existing if found)

### Trial Initialization

**Fields Set:**
- `trial_started_at`: `now()` (explicit, though default is `now()`)
- `trial_ends_at`: `now() + 7 days`
- `trial_free_certificates_limit`: `10`
- `trial_free_certificates_used`: `0`
- `billing_status`: `'trialing'`

**Defaults (from schema):**
- If not set, defaults would apply, but bootstrap sets explicitly for clarity

### Failure Modes

1. **Profile Creation Fails:**
   - Error: `[Bootstrap Step: Profile Creation] Failed to create profile`
   - Returns: 500 with step info

2. **Slug Collision (after 10 attempts):**
   - Error: `[Bootstrap Step: Slug Generation] Failed to generate unique slug`
   - Returns: 500

3. **Organization Creation Fails:**
   - Error: `[Bootstrap Step: Organization Creation] Failed to create organization`
   - Returns: 500 with Postgres error code

4. **Role Creation Fails:**
   - Error: `[Bootstrap Step: Roles Seed] Failed to create roles`
   - Returns: 500

5. **Membership Creation Fails:**
   - Error: `[Bootstrap Step: Membership Creation] Failed to create membership`
   - Returns: 500
   - **Note:** Organization already created (no rollback)

6. **Audit Log Fails:**
   - Logged as warning, but bootstrap succeeds (non-fatal)

### Error Surface to Frontend

- **401 Unauthorized:** No JWT token (middleware throws)
- **400 Validation Error:** Invalid input (shouldn't happen for bootstrap)
- **500 Internal Error:** Bootstrap step failure (includes step in error message)

---

## G) PERFORMANCE REVIEW

### N+1 Query Patterns Identified

#### 1. Organizations GET Endpoint (P2)
**File:** `src/api/v1/organizations.ts:40-72`
**Issue:** Fetches industry name and logo file separately
```typescript
// Query 1: Get organization
const organization = await service.getById(...);

// Query 2: Get industry name (if industry_id exists)
if (organization.industry_id) {
  const { data: industryData } = await supabase
    .from('industries')
    .select('name')
    .eq('id', organization.industry_id)
    .maybeSingle();
}

// Query 3: Get logo file (if logo_file_id exists)
if (organization.logo_file_id) {
  const { data: logoData } = await supabase
    .from('files')
    .select('bucket, path')
    .eq('id', organization.logo_file_id)
    .maybeSingle();
}
```

**Fix:** Use single query with joins:
```typescript
const { data } = await supabase
  .from('organizations')
  .select(`
    *,
    industries:industry_id (name),
    logo_file:logo_file_id (bucket, path)
  `)
  .eq('id', organizationId)
  .single();
```

#### 2. Template List with Preview URLs (FIXED ✅)
**File:** `src/domains/templates/service.ts:77`
**Status:** ✅ **FIXED** - Uses batch signed URL generation
- Checks cache first
- Batch generates signed URLs for cache misses
- Avoids N+1 by using `createSignedUrls()` batch API

#### 3. Dashboard Recent Imports (FIXED ✅)
**File:** `src/domains/dashboard/repository.ts:79`
**Status:** ✅ **FIXED** - Uses join to fetch file name
- Joins `files` table via `source_file_id`
- Single query with join

#### 4. Dashboard Recent Verifications (FIXED ✅)
**File:** `src/domains/dashboard/repository.ts:132`
**Status:** ✅ **FIXED** - Uses join to fetch certificate info
- Joins `certificates` table via `certificate_id`
- Single query with join

### Query Consolidation Opportunities

#### 1. Template Editor Data (GOOD ✅)
**File:** `src/domains/templates/repository.ts:405`
**Status:** ✅ **OPTIMIZED** - Uses 2 queries (template+version+files join, then fields)
- Query 1: Template + version + source_file + preview_file (single join)
- Query 2: Fields (single query for all fields)
- **No N+1:** Fields fetched in one query

#### 2. User Profile (GOOD ✅)
**File:** `src/domains/users/repository.ts:18`
**Status:** ✅ **OPTIMIZED** - Single query with joins
- Joins: profiles + organization_members + organizations + organization_roles
- Logo file fetched separately only if needed (optional, avoids N+1 for users without logos)

#### 3. Dashboard Stats (GOOD ✅)
**File:** `src/domains/dashboard/repository.ts:17`
**Status:** ✅ **OPTIMIZED** - Parallel queries
- 4 count queries run in parallel via `Promise.all()`
- No sequential dependencies

### Recommended Refactors

#### P1 - High Priority

1. **Fix Organizations GET N+1**
   - **File:** `src/api/v1/organizations.ts:40-72`
   - **Change:** Use joins in single query
   - **Impact:** Reduces 3 queries to 1 query

#### P2 - Medium Priority

2. **Consider Using Views for Complex Queries**
   - **Example:** Create view for organization with industry and logo
   - **Impact:** Simplifies code, may improve query planning

3. **Add Missing Indexes (if needed)**
   - Check `organizations.industry_id` (FK index)
   - Check `organizations.logo_file_id` (FK index)
   - Check `certificate_template_versions.template_id` (FK index)
   - **Note:** Only add if queries are slow (measure first)

#### P3 - Low Priority

4. **Cache Industry Names**
   - Industry names rarely change
   - Could cache in memory or Redis

5. **Batch Logo File Fetches**
   - If multiple organizations fetched, batch logo file queries

---

## H) FINAL FIX CHECKLIST

### P0 - Blockers (Crashes, Schema Mismatch)

1. **Remove or Fix Companies Domain**
   - **Files:** `src/api/v1/companies.ts`, `src/domains/companies/*`
   - **Issue:** Endpoints not registered, references `companies` table (may not exist)
   - **Fix:** Remove files OR register endpoints if `companies` table exists
   - **Priority:** P0

2. **Fix Billing Repository Table Names**
   - **File:** `src/domains/billing/repository.ts`
   - **Issue:** Uses `company_id` but schema may use `organization_id`
   - **Fix:** Verify schema, update all `company_id` references to `organization_id` if needed
   - **Priority:** P0

3. **Fix Import Repository Table Name**
   - **File:** `src/domains/imports/repository.ts`
   - **Issue:** References `import_jobs` but schema shows `file_import_jobs`
   - **Fix:** Replace all `import_jobs` with `file_import_jobs`
   - **Priority:** P0

### P1 - Correctness Issues

4. **Update Certificate Generation Bucket**
   - **File:** `src/domains/certificates/service.ts:122`
   - **Issue:** Uses legacy `minecertificate` bucket
   - **Fix:** Change to `authentix` bucket
   - **Priority:** P1

5. **Migrate Legacy Template Categories Endpoint**
   - **File:** `src/api/v1/templates.ts:370`, `src/domains/templates/repository.ts:182`
   - **Issue:** Uses old `certificate_categories` schema
   - **Fix:** Use catalog service or deprecate endpoint
   - **Priority:** P1

6. **Fix Import Job Table References**
   - **File:** `src/domains/imports/repository.ts` (multiple locations)
   - **Issue:** Some queries use `import_jobs`, some use `file_import_jobs`
   - **Fix:** Standardize to `file_import_jobs`
   - **Priority:** P1

### P2 - Performance Issues

7. **Fix Organizations GET N+1**
   - **File:** `src/api/v1/organizations.ts:40-72`
   - **Issue:** Fetches industry and logo separately
   - **Fix:** Use joins in single query
   - **Priority:** P2

8. **Add Indexes (if needed)**
   - **Tables:** `organizations.industry_id`, `organizations.logo_file_id`
   - **Issue:** May be missing FK indexes
   - **Fix:** Add indexes if queries are slow (measure first)
   - **Priority:** P2

### P3 - Cleanup

9. **Remove Legacy Template Create Method**
   - **File:** `src/domains/templates/repository.ts:87`
   - **Issue:** Legacy `create()` method uses old schema
   - **Fix:** Deprecate or remove (new schema uses `createWithNewSchema()`)
   - **Priority:** P3

10. **Standardize Storage Bucket Names**
    - **Files:** `src/domains/certificates/service.ts`, `src/domains/templates/service.ts:181`
    - **Issue:** Some use `minecertificate`, some use `authentix`
    - **Fix:** Standardize all to `authentix`
    - **Priority:** P3

11. **Remove Unused Companies Code**
    - **Files:** `src/api/v1/companies.ts`, `src/domains/companies/*`
    - **Issue:** Not registered, duplicate of organizations
    - **Fix:** Remove if not needed
    - **Priority:** P3

---

## SUMMARY

### API Surface
- **Total Endpoints:** 45+ (excluding unregistered companies endpoints)
- **Public Endpoints:** 2 (verification, webhooks)
- **Authenticated Endpoints:** 43+
- **Rate Limited:** 3 (login, signup, uploads)

### Database Tables Used
- **Core:** `profiles`, `organizations`, `organization_members`, `organization_roles`
- **Templates:** `certificate_templates`, `certificate_template_versions`, `certificate_template_fields`
- **Files:** `files`
- **Imports:** `file_import_jobs`, `import_data_rows`
- **Certificates:** `certificates`, `certificate_verification_events`
- **Billing:** `invoices`, `invoice_line_items`, `billing_profiles`
- **Audit:** `app_audit_logs`
- **Catalog:** `v_effective_categories`, `v_effective_subcategories`

### Storage Operations
- **Bucket:** `authentix` (primary), `minecertificate` (legacy, should migrate)
- **Paths:** Enforced by `files_path_chk` constraint
- **Signed URLs:** Cached, 1-hour expiry

### Critical Issues Found
1. **Companies domain not registered** (P0)
2. **Billing uses `company_id` instead of `organization_id`** (P0)
3. **Import repository uses wrong table name** (P0)
4. **Organizations GET has N+1 queries** (P2)
5. **Legacy bucket names in use** (P1)

### Performance Optimizations
- ✅ Dashboard caching (250ms → 2ms)
- ✅ JWT caching (97% latency reduction)
- ✅ Batch signed URL generation
- ✅ Parallel queries in dashboard stats
- ⚠️ Organizations GET needs join optimization

---

**End of Report**
