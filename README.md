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

**Required variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (bypasses RLS)
- `SUPABASE_ANON_KEY` - Supabase anonymous key (for auth operations)

**Optional variables (with defaults):**
- `PORT` - Backend server port (default: `3001`)
- `FRONTEND_URL` - Frontend URL for CORS (default: `http://localhost:3000`)
- `NODE_ENV` - Environment: `development`, `production`, or `test` (default: `development`)

**For billing features (optional):**
- `RAZORPAY_KEY_ID_TEST` / `RAZORPAY_KEY_ID_PROD` - Razorpay API keys
- `RAZORPAY_KEY_SECRET_TEST` / `RAZORPAY_KEY_SECRET_PROD` - Razorpay API secrets
- `RAZORPAY_WEBHOOK_SECRET_TEST` / `RAZORPAY_WEBHOOK_SECRET_PROD` - Webhook secrets

### 3. Development

```bash
npm run dev
```

**Backend server runs on `http://localhost:3001`** (frontend uses port 3000)

**Important:** Make sure your frontend's `.env` file has:
```
BACKEND_API_URL=http://localhost:3001/api/v1
```

## Localhost Development Setup

### Running Backend and Frontend Together

1. **Backend Setup:**
   ```bash
   cd Authentix-backend
   npm install
   cp .env.example .env
   # Edit .env and add your Supabase credentials
   npm run dev
   ```
   Backend will run on `http://localhost:3001`

2. **Frontend Setup:**
   ```bash
   cd Authentix-dashboard
   npm install
   # Create or edit .env.local file
   echo "BACKEND_API_URL=http://localhost:3001/api/v1" >> .env.local
   npm run dev
   ```
   Frontend will run on `http://localhost:3000`

3. **How They Connect:**
   - Frontend makes API calls to `/api/proxy/*` (Next.js route handler)
   - Next.js proxy forwards requests to `BACKEND_API_URL` (your backend)
   - Backend CORS is configured to allow `http://localhost:3000` in development
   - Authentication uses HttpOnly cookies set by the backend

### Verifying the Setup

1. Check backend is running:
   ```bash
   curl http://localhost:3001/health
   ```
   Should return: `{"status":"ok","timestamp":"...","version":"1.0.0"}`

2. Check frontend can reach backend:
   - Open browser dev tools
   - Navigate to `http://localhost:3000`
   - Check Network tab for API calls going through `/api/proxy/*`

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
