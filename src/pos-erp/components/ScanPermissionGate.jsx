import React from 'react';
import { usePosErpAuth } from '../auth/usePosErpAuth';
import { can } from '../utils/permissions';

/**
 * Wraps a scan-capable action (a button, a whole page) and hides/disables
 * it if the current user lacks the permission. Uses the SAME logged-in
 * session as the rest of the app (via usePosErpAuth -> AuthContext) — no
 * second auth system, per spec section 36.
 *
 * NOTE: this app's real auth is role-based (STAFF_ROLES: staff, admin,
 * manager, superadmin, auditor, teller — see AuthContext.js), not
 * permission-string based. `can()` in utils/permissions.js only
 * recognises a `.permissions` array or `.hasPermission()` function on the
 * user object; neither exists here, so it currently fails OPEN (allows
 * access to any logged-in staff member) rather than actually checking a
 * permission. If per-role gating is needed, update `can()` to check
 * `profile.role` against STAFF_ROLES instead.
 *
 * <ScanPermissionGate permission={SCAN_PERMISSIONS.RECEIVE}>
 *   <button onClick={...}>📷 Scan Product</button>
 * </ScanPermissionGate>
 */
export default function ScanPermissionGate({ permission, children, fallback = null }) {
  const { profile } = usePosErpAuth();
  if (!can(profile, permission)) return fallback;
  return children;
}
