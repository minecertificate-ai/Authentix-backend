# Authentix Backend - System Design

**Product:** Authentix (formerly MineCertificate)  
**Architecture:** Modular Monolith  
**Target Scale:** 1M+ tenants, 10M certs/month  
**Deployment:** Vercel (Serverless Functions)

---

## 1. Architecture Overview

### 1.1 Modular Monolith Structure

The backend is organized as a **modular monolith** with clear domain boundaries:

```
authentix-backend/
├── src/
│   ├── domains/              # Domain modules (business logic)
│   │   ├── auth/
│   │   ├── certificates/
│   │   ├── templates/
│   │   ├── imports/
│   │   ├── billing/
│   │   ├── verification/
│   │   ├── audit/
│   │   └── webhooks/
│   ├── api/                   # API routes (Fastify)
│   │   └── v1/
│   │       ├── templates.ts
│   │       ├── certificates.ts
│   │       ├── imports.ts
│   │       ├── billing.ts
│   │       ├── verification.ts
│   │       └── webhooks/
│   │           └── razorpay.ts
│   ├── lib/                   # Shared utilities
│   │   ├── supabase/
│   │   ├── razorpay/
│   │   ├── auth/
│   │   ├── errors/
│   │   └── utils/
│   ├── jobs/                   # Async job handlers
│   │   ├── certificate-generation.ts
│   │   └── invoice-generation.ts
│   └── index.ts               # Fastify app entry
├── package.json
├── tsconfig.json
└── vercel.json
```

### 1.2 Domain Boundaries

Each domain module is self-contained:

- **auth**: JWT verification, company_id extraction, API key auth
- **certificates**: Certificate CRUD, generation, QR codes
- **templates**: Template management, upload, field definitions
- **imports**: Import job management, CSV/XLSX parsing
- **billing**: Invoice generation, Razorpay integration, usage aggregation
- **verification**: Public certificate verification (QR codes)
- **audit**: Audit log writing
- **webhooks**: External webhook handlers (Razorpay)

---

## 2. API Design

### 2.1 API Versioning

All APIs are versioned under `/api/v1`:

```
GET    /api/v1/templates
POST   /api/v1/templates
GET    /api/v1/templates/:id
PUT    /api/v1/templates/:id
DELETE /api/v1/templates/:id

POST   /api/v1/certificates/generate
GET    /api/v1/certificates
GET    /api/v1/certificates/:id

POST   /api/v1/import-jobs
GET    /api/v1/import-jobs
GET    /api/v1/import-jobs/:id

GET    /api/v1/billing/invoices
GET    /api/v1/billing/invoices/:id
GET    /api/v1/billing/overview

POST   /api/v1/verification/verify

POST   /api/v1/webhooks/razorpay
```

### 2.2 Request/Response Format

**Request Headers:**
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

**Response Format:**
```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-01-10T12:00:00Z"
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "TEMPLATE_NOT_FOUND",
    "message": "Template not found",
    "details": { ... }
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-01-10T12:00:00Z"
  }
}
```

### 2.3 Error Codes

Standard error codes:

- `UNAUTHORIZED` (401): Missing/invalid JWT
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid request data
- `CONFLICT` (409): Resource conflict (e.g., duplicate)
- `RATE_LIMITED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error
- `SERVICE_UNAVAILABLE` (503): External service down

Domain-specific codes:
- `TEMPLATE_NOT_FOUND`
- `CERTIFICATE_GENERATION_FAILED`
- `IMPORT_JOB_FAILED`
- `INVOICE_GENERATION_FAILED`
- `RAZORPAY_WEBHOOK_INVALID`

---

## 3. Authentication Strategy

### 3.1 JWT Verification (Supabase)

**Flow:**
1. Frontend sends Supabase JWT in `Authorization: Bearer <token>`
2. Backend verifies JWT using Supabase service role
3. Extract `user_id` from JWT
4. Query `users` table to get `company_id`
5. Attach `company_id` to request context
6. All DB queries automatically scoped to `company_id`

**Implementation:**
```typescript
// lib/auth/jwt-verifier.ts
export async function verifyJWT(token: string): Promise<AuthContext> {
  const supabase = createServiceRoleClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) throw new UnauthorizedError();
  
  const { data: userRecord } = await supabase
    .from('users')
    .select('id, company_id, role')
    .eq('id', user.id)
    .single();
  
  return {
    userId: user.id,
    companyId: userRecord.company_id,
    role: userRecord.role
  };
}
```

### 3.2 API Key Authentication (Optional)

For programmatic access:
```
X-Application-ID: <application_id>
X-API-Key: <api_key>
```

Backend verifies via `verify_api_key()` RPC function.

### 3.3 Tenant Isolation

**CRITICAL:** Backend **NEVER** accepts `company_id` from frontend.

- `company_id` is **always** derived from JWT
- All DB queries include `.eq('company_id', context.companyId)`
- RLS policies provide defense-in-depth

---

## 4. Async Job Boundaries

### 4.1 Certificate Generation

**Synchronous (small batches):**
- ≤ 50 certificates: Return 200 OK with ZIP download URL
- Processing time: < 30 seconds

**Asynchronous (large batches):**
- > 50 certificates: Return 202 Accepted with job ID
- Client polls `/api/v1/jobs/:jobId` for status
- Job status: `pending` → `processing` → `completed` / `failed`

**Job Response:**
```typescript
// POST /api/v1/certificates/generate
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "pending",
    "estimated_completion": "2026-01-10T12:05:00Z"
  }
}

// GET /api/v1/jobs/:jobId
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "completed",
    "result": {
      "download_url": "https://...",
      "total_certificates": 150
    }
  }
}
```

### 4.2 Invoice Generation

- Always asynchronous (monthly job)
- Triggered via `/api/v1/admin/generate-invoices` (admin only)
- Returns job ID immediately
- Status tracked in `invoices` table

---

## 5. Idempotency Rules

### 5.1 Certificate Generation

- **Idempotency Key:** `X-Idempotency-Key: <uuid>`
- If same key used within 24h, return cached result
- Store in `certificate_generation_jobs` table

### 5.2 Invoice Generation

- **Idempotency:** Check for existing invoice for `company_id + period`
- If exists, return existing invoice (no duplicate creation)

### 5.3 Webhook Processing

- **Idempotency:** `razorpay_event_id` is unique
- If event already stored, return 200 OK (idempotent)

---

## 6. Database Access Pattern

### 6.1 Supabase Client

**Service Role Client (Backend Only):**
```typescript
// lib/supabase/client.ts
export function createServiceRoleClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

**Usage:**
- All backend DB access uses service role
- Bypasses RLS (backend enforces tenant isolation in code)
- RLS still provides defense-in-depth

### 6.2 Query Pattern

```typescript
// Always include company_id filter
const { data, error } = await supabase
  .from('certificate_templates')
  .select('*')
  .eq('company_id', context.companyId)
  .eq('deleted_at', null);
```

---

## 7. File Storage

### 7.1 Supabase Storage

**Bucket:** `minecertificate` (public)

**Paths:**
- Templates: `templates/<application_id>/<template_id>.pdf`
- Logos: `company-logos/<application_id>/logo.png`
- Imports: `imports/<company_id>/<import_id>.csv`
- Certificates: `certificates/<company_id>/<cert_id>.pdf`

**Access:**
- Upload: Service role client
- Download: Signed URLs (expires in 1 hour)

---

## 8. External Integrations

### 8.1 Razorpay

**Client:**
```typescript
// lib/razorpay/client.ts
import Razorpay from 'razorpay';

export function getRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!
  });
}
```

**Webhook Verification:**
- HMAC SHA256 signature verification
- Environment-specific secrets (test vs prod)
- Idempotent event storage

### 8.2 PDF Generation

**Libraries:**
- `pdf-lib`: PDF manipulation
- `qrcode`: QR code generation
- `jszip`: ZIP file creation

---

## 9. Error Handling

### 9.1 Error Middleware

```typescript
// lib/errors/handler.ts
export async function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (error instanceof ValidationError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details
      }
    });
  }
  
  // ... other error types
  
  // Log internal errors
  console.error('Internal error:', error);
  
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
}
```

### 9.2 Logging

- Structured logging (JSON)
- Include: `request_id`, `company_id`, `user_id`, `timestamp`
- Log levels: `error`, `warn`, `info`, `debug`

---

## 10. Environment Configuration

### 10.1 Environment Variables

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET_TEST=
RAZORPAY_WEBHOOK_SECRET_PROD=

# App
NODE_ENV=production
APP_URL=https://api.authentix.io
FRONTEND_URL=https://app.authentix.io

# Vercel
VERCEL_ENV=production
```

### 10.2 Environment Detection

- `NODE_ENV=production` → Production
- `VERCEL_ENV=production` → Production
- Otherwise → Development/Staging

---

## 11. Deployment (Vercel)

### 11.1 Vercel Configuration

```json
// vercel.json
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
      "src": "/api/(.*)",
      "dest": "src/index.ts"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### 11.2 Serverless Functions

- Each API route is a serverless function
- Cold start: ~100-500ms
- Timeout: 60 seconds (Vercel Pro)
- Memory: 1024 MB

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Domain logic (pure functions)
- Error handling
- Validation

### 12.2 Integration Tests

- API endpoints (with test Supabase instance)
- Razorpay webhook simulation
- File upload/download

### 12.3 E2E Tests

- Full certificate generation flow
- Invoice generation flow
- Webhook processing

---

## 13. Security Considerations

### 13.1 Input Validation

- Validate all inputs (Zod schemas)
- Sanitize file uploads
- Rate limiting

### 13.2 Tenant Isolation

- **CRITICAL:** Never trust `company_id` from frontend
- Always derive from JWT
- Double-check in DB queries

### 13.3 Secrets Management

- Never log secrets
- Use Vercel environment variables
- Rotate keys regularly

---

## 14. Performance Targets

- **API Response Time:** < 200ms (p95)
- **Certificate Generation:** < 30s (50 certs)
- **Webhook Processing:** < 5s
- **Concurrent Requests:** 1000+ (Vercel auto-scales)

---

## 15. Monitoring & Observability

### 15.1 Metrics

- Request rate (per endpoint)
- Error rate (per error code)
- Latency (p50, p95, p99)
- Certificate generation time
- Webhook processing time

### 15.2 Alerts

- Error rate > 5%
- Latency p95 > 1s
- Webhook processing failures
- Razorpay API failures

---

## 16. Migration Strategy

### 16.1 Phase 1: Backend Setup
- Bootstrap backend project
- Set up infrastructure
- Deploy to Vercel

### 16.2 Phase 2: API Implementation
- Implement APIs domain by domain
- Test with Postman/curl
- Verify Supabase + Razorpay connectivity

### 16.3 Phase 3: Frontend Migration
- Migrate frontend feature by feature
- Keep old code until verified
- Gradual rollout

### 16.4 Phase 4: Cleanup
- Remove old API routes from frontend
- Remove direct Supabase DB access
- Update documentation

---

## 17. Next Steps

1. ✅ **STEP 1:** Backend System Design (this document)
2. ⏳ **STEP 2:** Backend Project Bootstrap
3. ⏳ **STEP 3:** Implement Backend APIs
4. ⏳ **STEP 4:** Deploy Backend to Vercel
5. ⏳ **STEP 5:** Refactor Frontend to Use Backend APIs
6. ⏳ **STEP 6:** Rename Product to Authentix
7. ⏳ **STEP 7:** Commit Strategy

---

**Last Updated:** 2026-01-10  
**Version:** 1.0.0  
**Node.js:** 24.x (Krypton LTS)  
**Fastify:** 5.0.0
