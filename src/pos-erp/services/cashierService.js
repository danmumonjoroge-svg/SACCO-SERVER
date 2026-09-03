// src/pos-erp/services/cashierService.js
//
// NEW FILE — did not exist anywhere in the module (this is why the build
// error "Can't resolve '../services/cashierService'" was unfixable by an
// import-path change alone). Written to match the single-org, single-
// location pattern already used by productService.js/saleService.js —
// no tenant_id/business_id/branch_id.
//
// ASSUMPTION (unverified against your real schema): expects two tables
// that may not exist yet — lb_cashier_shifts and lb_cash_movements.
// Minimal shape needed by useCashierShifts.js:
//
//   lb_cashier_shifts
//     id, cashier_id, opening_float, closing_float, actual_cash,
//     status ('OPEN' | 'CLOSED'), notes, opened_at, closed_at
//
//   lb_cash_movements
//     id, shift_id, movement_type, amount, reason, created_by, created_at
//
// If your Supabase project doesn't have these tables yet, create them
// (or tell me your actual column names and I'll adjust this file).

import { supabase } from '../../supabaseClient';

const SHIFTS_TABLE = 'lb_cashier_shifts';
const MOVEMENTS_TABLE = 'lb_cash_movements';

export const cashierService = {
  async getShifts({ limit = 50 } = {}) {
    const { data, error } = await supabase
      .from(SHIFTS_TABLE)
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async openShift(shift) {
    const { data, error } = await supabase
      .from(SHIFTS_TABLE)
      .insert({ ...shift, opened_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async closeShift(id, { actualCash, notes }) {
    const { data, error } = await supabase
      .from(SHIFTS_TABLE)
      .update({
        status: 'CLOSED',
        actual_cash: actualCash,
        notes,
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addCashMovement(movement) {
    const { data, error } = await supabase
      .from(MOVEMENTS_TABLE)
      .insert(movement)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
