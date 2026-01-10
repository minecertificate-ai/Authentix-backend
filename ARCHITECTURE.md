# Authentix Backend Architecture

## Overview

This document describes the architecture and design patterns used in the Authentix backend API.

## Architecture Pattern

**Modular Monolith** - A single deployable application organized into clear domain boundaries.

## Folder Structure

```
src/
├── domains/              # Domain modules (business logic)
│   ├── templates/        # Certificate template domain
│   │   ├── types.ts      # Domain types & DTOs
│   │   ├── repository.ts # Data access layer
│   │   └── service.ts    # Business logic layer
│   ├── certificates/     # Certificate generation domain
│   │   ├── types.ts
│   │   ├── repository.ts
│   │   ├── service.ts
│   │   └── pdf-generator.ts # PDF generation logic
│   ├── imports/          # Import jobs domain
│   ├── billing/          # Billing & invoices domain
│   ├── verification/     # Certificate verification domain
│   └── webhooks/         # Webhook handlers domain
│
├── api/                   # API routes (HTTP layer)
│   └── v1/
│       ├── templates.ts   # Template endpoints
│       ├── certificates.ts
│       └── index.ts       # Route registration
│
├── lib/                   # Shared utilities
│   ├── auth/             # Authentication
│   ├── errors/           # Error handling
│   ├── middleware/       # Request middleware
│   ├── supabase/         # Supabase client
│   ├── razorpay/         # Razorpay client
│   ├── types/            # Shared types
│   └── utils/            # Utility functions
│
└── index.ts              # Application entry point
```

## Design Patterns

### 1. Domain-Driven Design (DDD)

Each domain is self-contained with:
- **Types**: Domain models, DTOs, and validation schemas (Zod)
- **Repository**: Data access abstraction
- **Service**: Business logic layer

### 2. Repository Pattern

Repositories abstract data access:
- Encapsulate Supabase queries
- Map database rows to domain entities
- Handle tenant isolation (company_id filtering)

### 3. Service Layer Pattern

Services contain business logic:
- Coordinate between repositories
- Validate business rules
- Handle file operations (Supabase Storage)
- Generate PDFs, ZIPs, etc.

### 4. Dependency Injection

Services receive repositories via constructor:
```typescript
const repository = new TemplateRepository(supabase);
const service = new TemplateService(repository);
```

### 5. Request/Response DTOs

All API inputs/outputs use Zod schemas:
- Type-safe validation
- Automatic error messages
- Runtime type checking

## Layer Responsibilities

### API Layer (`api/v1/`)
- HTTP request/response handling
- Route registration
- Authentication middleware
- Error handling & response formatting
- Request validation (Zod)

### Service Layer (`domains/*/service.ts`)
- Business logic
- File operations
- External API calls (Razorpay)
- PDF generation
- Data transformation

### Repository Layer (`domains/*/repository.ts`)
- Database queries
- Data mapping (DB row → Entity)
- Query building
- Error handling

## Security

### Tenant Isolation
- **CRITICAL**: Backend NEVER accepts `company_id` from frontend
- `company_id` always derived from JWT token
- All queries include `.eq('company_id', context.companyId)`
- RLS policies provide defense-in-depth

### Authentication
- JWT verification via Supabase
- Token extracted from `Authorization: Bearer <token>` header
- User context attached to request via middleware

## Error Handling

### Standardized Error Responses
```typescript
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "Template not found",
    details?: {}
  },
  meta: {
    request_id: "uuid",
    timestamp: "2026-01-10T12:00:00Z"
  }
}
```

### Error Classes
- `ValidationError` (400)
- `NotFoundError` (404)
- `ForbiddenError` (403)
- `ConflictError` (409)
- `UnauthorizedError` (401)

## Code Quality Standards (2026)

### TypeScript
- Strict mode enabled
- No `any` types (use `unknown` when needed)
- Type imports (`import type`)
- Nullish coalescing (`??`)
- Optional chaining (`?.`)

### Code Organization
- Single Responsibility Principle
- DRY (Don't Repeat Yourself)
- Clear separation of concerns
- Descriptive naming
- Small, focused functions

### Testing (Future)
- Unit tests for services
- Integration tests for APIs
- E2E tests for critical flows

## API Design

### RESTful Conventions
- `GET /api/v1/templates` - List resources
- `GET /api/v1/templates/:id` - Get resource
- `POST /api/v1/templates` - Create resource
- `PUT /api/v1/templates/:id` - Update resource
- `DELETE /api/v1/templates/:id` - Delete resource

### Response Format
```typescript
{
  success: true,
  data: { ... },
  meta: {
    request_id: "uuid",
    timestamp: "ISO8601"
  }
}
```

### Pagination
```typescript
{
  items: [...],
  pagination: {
    page: 1,
    limit: 20,
    total: 100,
    total_pages: 5
  }
}
```

## Async Job Pattern

For long-running operations (> 50 items):
1. Return `202 Accepted` with `job_id`
2. Client polls `/api/v1/jobs/:jobId` for status
3. Job status: `pending` → `processing` → `completed` / `failed`

## File Storage

### Supabase Storage
- Bucket: `minecertificate`
- Paths: `{domain}/{company_id}/{filename}`
- Signed URLs for downloads (1 hour expiry)
- Public URLs for previews

## Dependencies

### Core
- **Fastify 5.6.2** - Web framework
- **TypeScript 5.7.2** - Type safety
- **Zod 3.24.1** - Schema validation

### Domain
- **pdf-lib** - PDF manipulation
- **qrcode** - QR code generation
- **jszip** - ZIP file creation
- **date-fns** - Date formatting

### Infrastructure
- **@supabase/supabase-js** - Database & Storage
- **razorpay** - Payment processing

## Performance

### Targets
- API response time: < 200ms (p95)
- Certificate generation: < 30s (50 certs)
- Concurrent requests: 1000+

### Optimization
- Connection pooling (Supabase)
- Async job processing (large batches)
- Caching (future: Redis)

## Deployment

### Vercel Serverless
- Each route = serverless function
- Auto-scaling
- Cold start: ~100-500ms
- Timeout: 60 seconds

---

**Last Updated**: 2026-01-10  
**Version**: 1.0.0
