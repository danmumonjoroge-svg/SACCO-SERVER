// src/pos-erp/services/supplierService.js
//
// Adapted: tenant_id/business_id stripped throughout (this app is
// single-org — see usePosErpAuth.js for why). Table name, select shape,
// and error handling kept as-is.

import { supabase } from '../../supabaseClient';

const TABLE = 'lb_suppliers';

export const supplierService = {
  async getAll({ status, search, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .order('name', { ascending: true });

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('name', `%${search}%`);

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count, page, limit };
  },

  async getById(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(supplier) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(supplier)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },

  async getAging() {
    const { data, error } = await supabase
      .from('lb_supplier_aging')
      .select('*')
      .order('overdue_amount', { ascending: false });
    if (error) throw error;
    return data;
  },
};
