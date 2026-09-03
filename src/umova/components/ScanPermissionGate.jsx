import React, { useContext } from 'react';
import { AuthContext } from '../../part1/context/authContext';
import { can } from '../utils/permissions';

/**
 * Wraps a scan-capable action (a button, a whole page) and hides/disables
 * it if the current user lacks the permission. Uses the SAME logged-in
 * user/session as the rest of the app (AuthContext) — no second auth
 * system, per spec section 36.
 *
 * <ScanPermissionGate permission={SCAN_PERMISSIONS.RECEIVE}>
 *   <button onClick={...}>📷 Scan Product</button>
 * </ScanPermissionGate>
 *
 * <ScanPermissionGate permission={SCAN_PERMISSIONS.RECEIVE} fallback={<p>No access</p>}>
 *   ...
 * </ScanPermissionGate>
 */
export default function ScanPermissionGate({ permission, children, fallback = null }) {
  const { user } = useContext(AuthContext);
  if (!can(user, permission)) return fallback;
  return children;
}
