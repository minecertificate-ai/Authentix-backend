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
- `src/api/v1/auth.ts`: use JWT-only middleware for bootstrap; add logging.
- `src/domains/auth/service.ts`: add verbose bootstrap logging.
