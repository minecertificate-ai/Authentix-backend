# Authentix Backend

Backend API for Authentix - a multi-tenant certificate generation & verification platform.

## Architecture

- **Runtime:** Node.js 20+ (recommended: 24.x LTS) (ESM modules)
- **Framework:** Fastify v5.6.2
- **Language:** TypeScript 5.7+
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **Billing:** Razorpay
- **Deployment:** Vercel (Serverless Functions)

See [BACKEND_DESIGN.md](./BACKEND_DESIGN.md) for detailed architecture documentation.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (bypasses RLS)
- `RAZORPAY_KEY_ID_TEST` / `RAZORPAY_KEY_ID_PROD` - Razorpay API keys
- `RAZORPAY_KEY_SECRET_TEST` / `RAZORPAY_KEY_SECRET_PROD` - Razorpay API secrets
- `RAZORPAY_WEBHOOK_SECRET_TEST` / `RAZORPAY_WEBHOOK_SECRET_PROD` - Webhook secrets

### 3. Development

```bash
npm run dev
```

Server runs on `http://localhost:3000`

### 4. Build

```bash
npm run build
```

### 5. Production

```bash
npm start
```

## API Endpoints

All endpoints are versioned under `/api/v1`:

- `GET /api/v1/templates` - List templates
- `POST /api/v1/templates` - Create template
- `GET /api/v1/certificates` - List certificates
- `POST /api/v1/certificates/generate` - Generate certificates
- `POST /api/v1/webhooks/razorpay` - Razorpay webhook handler

See [BACKEND_DESIGN.md](./BACKEND_DESIGN.md) for full API documentation.

## Authentication

### JWT Authentication (Frontend)

Frontend sends Supabase JWT in `Authorization` header:

```
Authorization: Bearer <supabase_jwt_token>
```

Backend verifies JWT and extracts `company_id` from user record.

### API Key Authentication (Programmatic)

For programmatic access:

```
X-Application-ID: <application_id>
X-API-Key: <api_key>
```

## Project Structure

```
src/
├── domains/          # Domain modules (business logic)
├── api/              # API routes (Fastify)
│   └── v1/
├── lib/              # Shared utilities
│   ├── supabase/
│   ├── razorpay/
│   ├── auth/
│   └── errors/
├── jobs/             # Async job handlers
└── index.ts          # Fastify app entry
```

## Development Guidelines

1. **Tenant Isolation:** Backend NEVER accepts `company_id` from frontend. Always derive from JWT.
2. **Error Handling:** Use standardized error format (see `lib/errors/`).
3. **Validation:** Use Zod schemas for input validation.
4. **Idempotency:** Support idempotency keys for critical operations.
5. **Async Jobs:** Return 202 Accepted for long-running operations.

## License

ISC
