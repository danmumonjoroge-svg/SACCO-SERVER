
import { supabase } from '../supabaseClient';
export const inventoryService = {
  async getAll({ tenantId, businessId, branchId, productId } = {}) {
    let q = supabase.from('lb_inventory').select('*, product:lb_products(id,name,sku,reorder_level)').eq('tenant_id', tenantId).eq('business_id', businessId).order('product(name)');
    if (branchId) q = q.eq('branch_id', branchId); if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q; if (error) throw error; return data;
  },
  async getMovements({ tenantId, businessId, branchId, productId, movementType, limit = 50 } = {}) {
    let q = supabase.from('lb_stock_movements').select('*, product:lb_products(id,name,sku)').eq('tenant_id', tenantId).eq('business_id', businessId).order('created_at', { ascending: false }).limit(limit);
    if (branchId) q = q.eq('branch_id', branchId); if (productId) q = q.eq('product_id', productId); if (movementType) q = q.eq('movement_type', movementType);
    const { data, error } = await q; if (error) throw error; return data;
  },
  async adjustStock({ tenantId, businessId, branchId, productId, quantity, reason, referenceId, referenceType, createdBy, movementType, unitCost }) {
    const { data: existing } = await supabase.from('lb_inventory').select('*').eq('tenant_id', tenantId).eq('business_id', businessId).eq('branch_id', branchId).eq('product_id', productId).single();
    if (existing) {
      await supabase.from('lb_inventory').update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('lb_inventory').insert({ tenant_id: tenantId, business_id: businessId, branch_id: branchId, product_id: productId, quantity });
    }
    // movementType/unitCost are optional and default to prior behaviour
    // (ADJUSTMENT, no unit cost) so every existing caller keeps working
    // unchanged — only new callers (e.g. stocktake COUNT postings) need to
    // pass them.
    await supabase.from('lb_stock_movements').insert({ tenant_id: tenantId, business_id: businessId, branch_id: branchId, product_id: productId, movement_type: movementType || 'ADJUSTMENT', quantity, unit_cost: unitCost, reference_id: referenceId, reference_type: referenceType, notes: reason, created_by: createdBy });
  },
  async transferStock({ tenantId, businessId, fromBranchId, toBranchId, productId, quantity, createdBy }) {
    await this.adjustStock({ tenantId, businessId, branchId: fromBranchId, productId, quantity: -quantity, reason: `Transfer to branch ${toBranchId}`, referenceType: 'TRANSFER_OUT', movementType: 'TRANSFER_OUT', createdBy });
    await this.adjustStock({ tenantId, businessId, branchId: toBranchId, productId, quantity, reason: `Transfer from branch ${fromBranchId}`, referenceType: 'TRANSFER_IN', movementType: 'TRANSFER_IN', createdBy });
  },
};
