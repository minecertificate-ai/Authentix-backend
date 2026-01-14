# Changelog

## 2026-01-14

### Fixed - Schema Mismatches in User Profile and Dashboard Endpoints
- **Root cause:** Code was using old database schema columns/tables that no longer exist:
  - `organizations.logo` (removed) → should use `organizations.logo_file_id`
  - `verification_logs` table (removed) → should use `certificate_verification_events`
  - `import_jobs` table (removed) → should use `file_import_jobs`
  - `company_id` column → should use `organization_id`
  - Missing organization fields: `application_id`, `billing_status`, `industry_id`

- **Fixes:**
  - **`GET /api/v1/users/me` (UserRepository.getProfile):**
    - Removed `organizations.logo` selection (column doesn't exist)
    - Added `organizations.logo_file_id` to response (nullable)
    - Added `organizations.application_id`, `billing_status`, `industry_id` to response
    - Updated membership query to include `role_id` and join `organization_roles` for `role_key`
    - Updated `UserProfile` type to match new schema contract
    - Response now includes: `profile`, `organization` (with all new fields), `role` (from `membership.role_key`)
  
  - **`GET /api/v1/dashboard/stats` (DashboardRepository):**
    - Replaced `verification_logs` with `certificate_verification_events` table
    - Changed `verified_at` → `scanned_at` (new column name)
    - Replaced `import_jobs` with `file_import_jobs` table
    - Changed `company_id` → `organization_id` throughout
    - Removed soft-delete filters (new schema doesn't use `deleted_at` on certificates)
    - Updated `getRecentVerifications` to join `certificates` and return `certificate_number` instead of `course_name`
    - Updated `RecentVerification` type to match new schema
  
  - **Dashboard Service Resilience:**
    - Made `getDashboardData` resilient to partial failures
    - If `getStats`, `getRecentImports`, or `getRecentVerifications` fail, endpoint still returns 200 with partial data
    - Failed components default to empty arrays/zeros instead of causing 500 errors
    - Logs component failures without breaking the entire response
  
  - **Verification Service:**
    - Updated `logVerification` to write to `certificate_verification_events` instead of `verification_logs`
    - Changed `company_id` → `organization_id`
    - Changed `verified_at` → `scanned_at`
    - Changed `verifier_ip` → `ip_hash` (matches new schema)

- **Files changed:**
  - `src/domains/users/repository.ts`: Updated query to use new schema, removed `logo`, added new org fields
  - `src/domains/users/types.ts`: Updated `UserProfile` interface to match new schema
  - `src/domains/dashboard/repository.ts`: Replaced old tables/columns with new schema equivalents
  - `src/domains/dashboard/types.ts`: Updated `RecentVerification` type to use `certificate_number`
  - `src/domains/dashboard/service.ts`: Added error handling for partial failures
  - `src/domains/verification/service.ts`: Updated to use `certificate_verification_events`

- **Verification:**
  - `/api/v1/users/me` now returns 200 with complete organization and membership data
  - `/api/v1/dashboard/stats` returns 200 even with empty tables or partial component failures
  - All queries use correct table/column names matching `DATABASE_DOCUMENTATION_DETAILED.md`
  - No remaining references to `organizations.logo` or `verification_logs` in runtime code

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

### Fixed - Slug Constraint Violation and Required Fields
- **Root cause:** Bootstrap was generating slugs based on company name (with hyphens/numbers), violating `organizations_slug_format_chk` constraint (must be exactly 20 lowercase letters [a-z])
- **Root cause:** `billing_address` (required jsonb NOT NULL) was not being set in insert payload
- **Fix:**
  - **Slug Generation:** Created `generateOrganizationSlug()` function that generates exactly 20 lowercase letters [a-z] using crypto.randomBytes
  - **Slug Validation:** Added validation to ensure slug matches `^[a-z]{20}$` before insert
  - **Collision Safety:** Added retry logic (up to 5 attempts) for unique violations on slug/application_id
  - **Required Fields:** Added `billing_address` to insert payload with safe default: `{ source: 'bootstrap', status: 'incomplete', provided_at: null }`
  - **Enhanced Error Logging:** Error messages now include Postgres error code, constraint name, and attempt count
  - **Pre-check Uniqueness:** Check slug uniqueness before insert (up to 10 attempts) to reduce database errors
- **Files changed:**
  - `src/lib/utils/ids.ts`: Added `generateOrganizationSlug()` function
  - `src/domains/auth/service.ts`: 
    - Replaced company-name-based slug generation with `generateOrganizationSlug()`
    - Added slug validation (20 chars, [a-z] only)
    - Added retry logic for unique violations
    - Added `billing_address` to insert payload
    - Enhanced error logging with structured details
