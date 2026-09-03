
import { supabase } from '../supabaseClient';

const TABLE = 'lb_suppliers';

export const supplierService = {
  async getAll({ tenantId, businessId, status, search, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
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

  async getById(id, tenantId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
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

  async getAging(tenantId, businessId) {
    const { data, error } = await supabase
      .from('lb_supplier_aging')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .order('overdue_amount', { ascending: false });
    if (error) throw error;
    return data;
  },
};
