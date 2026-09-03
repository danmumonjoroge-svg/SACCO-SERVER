// src/pos-erp/services/inventoryService.js
//
// Adapted: tenant_id/business_id/branch_id stripped throughout (single-org,
// single-location app). transferStock() from the original module (branch A
// -> branch B) is dropped entirely — there's only one location, so a
// transfer between branches has no meaning here. If you ever add branches,
// this is the file to bring it back into.

import { supabase } from '../../supabaseClient';

export const inventoryService = {
  async getAll({ productId } = {}) {
    let q = supabase
      .from('lb_inventory')
      .select('*, product:lb_products(id,name,sku,reorder_level)')
      .order('product(name)');
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q; if (error) throw error; return data;
  },
  async getMovements({ productId, movementType, limit = 50 } = {}) {
    let q = supabase
      .from('lb_stock_movements')
      .select('*, product:lb_products(id,name,sku)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (productId) q = q.eq('product_id', productId);
    if (movementType) q = q.eq('movement_type', movementType);
    const { data, error } = await q; if (error) throw error; return data;
  },
  async adjustStock({ productId, quantity, reason, referenceId, referenceType, createdBy, movementType, unitCost }) {
    const { data: existing } = await supabase.from('lb_inventory').select('*').eq('product_id', productId).single();
    if (existing) {
      await supabase.from('lb_inventory').update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('lb_inventory').insert({ product_id: productId, quantity });
    }
    // movementType/unitCost are optional and default to prior behaviour
    // (ADJUSTMENT, no unit cost) so every existing caller keeps working
    // unchanged — only new callers (e.g. stocktake COUNT postings) need to
    // pass them.
    await supabase.from('lb_stock_movements').insert({ product_id: productId, movement_type: movementType || 'ADJUSTMENT', quantity, unit_cost: unitCost, reference_id: referenceId, reference_type: referenceType, notes: reason, created_by: createdBy });
  },
};
