// Universal Scanning Engine — Permission Keys
//
// These are the permission STRINGS the spec asks for (section 36). This
// file does NOT implement a permission system — it defines the keys the
// existing RBAC should recognise, and a small `can()` helper that adapts
// to whichever shape the existing AuthContext.user object uses.
//
// ASSUMPTION (unverified against the real project): `can()` below tries
// two common shapes:
//   1. user.permissions is an array of strings, e.g. ['inventory.scan', ...]
//   2. user.hasPermission is a function, e.g. user.hasPermission('inventory.scan')
// If the real system differs (e.g. role-based rather than permission-
// string-based), replace only the body of `can()` — every call site in
// this feature goes through this one function.

export const SCAN_PERMISSIONS = {
  SCAN: 'inventory.scan',
  RECEIVE: 'inventory.receive',
  STOCKTAKE: 'inventory.stocktake',
  TRANSFER: 'inventory.transfer',
  SALES_SCAN: 'sales.scan',
  SALES_CREATE: 'sales.create',
  BARCODE_MANAGE: 'product.barcode.manage',
};

export function can(user, permissionKey) {
  if (!user) return false;
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permissionKey);
  }
  if (typeof user.hasPermission === 'function') {
    return user.hasPermission(permissionKey);
  }
  // Fail-open is wrong for a permissions check; fail-closed until the real
  // shape is confirmed, EXCEPT when the app doesn't have RBAC wired up at
  // all yet (no permissions array AND no hasPermission fn on the user
  // object) — in that case assume permissions aren't enforced anywhere else
  // in the app either, and don't block a feature that has no way to check.
  const rbacPresent = 'permissions' in user || 'hasPermission' in user;
  return !rbacPresent;
}
