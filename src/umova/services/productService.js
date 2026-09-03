
import { supabase } from '../supabaseClient';
export const productService = {
  async getAll({ tenantId, businessId, categoryId, search, page = 1, limit = 50 } = {}) {
    let q = supabase.from('lb_products').select('*, category:lb_product_categories(id,name), unit:lb_product_units(id,name,abbreviation)', { count: 'exact' }).eq('tenant_id', tenantId).eq('business_id', businessId).order('name');
    if (categoryId) q = q.eq('category_id', categoryId);
    if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
    const from = (page - 1) * limit; const to = from + limit - 1; q = q.range(from, to);
    const { data, error, count } = await q; if (error) throw error; return { data, count, page, limit };
  },
  async getById(id, tenantId) {
    const { data, error } = await supabase.from('lb_products').select('*, category:lb_product_categories(id,name), unit:lb_product_units(id,name,abbreviation)').eq('id', id).eq('tenant_id', tenantId).single();
    if (error) throw error; return data;
  },
  async create(product) {
    const { data, error } = await supabase.from('lb_products').insert(product).select().single();
    if (error) throw error; return data;
  },
  async update(id, updates) {
    const { data, error } = await supabase.from('lb_products').update({...updates, updated_at: new Date().toISOString()}).eq('id', id).select().single();
    if (error) throw error; return data;
  },
  async delete(id) {
    const { error } = await supabase.from('lb_products').delete().eq('id', id); if (error) throw error;
  },
};
