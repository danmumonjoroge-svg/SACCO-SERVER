// src/pos-erp/auth/usePosErpAuth.js
//
// Thin adapter between the POS/Inventory module and the app's real auth.
// The module's original files were written against a `useContext(AuthContext)`
// call and a multi-tenant `user.tenant_id` shape that don't exist in this
// app. This file is the ONLY place that difference is bridged — every POS
// page/hook/service should import from here, never from ../../Context/AuthContext
// directly, so if auth shape changes again there's one place to fix it.
//
// Real shape (from src/Context/AuthContext.js):
//   useAuth() -> { user, profile, role, loading, isMember, isStaff, isAdmin,
//                  isUnassigned, logout, refreshProfile }
//   user    = raw Supabase auth user (id, email, ...)
//   profile = row from `users` table for staff: { id, member_no, name, email, status, role }
//
// This app is single-org / single-branch (confirmed) — there is no
// tenant_id, business_id, or branch_id anywhere in the schema. The POS
// module's original code assumed all three. Rather than fabricate fake
// IDs, this adapter simply does not provide them, and every POS
// service/hook has been rewritten to not require them (see services/*.js).
//
// `staffId` below is what POS records should use for "who did this" audit
// columns (cashier_id, created_by, received_by, etc.) — it's the actual
// `users.id` row, NOT the Supabase auth uid, matching how the rest of
// this app's `users` table is keyed.

import { useAuth } from "../../Context/AuthContext";

export function usePosErpAuth() {
  const { user, profile, role, loading, isStaff, isAdmin, logout } = useAuth();

  return {
    // Supabase auth user — id/email only, kept for parity with old code
    authUser: user,
    // `users` table row for the logged-in staff member
    profile,
    // Convenience: the `users.id` to stamp on records this staff member creates
    staffId: profile?.id ?? null,
    staffName: profile?.name ?? null,
    role,
    isStaff,
    isAdmin,
    loading,
    logout,
  };
}
