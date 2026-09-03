// src/pos-erp/services/saleService.js
//
// Adapted: tenant_id/business_id/branch_id stripped throughout.

import { supabase } from '../../supabaseClient';

export const saleService = {
  async getAll({ status, page = 1, limit = 50 } = {}) {
    let q = supabase
      .from('lb_sales')
      .select('*, items:lb_sale_items(*, product:lb_products(id,name,sku))', { count: 'exact' })
      .order('sale_date', { ascending: false });
    if (status) q = q.eq('status', status);
    const from = (page - 1) * limit; const to = from + limit - 1; q = q.range(from, to);
    const { data, error, count } = await q; if (error) throw error; return { data, count, page, limit };
  },
  async getById(id) {
    const { data, error } = await supabase
      .from('lb_sales')
      .select('*, items:lb_sale_items(*, product:lb_products(id,name,sku)), payments:lb_payments(*)')
      .eq('id', id)
      .single();
    if (error) throw error; return data;
  },
  async create(sale) {
    const { items, payments, ...header } = sale;
    const { data: headerData, error: hErr } = await supabase.from('lb_sales').insert(header).select().single();
    if (hErr) throw hErr;
    if (items?.length) {
      const itemsWithId = items.map(i => ({ ...i, sale_id: headerData.id }));
      const { error: iErr } = await supabase.from('lb_sale_items').insert(itemsWithId);
      if (iErr) throw iErr;
    }
    if (payments?.length) {
      const paymentsWithId = payments.map(p => ({ ...p, sale_id: headerData.id }));
      const { error: pErr } = await supabase.from('lb_payments').insert(paymentsWithId);
      if (pErr) throw pErr;
    }
    // Reduce inventory
    for (const item of (items || [])) {
      const { data: inv } = await supabase.from('lb_inventory').select('*').eq('product_id', item.product_id).single();
      if (inv) {
        await supabase.from('lb_inventory').update({ quantity: inv.quantity - item.quantity, updated_at: new Date().toISOString() }).eq('id', inv.id);
        await supabase.from('lb_stock_movements').insert({ product_id: item.product_id, movement_type: 'SALE', quantity: -item.quantity, unit_cost: item.unit_cost, reference_id: headerData.id, reference_type: 'SALE' });
      }
    }
    return this.getById(headerData.id);
  },
  async voidSale(id, reason) {
    const { data, error } = await supabase.from('lb_sales').update({ status: 'VOIDED', notes: reason, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    // Restore inventory
    const { data: items } = await supabase.from('lb_sale_items').select('*').eq('sale_id', id);
    for (const item of (items || [])) {
      const { data: inv } = await supabase.from('lb_inventory').select('*').eq('product_id', item.product_id).single();
      if (inv) await supabase.from('lb_inventory').update({ quantity: inv.quantity + item.quantity, updated_at: new Date().toISOString() }).eq('id', inv.id);
    }
    return data;
  },
};
