# Changelog

## 2026-01-13

### Fixed: Bootstrap fails to create organization/membership
- Root cause: `/auth/bootstrap` was using `authMiddleware` which requires an existing organization membership; bootstrap is the step that creates it.
- Fix:
  - Added `verifyJWTWithoutMembership` and `jwtOnlyAuthMiddleware` to allow authenticated calls without requiring membership.
  - Updated `/api/v1/auth/bootstrap` to use the JWT-only middleware and added request/response logging (user_id, org_id, membership_id, errors).
  - Added detailed logging inside `AuthService.bootstrap` for profile/org/member creation and error contexts.
  - Confirmed all bootstrap DB writes use the Supabase service role client (bypasses RLS).

### Frontend actions required
- After successful login, call `POST /api/proxy/auth/bootstrap` (with cookies) before redirecting to `/dashboard`.
- Dashboard guard: if `/api/proxy/users/me` returns no organization/membership, call bootstrap, then re-fetch; show an error screen if still missing to avoid loops.

### Files changed (backend)
- `src/lib/auth/jwt-verifier.ts`: add `verifyJWTWithoutMembership`.
- `src/lib/auth/middleware.ts`: add `jwtOnlyAuthMiddleware`.
- `src/api/v1/auth.ts`: use JWT-only middleware for bootstrap; add logging; add `GET /auth/me` endpoint with email parameter support.
- `src/domains/auth/service.ts`: add verbose bootstrap logging; update `verifySession` to return `email_verified` status.

## [Unreleased] - 2026-01-XX

### Added - Cross-Device Verification Support
- **New endpoint:** `GET /api/v1/auth/me?email={email}` - Allows checking email verification status by email parameter (for cross-device/browser polling scenarios)
- **Enhanced:** `GET /api/v1/auth/session` - Now returns `email_verified` status in response
- **Enhanced:** `GET /api/v1/auth/me` - Returns `email_verified` status, supports checking by email query parameter when no session token exists

### Fixed - Empty JSON Body Handling
- **Fixed:** `POST /api/v1/auth/bootstrap` - Now accepts empty JSON bodies (frontend may send `Content-Type: application/json` with empty body)
- Added custom content type parser for auth routes to gracefully handle empty JSON bodies
- Resolves error: "Body cannot be empty when content-type is set to 'application/json'"

### Purpose
Enables frontend polling to detect email verification even when verification link is clicked in a different browser/device. Frontend can now check verification status by calling `GET /api/proxy/auth/me?email={email}` instead of relying on local cookies.

## [Unreleased] - 2026-01-XX (Bootstrap Schema Fix)

### Fixed - Bootstrap Column Name Mismatches
- **Root cause:** Bootstrap service was using old column names that don't exist in the database schema:
  - `trial_start` → `trial_started_at`
  - `trial_end` → `trial_ends_at`
  - `free_certificates_included` → `trial_free_certificates_limit`
  - `billing_status: 'trial'` → `billing_status: 'trialing'`
  - Missing `trial_free_certificates_used` (default 0)
  - Audit logs: `user_id` → `actor_user_id`, `resource_type` → `entity_type`, `resource_id` → `entity_id`

- **Fixes:**
  - Updated membership check query to use correct column names (`trial_started_at`, `trial_ends_at`, `trial_free_certificates_limit`)
  - Fixed organization insert payload to use correct columns and values
  - Updated bootstrap return type mapping to use correct column names
  - Fixed audit log inserts to use `actor_user_id`, `entity_type`, `entity_id`
  - Added structured error responses with `bootstrap_failed` error code
  - Added logging of insert payload keys when organization creation fails
  - Ensured all bootstrap DB operations use service role client (bypasses RLS)

- **Files changed:**
  - `src/domains/auth/service.ts`: Fixed all column references in bootstrap method
  - `src/api/v1/auth.ts`: Enhanced error handling with structured error responses

- **Verification:**
  - Bootstrap now creates organization with correct trial columns
  - `trial_ends_at` is set to 7 days from creation
  - `billing_status` is set to `'trialing'`
  - `trial_free_certificates_limit` is set to 10
  - `trial_free_certificates_used` is set to 0
  - Audit logs are created with correct field names

### Fixed - Missing API Key Hash in Bootstrap
- **Root cause:** `organizations` table requires `api_key_hash` (NOT NULL constraint), but bootstrap was not generating or setting it
- **Fix:**
  - Added API key generation during bootstrap using `generateAPIKey()` and `hashAPIKey()`
  - Added `api_key_hash`, `api_key_created_at`, and `api_key_last_rotated_at` to organization insert payload
  - Resolves error: "null value in column 'api_key_hash' of relation 'organizations' violates not-null constraint"
- **Files changed:**
  - `src/domains/auth/service.ts`: Added API key generation and hash to organization creation

### Fixed - Enhanced Error Messages and Cross-Device Verification
- **Improved error messages:** Bootstrap errors now include step identifiers (e.g., "[Bootstrap Step: Organization Creation]")
- **Enhanced `/auth/me?email` endpoint:**
  - Works without cookies/session (cross-device verification support)
  - Uses SERVICE ROLE to query auth.users via Admin API
  - Returns `email_verified: true` when `email_confirmed_at` is set
  - Returns `valid: false` (not 500) when user not found
- **Bootstrap return fields:** Explicitly selects all required organization fields (billing_status, trial_*, api_key_*)
- **PostgREST schema cache note:** Added comment about refreshing schema cache after schema changes
- **Files changed:**
  - `src/domains/auth/service.ts`: Enhanced error messages, explicit field selection
  - `src/api/v1/auth.ts`: Improved `/auth/me?email` endpoint with better error handling
  - `src/lib/utils/ids.ts`: Added documentation for API key hashing approach

### Fixed - Removed Non-Existent Columns from Bootstrap
- **Root cause:** Bootstrap was trying to insert `api_key_created_at` and `api_key_last_rotated_at` which don't exist in `organizations` table
- **Fix:**
  - Removed `api_key_created_at` and `api_key_last_rotated_at` from organization insert payload
  - Removed these fields from `.select()` statement
  - Added validation to ensure `api_key_hash` is never null/undefined before insert
  - Enhanced `hashAPIKey()` function to validate input and throw errors if hash generation fails
- **New endpoint:** `GET /api/v1/auth/verification-status?email={email}` - Returns `{ verified: boolean }` for frontend polling
- **Enhanced error responses:** Bootstrap errors now include `step` field extracted from error message
- **Files changed:**
  - `src/domains/auth/service.ts`: Removed non-existent columns, added validation, enhanced error messages
  - `src/api/v1/auth.ts`: Added verification-status endpoint, enhanced error response structure
  - `src/lib/utils/ids.ts`: Added validation to `hashAPIKey()` to ensure it never returns null
