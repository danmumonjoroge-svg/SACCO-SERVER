# Auth fixes — what changed and what to do with each file

## Files to REPLACE at their existing paths

- `src/Context/AuthContext.js` → replace with the included version.
  Only change: `STAFF_ROLES` is now `export const` instead of a private
  `const`, so it can be imported elsewhere instead of re-typed.

- `src/App.js` → replace with the included version.
  - Imports `STAFF_ROLES` from `AuthContext.js` instead of redefining it.
  - `StaffGuard` now passes `state={{ from: location.pathname }}` when
    bouncing an unauthenticated visit to `/admin-login`.
  - `AdminLoginRoute` now redirects staff to `location.state?.from` (falls
    back to `/admin/dashboard` if nothing was passed).

- `src/components/Auth/AdminLogin.js` → replace with the included version.
  - Imports the shared `STAFF_ROLES` instead of its own separate list
    (was silently rejecting valid teller/auditor/superadmin accounts).
  - `navigate("/admin", ...)` → `navigate(from, ...)`, honoring
    `location.state.from`. **This is the fix for "POS Login goes to the
    main dashboard instead of POS."**

- `src/components/Auth/SetPassword.js` → **replace entirely** with the
  included version (this was your uploaded `ForgotPassword.js` — it was
  the correct implementation, just filed under the wrong name). The
  version currently wired up at `/set-password` re-asks for Member No +
  National ID and calls a custom `set_member_password` RPC after an
  unawaited, unused `signInWithOtp` call. That's a functional dead end at
  best; at worst, if that RPC exists and only checks member_no + national
  ID (not a secret), it's an account-takeover path. The replacement just
  waits for the session Supabase already attaches to the recovery-link
  URL and calls `supabase.auth.updateUser({ password })` — the standard,
  safe way to do this.

## Files to DELETE (unused, and each is a landmine if ever imported)

- `src/components/Auth/Authcontext.js` (lowercase) — a different, unused
  auth context querying a `profiles` table. Nothing imports it, but its
  name is one typo away from being imported by mistake instead of the
  real `Context/AuthContext.js`.
- `src/Routes/ProtectedRoute.js` (or wherever yours lives) — written
  against a `useAuth()` shape (`authReady`, `isAuthenticated`,
  `profileLoading`) that doesn't exist on your real AuthContext. Unused;
  App.js uses inline `MemberGuard`/`StaffGuard` instead.
- `src/components/Auth/AdminProtectedWrapper.js` — a client-side-only
  guard that trusts raw `localStorage` flags (`admin_verified`,
  `staff_session`, `staff_profile`) with **no server-side check at all**.
  If this ever gets wired to a real route, anyone can grant themselves
  admin access via devtools by setting those keys manually. Not used
  anywhere in App.js today — delete it before it tempts anyone.
- `src/components/Auth/Login.js` — unused duplicate of member login.
  Hardcodes `navigate("/member")` (bypassing role-based redirect) and
  links to `/forgot-password`, a route that doesn't exist in your router.
- `src/components/Auth/AuthService.js` — unused. Also contains a
  `loginAdmin({email, pin})` function that checks a plaintext `admin_pin`
  column fetched client-side via `.select("*")` — never wire this up;
  delete it.

None of the "delete" files are currently imported by `App.js`, so removing
them changes no behavior today — they're just risk sitting on disk.

## Not changed, but worth knowing

- `AuthPage.js` (member login at `/login`) already does the right thing —
  it navigates to `/redirect` after login and lets `PostLoginRedirect`
  decide where a member actually belongs, rather than hardcoding a path.
  `AdminLogin.js` now follows the same principle.
- `AdminLogin.js` still returns different error messages for "member
  number not found" vs "invalid password." That's a minor account-
  enumeration surface (an attacker can tell which member numbers exist).
  Left as-is since changing it affects support/UX expectations — happy to
  unify to a generic message if you want that tightened.
