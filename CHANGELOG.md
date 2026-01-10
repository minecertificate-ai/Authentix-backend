# Changelog

## [1.0.0] - 2026-01-10

### Updated to Latest 2026 Versions

- **Node.js**: Updated to 24.12.0 (Krypton LTS) - Active support until October 2026
- **Fastify**: Updated to 5.6.2 (latest as of January 2026)
- **@fastify/cors**: Updated to 11.2.0
- **@supabase/supabase-js**: Updated to 2.90.1
- **TypeScript**: Updated to 5.7.2
- **ESLint**: Updated to 9.17.0
- **@typescript-eslint**: Updated to 8.18.1
- **@types/node**: Updated to 22.10.2

### Modernization

- Switched to ES Modules (`"type": "module"`)
- Updated TypeScript config to ES2024 target with NodeNext module resolution
- Modernized code patterns:
  - Type imports (`import type`)
  - Nullish coalescing (`??`)
  - Optional chaining
  - Strict TypeScript checks
- Updated Fastify to v5 patterns (async plugin registration)
- Enhanced error handling with Fastify logger
- Added pino-pretty for development logging

### Security

- All dependencies updated to latest stable versions
- Node.js 18.x EOL (ended April 30, 2025) - upgraded to 24.x

---

**Note**: Node.js 24.x (Krypton) is the current LTS version as of January 2026, with active support until October 20, 2026, and security support until April 30, 2028.
