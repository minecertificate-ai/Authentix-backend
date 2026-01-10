# Backend Architecture & Documentation

## Overview

The Authentix backend is a Node.js + TypeScript REST API built with Fastify. It follows a modular monolith architecture with domain-driven design principles. All business logic, database operations, and external service integrations are centralized in the backend.

## Tech Stack

### Core Framework
- **Node.js**: >=20.0.0
- **TypeScript**: 5.7.2
- **Fastify**: 5.6.2 (Web framework)
- **ES Modules**: Native ES module support

### Database & Storage
- **Supabase**: PostgreSQL database, Auth, Storage, Realtime
  - `@supabase/supabase-js`: 2.90.1
  - Service role client for backend operations
  - Anon client for authentication operations

### Authentication & Security
- **JWT**: Supabase JWT tokens
- **API Keys**: Custom API key authentication for programmatic access
- **CORS**: `@fastify/cors`: 11.2.0

### External Services
- **Razorpay**: 2.9.6 (Payment processing)
- **PDF Generation**: `pdf-lib`: 1.17.1
- **QR Code**: `qrcode`: 1.5.4
- **File Processing**: 
  - `xlsx`: 0.18.5 (Excel parsing)
  - `jszip`: 3.10.1 (ZIP creation)

### Validation & Utilities
- **Zod**: 3.24.1 (Schema validation)
- **date-fns**: 4.1.0 (Date manipulation)
- **dotenv**: 16.4.7 (Environment variables)

### Development Tools
- **tsx**: 4.19.2 (TypeScript execution)
- **pino-pretty**: 13.0.0 (Logging)
- **ESLint**: 9.17.0 (Linting)

## Project Structure

```
Authentix-backend/
├── src/
│   ├── index.ts                 # Application entry point
│   ├── api/                     # API route handlers
│   │   └── v1/                  # API version 1
│   │       ├── index.ts         # Route registration
│   │       ├── auth.ts          # Authentication routes
│   │       ├── templates.ts     # Template routes
│   │       ├── certificates.ts  # Certificate routes
│   │       ├── imports.ts       # Import routes
│   │       ├── billing.ts       # Billing routes
│   │       ├── verification.ts   # Verification routes
│   │       ├── webhooks.ts       # Webhook routes
│   │       ├── dashboard.ts     # Dashboard routes
│   │       ├── companies.ts     # Company routes
│   │       └── users.ts         # User routes
│   ├── domains/                 # Business domain logic
│   │   ├── auth/               # Authentication domain
│   │   │   ├── service.ts      # Auth business logic
│   │   │   └── types.ts        # Auth types & schemas
│   │   ├── templates/          # Template domain
│   │   │   ├── repository.ts   # Data access
│   │   │   ├── service.ts      # Business logic
│   │   │   └── types.ts        # Types & schemas
│   │   ├── certificates/        # Certificate domain
│   │   │   ├── service.ts      # Certificate logic
│   │   │   ├── pdf-generator.ts # PDF generation
│   │   │   └── types.ts        # Types
│   │   ├── imports/            # Import domain
│   │   │   ├── repository.ts   # Data access
│   │   │   ├── service.ts      # Business logic
│   │   │   └── types.ts        # Types
│   │   ├── billing/            # Billing domain
│   │   │   ├── repository.ts   # Data access
│   │   │   ├── service.ts      # Business logic
│   │   │   └── types.ts        # Types
│   │   ├── verification/       # Verification domain
│   │   │   ├── service.ts      # Verification logic
│   │   │   └── types.ts        # Types
│   │   ├── webhooks/           # Webhook domain
│   │   │   ├── razorpay-handler.ts # Razorpay webhooks
│   │   │   └── types.ts        # Types
│   │   ├── dashboard/         # Dashboard domain
│   │   │   ├── repository.ts   # Data access
│   │   │   ├── service.ts      # Business logic
│   │   │   └── types.ts        # Types
│   │   ├── companies/         # Company domain
│   │   │   ├── repository.ts   # Data access
│   │   │   ├── service.ts      # Business logic
│   │   │   └── types.ts        # Types
│   │   └── users/             # User domain
│   │       ├── repository.ts   # Data access
│   │       ├── service.ts      # Business logic
│   │       └── types.ts        # Types
│   └── lib/                    # Shared libraries
│       ├── auth/              # Authentication utilities
│       │   ├── jwt-verifier.ts # JWT verification
│       │   └── middleware.ts   # Auth middleware
│       ├── errors/            # Error handling
│       │   └── handler.ts     # Error classes & handler
│       ├── middleware/        # Request middleware
│       │   └── context.ts     # Context middleware
│       ├── razorpay/         # Razorpay integration
│       │   └── client.ts     # Razorpay client
│       ├── supabase/         # Supabase utilities
│       │   └── client.ts     # Supabase clients
│       ├── types/            # Shared types
│       │   └── common.ts     # Common types
│       └── utils/            # Utilities
│           ├── ids.ts        # ID generation
│           ├── response.ts   # Response helpers
│           └── validation.ts # Validation helpers
├── architecture-design/       # Documentation
├── vercel.json                # Vercel configuration
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

## Architecture Patterns

### Domain-Driven Design (DDD)

Each domain is self-contained with:
- **Types** (`types.ts`): Zod schemas and TypeScript interfaces
- **Repository** (`repository.ts`): Data access layer (Supabase queries)
- **Service** (`service.ts`): Business logic layer
- **API** (`api/v1/{domain}.ts`): HTTP route handlers

### Repository Pattern

Repositories abstract database operations:
- Encapsulate Supabase queries
- Map database rows to domain entities
- Handle data transformations
- Provide type-safe data access

### Service Layer

Services contain business logic:
- Validate business rules
- Orchestrate repository calls
- Handle external service integrations
- Transform data for API responses

### API Layer

API routes handle HTTP concerns:
- Request/response parsing
- Route registration
- Middleware application
- Error handling
- Response formatting

## Code Flow

### Request Flow

1. **HTTP Request** → Fastify receives request
2. **CORS Middleware** → Validates origin
3. **Auth Middleware** → Verifies JWT token (if required)
4. **Context Middleware** → Attaches user/company context
5. **Route Handler** → Parses request, calls service
6. **Service Layer** → Executes business logic
7. **Repository Layer** → Queries database
8. **Response** → Formatted JSON response

### Authentication Flow

1. **Login/Signup** → `AuthService` uses Supabase anon client
2. **Token Generation** → Supabase returns JWT tokens
3. **Token Storage** → Frontend stores in localStorage
4. **API Requests** → Bearer token in `Authorization` header
5. **JWT Verification** → `JWTVerifier` validates token
6. **Context Extraction** → User ID, company ID, role extracted
7. **Request Processing** → Context attached to request

### File Upload Flow

1. **Multipart Request** → Fastify multipart plugin parses
2. **File Buffer** → File read into memory
3. **Storage Upload** → Supabase Storage API
4. **Public URL** → Signed URL generated
5. **Database Record** → Template/certificate record created
6. **Response** → Entity with storage path and URL

## API Endpoints

### Authentication (`/api/v1/auth`)

**POST `/auth/login`**
- **Purpose**: User login
- **Auth**: None (public)
- **Request**: `{ email: string, password: string }`
- **Response**: `{ user: User, session: Session }`
- **Service**: `AuthService.login()`
- **Database**: `users` table (via Supabase Auth)

**POST `/auth/signup`**
- **Purpose**: User registration
- **Auth**: None (public)
- **Request**: `{ email: string, password: string, full_name: string, company_name: string }`
- **Response**: `{ user: User, session: Session }`
- **Service**: `AuthService.signup()`
- **Database**: `users` table (via Supabase Auth)
- **Validation**: Email domain validation (rejects personal emails)

**POST `/auth/logout`**
- **Purpose**: User logout
- **Auth**: Required (Bearer token)
- **Request**: None
- **Response**: `{ message: string }`
- **Service**: `AuthService.logout()`
- **Note**: Supabase doesn't support server-side token invalidation

**GET `/auth/session`**
- **Purpose**: Verify session and get user info
- **Auth**: Required (Bearer token)
- **Request**: None
- **Response**: `{ user: User | null, valid: boolean }`
- **Service**: `AuthService.verifySession()`
- **Database**: `users` table

### Templates (`/api/v1/templates`)

**GET `/templates`**
- **Purpose**: List templates for company
- **Auth**: Required
- **Query Params**: `page`, `limit`, `status`, `sort_by`, `sort_order`
- **Response**: Paginated template list
- **Service**: `TemplateService.list()`
- **Repository**: `TemplateRepository.findAll()`
- **Database**: `certificate_templates` table

**GET `/templates/:id`**
- **Purpose**: Get template by ID
- **Auth**: Required
- **Response**: Template entity
- **Service**: `TemplateService.getById()`
- **Repository**: `TemplateRepository.findById()`
- **Database**: `certificate_templates` table

**POST `/templates`**
- **Purpose**: Create new template
- **Auth**: Required
- **Request**: Multipart form with file and metadata
- **Response**: Created template
- **Service**: `TemplateService.create()`
- **Repository**: `TemplateRepository.create()`
- **Storage**: Supabase Storage (`minecertificate` bucket, `templates/{companyId}/` path)
- **Database**: `certificate_templates` table

**PUT `/templates/:id`**
- **Purpose**: Update template
- **Auth**: Required
- **Request**: `{ name?, description?, status?, fields?, width?, height? }`
- **Response**: Updated template
- **Service**: `TemplateService.update()`
- **Repository**: `TemplateRepository.update()`
- **Database**: `certificate_templates` table

**DELETE `/templates/:id`**
- **Purpose**: Delete template (soft delete)
- **Auth**: Required
- **Response**: `{ id: string, deleted: boolean }`
- **Service**: `TemplateService.delete()`
- **Repository**: `TemplateRepository.delete()`
- **Database**: `certificate_templates` table (sets `deleted_at`)

**GET `/templates/:id/preview`**
- **Purpose**: Get signed preview URL
- **Auth**: Required
- **Response**: `{ preview_url: string }`
- **Service**: `TemplateService.getPreviewUrl()`
- **Storage**: Supabase Storage signed URL (1-hour expiry)

**GET `/templates/categories`**
- **Purpose**: Get certificate categories for company
- **Auth**: Required
- **Response**: `{ categories: string[], categoryMap: Record<string, string[]>, industry: string | null }`
- **Service**: `TemplateService.getCategories()`
- **Repository**: `TemplateRepository.getCategories()`, `TemplateRepository.getCompanyIndustry()`
- **Database**: `certificate_categories`, `companies` tables

### Certificates (`/api/v1/certificates`)

**POST `/certificates/generate`**
- **Purpose**: Generate certificates (async job)
- **Auth**: Required
- **Request**: `{ template_id, data[], field_mappings[], options? }`
- **Response**: `{ job_id: string, status: string }` (202 Accepted)
- **Service**: `CertificateService.generate()`
- **Process**:
  1. Validates template and data
  2. Creates generation job
  3. Processes asynchronously
  4. Generates PDFs with pdf-lib
  5. Adds QR codes if requested
  6. Uploads to Supabase Storage
  7. Creates certificate records
- **Database**: `certificates` table
- **Storage**: Supabase Storage (`certificates/{companyId}/` path)

**GET `/certificates`**
- **Purpose**: List certificates
- **Auth**: Required
- **Query Params**: `page`, `limit`, `sort_by`, `sort_order`
- **Response**: Paginated certificate list
- **Service**: `CertificateService.list()`
- **Repository**: `CertificateRepository.findAll()`
- **Database**: `certificates` table

### Imports (`/api/v1/import-jobs`)

**GET `/import-jobs`**
- **Purpose**: List import jobs
- **Auth**: Required
- **Query Params**: `page`, `limit`, `status`, `sort_by`, `sort_order`
- **Response**: Paginated import job list
- **Service**: `ImportService.list()`
- **Repository**: `ImportRepository.findAll()`
- **Database**: `import_jobs` table

**GET `/import-jobs/:id`**
- **Purpose**: Get import job details
- **Auth**: Required
- **Response**: Import job entity
- **Service**: `ImportService.getById()`
- **Repository**: `ImportRepository.findById()`
- **Database**: `import_jobs` table

**POST `/import-jobs`**
- **Purpose**: Create import job (parse file)
- **Auth**: Required
- **Request**: Multipart form with file and metadata
- **Response**: Created import job
- **Service**: `ImportService.create()`
- **Process**:
  1. Uploads file to Supabase Storage
  2. Parses CSV/XLSX with xlsx library
  3. Validates data structure
  4. Stores data rows in `import_data_rows` table
  5. Creates import job record
  6. Processes asynchronously
- **Database**: `import_jobs`, `import_data_rows` tables
- **Storage**: Supabase Storage (`imports/{companyId}/` path)

**GET `/import-jobs/:id/data`**
- **Purpose**: Get import data rows (paginated)
- **Auth**: Required
- **Query Params**: `page`, `limit`
- **Response**: Paginated data rows
- **Service**: `ImportService.getData()`
- **Repository**: `ImportRepository.getDataRows()`
- **Database**: `import_data_rows` table

**GET `/import-jobs/:id/download`**
- **Purpose**: Get download URL for import file
- **Auth**: Required
- **Response**: `{ download_url: string }`
- **Service**: `ImportService.getDownloadUrl()`
- **Storage**: Supabase Storage signed URL

### Billing (`/api/v1/billing`)

**GET `/billing/overview`**
- **Purpose**: Get billing overview
- **Auth**: Required
- **Response**: `{ current_period, recent_invoices, total_outstanding, billing_profile, current_usage }`
- **Service**: `BillingService.getBillingOverview()`
- **Repository**: `BillingRepository.getBillingProfile()`, `BillingRepository.getUnbilledCertificateCount()`
- **Database**: `billing_profiles`, `invoices`, `certificates` tables

**GET `/billing/invoices`**
- **Purpose**: List invoices
- **Auth**: Required
- **Query Params**: `page`, `limit`, `status`, `sort_by`, `sort_order`
- **Response**: Paginated invoice list
- **Service**: `BillingService.listInvoices()`
- **Repository**: `BillingRepository.findAll()`
- **Database**: `invoices` table

**GET `/billing/invoices/:id`**
- **Purpose**: Get invoice details
- **Auth**: Required
- **Response**: Invoice with line items
- **Service**: `BillingService.getById()`
- **Repository**: `BillingRepository.findById()`, `BillingRepository.getLineItems()`
- **Database**: `invoices`, `invoice_line_items` tables

### Verification (`/api/v1/verification`)

**GET `/verification/:token`**
- **Purpose**: Verify certificate (public endpoint)
- **Auth**: None (public)
- **Response**: `{ valid: boolean, certificate: Certificate | null, message: string }`
- **Service**: `VerificationService.verify()`
- **Repository**: Certificate lookup by verification token
- **Database**: `certificates`, `verification_logs` tables
- **Process**:
  1. Decodes verification token
  2. Looks up certificate
  3. Checks if revoked
  4. Creates verification log
  5. Returns certificate details

### Webhooks (`/api/v1/webhooks`)

**POST `/webhooks/razorpay`**
- **Purpose**: Razorpay webhook handler
- **Auth**: None (signature verification)
- **Request**: Raw JSON body with Razorpay signature
- **Response**: `{ received: boolean, stored: boolean, processed: boolean }`
- **Service**: `processRazorpayWebhook()`
- **Process**:
  1. Verifies webhook signature (HMAC SHA256)
  2. Stores event in `razorpay_events` table (idempotent)
  3. Processes billing-critical events
  4. Updates invoice status
  5. Links payments to invoices
- **Database**: `razorpay_events`, `invoices` tables

### Dashboard (`/api/v1/dashboard`)

**GET `/dashboard/stats`**
- **Purpose**: Get dashboard statistics
- **Auth**: Required
- **Response**: `{ stats: Stats, recentImports: Import[], recentVerifications: Verification[] }`
- **Service**: `DashboardService.getStats()`
- **Repository**: `DashboardRepository.getStats()`
- **Database**: `certificates`, `import_jobs`, `verification_logs` tables

### Companies (`/api/v1/companies`)

**GET `/companies/me`**
- **Purpose**: Get company profile
- **Auth**: Required
- **Response**: Company entity
- **Service**: `CompanyService.getById()`
- **Repository**: `CompanyRepository.findById()`
- **Database**: `companies` table

**PUT `/companies/me`**
- **Purpose**: Update company profile
- **Auth**: Required
- **Request**: `{ name?, email?, phone?, website?, industry?, address?, ... }` (multipart if logo)
- **Response**: Updated company
- **Service**: `CompanyService.update()`
- **Repository**: `CompanyRepository.update()`
- **Storage**: Supabase Storage for logo (`logos/{companyId}/` path)
- **Database**: `companies` table

**GET `/companies/me/api-settings`**
- **Purpose**: Get API settings
- **Auth**: Required
- **Response**: `{ application_id, api_enabled, api_key_exists, ... }`
- **Service**: `CompanyService.getAPISettings()`
- **Repository**: `CompanyRepository.getAPISettings()`
- **Database**: `companies` table

**PUT `/companies/me/api-settings`**
- **Purpose**: Update API enabled status
- **Auth**: Required
- **Request**: `{ api_enabled: boolean }`
- **Response**: Updated settings
- **Service**: `CompanyService.updateAPIEnabled()`
- **Repository**: `CompanyRepository.updateAPIEnabled()`
- **Database**: `companies` table

**POST `/companies/me/bootstrap-identity`**
- **Purpose**: Generate application_id and API key
- **Auth**: Required
- **Response**: `{ application_id: string, api_key: string }`
- **Service**: `CompanyService.bootstrapIdentity()`
- **Process**:
  1. Generates application_id (format: `app_{env}_{random}`)
  2. Generates API key (format: `ak_{env}_{random}`)
  3. Hashes API key (bcrypt)
  4. Stores in database
- **Database**: `companies` table
- **Utils**: `generateApplicationId()`, `generateAPIKey()`, `hashAPIKey()`

**POST `/companies/me/rotate-api-key`**
- **Purpose**: Rotate API key (keep application_id)
- **Auth**: Required
- **Response**: `{ application_id: string, api_key: string }`
- **Service**: `CompanyService.rotateAPIKey()`
- **Process**: Similar to bootstrap, but keeps existing application_id
- **Database**: `companies` table

### Users (`/api/v1/users`)

**GET `/users/me`**
- **Purpose**: Get user profile
- **Auth**: Required
- **Response**: `{ id, email, full_name, company_id, company: { name, logo } }`
- **Service**: `UserService.getProfile()`
- **Repository**: `UserRepository.findById()`
- **Database**: `users`, `companies` tables

## Domain Details

### Auth Domain

**Service**: `AuthService`
- `login(dto)`: Authenticate user with Supabase Auth
- `signup(dto)`: Register new user (validates email domain)
- `verifySession(token)`: Verify JWT and get user info
- `logout(token)`: Logout (acknowledges Supabase limitation)

**Types**: `LoginDTO`, `SignupDTO`, `AuthResponse`, `SessionResponse`

**Database**: Uses Supabase Auth (anon client) + `users` table (service client)

### Templates Domain

**Service**: `TemplateService`
- `getById(id, companyId)`: Get template
- `list(companyId, options)`: List templates (paginated)
- `create(companyId, userId, dto, file)`: Create template
  - Uploads file to Supabase Storage
  - Generates public URL
  - Creates database record
- `update(id, companyId, dto)`: Update template
- `delete(id, companyId)`: Soft delete template
- `getPreviewUrl(id, companyId)`: Get signed storage URL
- `getCategories(companyId)`: Get categories by industry

**Repository**: `TemplateRepository`
- `findById(id, companyId)`: Query `certificate_templates`
- `findAll(companyId, options)`: Query with pagination, filtering, sorting
- `create(...)`: Insert template record
- `update(id, companyId, dto)`: Update template
- `delete(id, companyId)`: Soft delete (set `deleted_at`)
- `getCategories(companyId, industry)`: Query `certificate_categories`
- `getCompanyIndustry(companyId)`: Query `companies.industry`

**Types**: `TemplateEntity`, `CreateTemplateDTO`, `UpdateTemplateDTO`, `TemplateStatus`, `TemplateFileType`

**Database**: `certificate_templates`, `certificate_categories`, `companies` tables

**Storage**: Supabase Storage bucket `minecertificate`, path `templates/{companyId}/{filename}`

### Certificates Domain

**Service**: `CertificateService`
- `generate(params)`: Generate certificates (async)
  - Validates template and data
  - Creates generation job
  - Processes batch (pdf-lib)
  - Adds QR codes (qrcode library)
  - Uploads PDFs to storage
  - Creates certificate records
- `list(companyId, options)`: List certificates

**PDF Generator**: `PDFGenerator`
- `generateCertificate(template, data, fields, mappings, options)`: Generate single PDF
- `addQRCode(pdfDoc, page, token)`: Add QR code to PDF

**Types**: `GenerateCertificateDTO`, `CertificateEntity`

**Database**: `certificates` table

**Storage**: Supabase Storage bucket `minecertificate`, path `certificates/{companyId}/{certificateId}.pdf`

### Imports Domain

**Service**: `ImportService`
- `create(companyId, userId, dto, file)`: Create import job
  - Uploads file to storage
  - Parses CSV/XLSX (xlsx library)
  - Validates data
  - Stores rows in `import_data_rows`
  - Creates import job record
- `getById(id, companyId)`: Get import job
- `list(companyId, options)`: List imports
- `getData(id, companyId, options)`: Get data rows (paginated)
- `getDownloadUrl(id, companyId)`: Get signed download URL

**Repository**: `ImportRepository`
- `findById(id, companyId)`: Query `import_jobs`
- `findAll(companyId, options)`: Query with pagination
- `create(...)`: Insert import job
- `updateStatus(id, status)`: Update job status
- `getDataRows(jobId, options)`: Query `import_data_rows` (paginated)

**Types**: `ImportJobEntity`, `CreateImportDTO`, `ImportStatus`

**Database**: `import_jobs`, `import_data_rows` tables

**Storage**: Supabase Storage bucket `minecertificate`, path `imports/{companyId}/{filename}`

### Billing Domain

**Service**: `BillingService`
- `getBillingOverview(companyId)`: Get billing summary
  - Current period usage
  - Recent invoices
  - Total outstanding
  - Billing profile
- `listInvoices(companyId, options)`: List invoices
- `getById(id, companyId)`: Get invoice with line items

**Repository**: `BillingRepository`
- `getBillingProfile(companyId)`: Query `billing_profiles`
- `getUnbilledCertificateCount(companyId, period)`: Count unbilled certificates
- `findAll(companyId, options)`: Query `invoices`
- `findById(id, companyId)`: Query invoice
- `getLineItems(invoiceId)`: Query `invoice_line_items`

**Types**: `InvoiceEntity`, `BillingProfile`, `BillingOverview`

**Database**: `billing_profiles`, `invoices`, `invoice_line_items`, `certificates` tables

**External**: Razorpay API for invoice creation and payment links

### Verification Domain

**Service**: `VerificationService`
- `verify(token)`: Verify certificate
  - Decodes verification token
  - Looks up certificate
  - Checks revocation status
  - Creates verification log
  - Returns certificate details

**Types**: `VerificationResult`, `VerificationToken`

**Database**: `certificates`, `verification_logs` tables

### Webhooks Domain

**Handler**: `processRazorpayWebhook()`
- Verifies webhook signature (HMAC SHA256)
- Stores event in `razorpay_events` (idempotent)
- Processes billing-critical events:
  - `invoice.paid`: Mark invoice as paid
  - `invoice.cancelled`: Cancel invoice
  - `invoice.partially_paid`: Mark as partially paid
  - `payment.captured`: Link payment to invoice
  - `payment.failed`: Log failure
- Updates invoice status in database

**Types**: `RazorpayWebhookPayload`, `RazorpayEvent`

**Database**: `razorpay_events`, `invoices` tables

**External**: Razorpay webhook secret for signature verification

### Dashboard Domain

**Service**: `DashboardService`
- `getStats(companyId)`: Get dashboard statistics
  - Total certificates
  - Pending import jobs
  - Verifications today
  - Revoked certificates
  - Recent imports
  - Recent verifications

**Repository**: `DashboardRepository`
- `getTotalCertificates(companyId)`: Count certificates
- `getPendingJobs(companyId)`: Count pending imports
- `getVerificationsToday(companyId)`: Count today's verifications
- `getRevokedCertificates(companyId)`: Count revoked
- `getRecentImports(companyId, limit)`: Get recent imports
- `getRecentVerifications(companyId, limit)`: Get recent verifications

**Types**: `DashboardStats`

**Database**: `certificates`, `import_jobs`, `verification_logs` tables

### Companies Domain

**Service**: `CompanyService`
- `getById(id)`: Get company
- `update(id, dto, logoFile?)`: Update company
  - Uploads logo to storage if provided
  - Updates company record
- `getAPISettings(id)`: Get API settings
- `updateAPIEnabled(id, enabled)`: Toggle API
- `bootstrapIdentity(companyId)`: Generate API credentials
- `rotateAPIKey(companyId)`: Rotate API key

**Repository**: `CompanyRepository`
- `findById(id)`: Query `companies`
- `update(id, dto)`: Update company
- `getAPISettings(id)`: Get API-related fields
- `updateAPIEnabled(id, enabled)`: Update API enabled flag

**Types**: `CompanyEntity`, `UpdateCompanyDTO`, `CompanyAPISettings`

**Database**: `companies` table

**Storage**: Supabase Storage for logos (`logos/{companyId}/` path)

**Utils**: `generateApplicationId()`, `generateAPIKey()`, `hashAPIKey()`, `verifyAPIKey()`

### Users Domain

**Service**: `UserService`
- `getProfile(userId)`: Get user with company info

**Repository**: `UserRepository`
- `findById(id)`: Query `users` with company join

**Types**: `UserProfile`

**Database**: `users`, `companies` tables

## Middleware

### Auth Middleware (`lib/auth/middleware.ts`)

**Purpose**: Verify JWT token and attach auth context

**Process**:
1. Extracts Bearer token from `Authorization` header
2. Verifies JWT with `JWTVerifier`
3. Extracts user ID, company ID, role
4. Attaches to `request.auth`

**Applied To**: All protected routes (except auth routes)

### Context Middleware (`lib/middleware/context.ts`)

**Purpose**: Attach request context to request

**Process**:
1. Reads `request.auth` (must be set by auth middleware)
2. Creates `RequestContext` object
3. Attaches to `request.context`

**Applied To**: All protected routes

### JWT Verifier (`lib/auth/jwt-verifier.ts`)

**Purpose**: Verify Supabase JWT tokens

**Process**:
1. Decodes JWT token
2. Verifies signature with Supabase JWT secret
3. Validates expiration
4. Extracts user metadata (user_id, company_id, role)
5. Returns auth context

**Database**: Queries `users` table to get company_id if not in token

## Error Handling

### Error Classes (`lib/errors/handler.ts`)

- `NotFoundError`: Resource not found (404)
- `ValidationError`: Validation failure (400)
- `UnauthorizedError`: Authentication failure (401)
- `ForbiddenError`: Authorization failure (403)

### Error Handler (`lib/errors/handler.ts`)

Global error handler:
- Catches all errors
- Maps to appropriate HTTP status
- Returns standardized error response:
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "Error message",
      "details": {}
    },
    "meta": {
      "request_id": "uuid",
      "timestamp": "ISO string"
    }
  }
  ```

## Utilities

### ID Generation (`lib/utils/ids.ts`)

- `generateApplicationId()`: `app_{env}_{random}`
- `generateAPIKey()`: `ak_{env}_{random}`
- `hashAPIKey(key)`: Bcrypt hash
- `verifyAPIKey(key, hash)`: Verify hash
- `validateApplicationId(id)`: Validate format
- `validateAPIKey(key)`: Validate format

### Response Helpers (`lib/utils/response.ts`)

- `sendSuccess(reply, data, statusCode?)`: Success response
- `sendError(reply, code, message, statusCode, details?)`: Error response
- `sendPaginated(reply, data)`: Paginated response

### Validation Helpers (`lib/utils/validation.ts`)

- `parsePagination(query)`: Parse pagination params
- Zod schema validation

## Environment Variables

**Required**:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (database operations)
- `SUPABASE_ANON_KEY`: Anonymous key (auth operations)

**Optional**:
- `FRONTEND_URL`: Frontend URL for CORS (default: `http://localhost:3000`)
- `LOG_LEVEL`: Logging level (default: `info`)
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (Vercel sets automatically)

**Razorpay** (for billing):
- `RAZORPAY_KEY_ID_TEST`: Test key ID
- `RAZORPAY_KEY_SECRET_TEST`: Test key secret
- `RAZORPAY_KEY_ID_PROD`: Production key ID
- `RAZORPAY_KEY_SECRET_PROD`: Production key secret
- `RAZORPAY_WEBHOOK_SECRET_TEST`: Test webhook secret
- `RAZORPAY_WEBHOOK_SECRET_PROD`: Production webhook secret

## Deployment

### Vercel Configuration (`vercel.json`)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.ts"
    }
  ]
}
```

### Build Process

1. TypeScript compilation: `tsc`
2. Output: `dist/index.js`
3. Entry point: `src/index.ts`
4. Runtime: Node.js serverless function

### Serverless Function

- Fastify app wrapped in Vercel handler
- Request/response conversion
- Cold start optimization
- Environment variable injection

## Code Quality

### TypeScript

- Strict mode enabled
- ES modules (`"type": "module"`)
- Path aliases (if configured)
- Type-safe Fastify requests/responses

### Linting

- ESLint 9.17.0
- TypeScript ESLint plugin
- Custom rules for code quality

### Testing

- Unit tests (if implemented)
- Integration tests (if implemented)
- API endpoint tests (if implemented)

## Security

### Authentication

- JWT token verification
- Supabase JWT validation
- Token expiration checking
- Role-based access control (if implemented)

### API Keys

- Bcrypt hashing
- Key rotation support
- Environment-based keys
- Application ID validation

### CORS

- Origin whitelist
- Credentials support
- Dynamic origin validation

### Data Isolation

- Tenant isolation (company_id filtering)
- Soft deletes (deleted_at)
- Row-level security (if enabled in Supabase)

## Performance

### Database

- Indexed queries
- Pagination for large datasets
- Efficient joins
- Connection pooling (Supabase handles)

### Storage

- Signed URLs (time-limited)
- Public URLs for templates
- Efficient file uploads
- Batch operations

### Caching

- No caching layer (stateless)
- Consider Redis for future optimization

## Monitoring & Logging

### Logging

- Pino logger (Fastify default)
- Structured JSON logs
- Request ID tracking
- Error logging with stack traces

### Metrics

- Request duration
- Error rates
- Database query performance (if monitored)

## Future Enhancements

- Rate limiting
- Request caching
- Background job queue
- WebSocket support (if needed)
- GraphQL API (if needed)
- API versioning strategy
- OpenAPI/Swagger documentation
