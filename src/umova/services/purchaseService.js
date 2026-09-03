
import { supabase } from '../supabaseClient';

const PR_TABLE = 'lb_purchase_requests';
const PRI_TABLE = 'lb_purchase_request_items';
const PO_TABLE = 'lb_purchase_orders';
const POI_TABLE = 'lb_purchase_order_items';
const GRN_TABLE = 'lb_goods_received';
const GRI_TABLE = 'lb_goods_received_items';
const SR_TABLE = 'lb_supplier_returns';
const SRI_TABLE = 'lb_supplier_return_items';
const SI_TABLE = 'lb_supplier_invoices';

// ── Purchase Requests ──────────────────────────────────────
export const purchaseRequestService = {
  async getAll({ tenantId, businessId, status, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(PR_TABLE)
      .select(`*, items:${PRI_TABLE}(*, product:lb_products(id, name, sku), unit:lb_product_units(id, name, abbreviation))`, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .order('request_date', { ascending: false });

    if (status) query = query.eq('status', status);

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count, page, limit };
  },

  async getById(id, tenantId) {
    const { data, error } = await supabase
      .from(PR_TABLE)
      .select(`*, items:${PRI_TABLE}(*, product:lb_products(id, name, sku, unit_id), unit:lb_product_units(id, name, abbreviation))`)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) throw error;
    return data;
  },

  async create(pr) {
    const { items, ...header } = pr;
    const { data: headerData, error: headerError } = await supabase
      .from(PR_TABLE)
      .insert(header)
      .select()
      .single();
    if (headerError) throw headerError;

    if (items?.length) {
      const itemsWithId = items.map(i => ({ ...i, purchase_request_id: headerData.id }));
      const { error: itemsError } = await supabase.from(PRI_TABLE).insert(itemsWithId);
      if (itemsError) throw itemsError;
    }

    return this.getById(headerData.id, headerData.tenant_id);
  },

  async updateStatus(id, status, tenantId) {
    const { data, error } = await supabase
      .from(PR_TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async convertToPO(id, tenantId) {
    const pr = await this.getById(id, tenantId);
    if (pr.status !== 'APPROVED') throw new Error('Purchase request must be approved first');

    const poNumber = await generatePONumber(pr.business_id);
    const po = {
      tenant_id: pr.tenant_id,
      business_id: pr.business_id,
      branch_id: pr.branch_id,
      supplier_id: pr.supplier_id,
      purchase_request_id: pr.id,
      order_number: poNumber,
      status: 'DRAFT',
      subtotal: pr.total_amount,
      total_amount: pr.total_amount,
      created_by: pr.requested_by,
    };

    const { data: poData, error: poError } = await supabase
      .from(PO_TABLE)
      .insert(po)
      .select()
      .single();
    if (poError) throw poError;

    const poItems = pr.items.map(i => ({
      purchase_order_id: poData.id,
      product_id: i.product_id,
      quantity_ordered: i.quantity,
      unit_id: i.unit_id,
      unit_cost: i.estimated_unit_cost,
      line_total: i.estimated_total,
    }));

    const { error: itemsError } = await supabase.from(POI_TABLE).insert(poItems);
    if (itemsError) throw itemsError;

    await this.updateStatus(id, 'CONVERTED', tenantId);
    return poData;
  },
};

// ── Purchase Orders ────────────────────────────────────────
export const purchaseOrderService = {
  async getAll({ tenantId, businessId, status, supplierId, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(PO_TABLE)
      .select(`*, supplier:lb_suppliers(id, name), branch:lb_branches(id, name), items:${POI_TABLE}(*, product:lb_products(id, name, sku))`, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .order('order_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (supplierId) query = query.eq('supplier_id', supplierId);

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count, page, limit };
  },

  async getById(id, tenantId) {
    const { data, error } = await supabase
      .from(PO_TABLE)
      .select(`*, supplier:lb_suppliers(id, name, phone), branch:lb_branches(id, name), items:${POI_TABLE}(*, product:lb_products(id, name, sku, unit_id), unit:lb_product_units(id, name, abbreviation))`)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) throw error;
    return data;
  },

  async create(po) {
    const { items, ...header } = po;
    const { data: headerData, error: headerError } = await supabase
      .from(PO_TABLE)
      .insert(header)
      .select()
      .single();
    if (headerError) throw headerError;

    if (items?.length) {
      const itemsWithId = items.map(i => ({ ...i, purchase_order_id: headerData.id }));
      const { error: itemsError } = await supabase.from(POI_TABLE).insert(itemsWithId);
      if (itemsError) throw itemsError;
    }

    return this.getById(headerData.id, headerData.tenant_id);
  },

  async updateStatus(id, status, tenantId) {
    const { data, error } = await supabase
      .from(PO_TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Goods Received (GRN) ─────────────────────────────────
export const goodsReceivedService = {
  async getAll({ tenantId, businessId, branchId, status, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(GRN_TABLE)
      .select(`*, supplier:lb_suppliers(id, name), branch:lb_branches(id, name), purchase_order:lb_purchase_orders(id, order_number), items:${GRI_TABLE}(*, product:lb_products(id, name, sku))`, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .order('received_date', { ascending: false });

    if (branchId) query = query.eq('branch_id', branchId);
    if (status) query = query.eq('status', status);

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count, page, limit };
  },

  async getById(id, tenantId) {
    const { data, error } = await supabase
      .from(GRN_TABLE)
      .select(`*, supplier:lb_suppliers(id, name, phone), branch:lb_branches(id, name), purchase_order:lb_purchase_orders(id, order_number), received_by_user:users!lb_goods_received_received_by_fkey(id, full_name), items:${GRI_TABLE}(*, product:lb_products(id, name, sku, unit_id), unit:lb_product_units(id, name, abbreviation))`)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) throw error;
    return data;
  },

  async createFromPO(poId, grn, tenantId) {
    const po = await purchaseOrderService.getById(poId, tenantId);
    if (!po) throw new Error('Purchase order not found');

    const grnNumber = await generateGRNNumber(po.business_id);
    const header = {
      tenant_id: tenantId,
      business_id: po.business_id,
      branch_id: grn.branch_id || po.branch_id,
      supplier_id: po.supplier_id,
      purchase_order_id: poId,
      grn_number: grnNumber,
      reference_invoice: grn.reference_invoice,
      notes: grn.notes,
      received_by: grn.received_by,
    };

    const { data: grnData, error: grnError } = await supabase
      .from(GRN_TABLE)
      .insert(header)
      .select()
      .single();
    if (grnError) throw grnError;

    // Create GRN items and update inventory
    const items = grn.items.map(i => ({
      goods_received_id: grnData.id,
      product_id: i.product_id,
      purchase_order_item_id: i.purchase_order_item_id,
      quantity_received: i.quantity_received,
      unit_id: i.unit_id,
      unit_cost: i.unit_cost,
      line_total: i.quantity_received * i.unit_cost,
      batch_number: i.batch_number,
      expiry_date: i.expiry_date,
      notes: i.notes,
    }));

    const { error: itemsError } = await supabase.from(GRI_TABLE).insert(items);
    if (itemsError) throw itemsError;

    // Update inventory
    for (const item of grn.items) {
      await updateInventoryOnReceipt({
        tenantId,
        businessId: po.business_id,
        branchId: grn.branch_id || po.branch_id,
        productId: item.product_id,
        quantity: item.quantity_received,
        unitCost: item.unit_cost,
        batchNumber: item.batch_number,
        expiryDate: item.expiry_date,
        referenceId: grnData.id,
        referenceType: 'GOODS_RECEIVED',
      });
    }

    // Update PO received quantities
    for (const item of grn.items) {
      if (item.purchase_order_item_id) {
        const { data: poi } = await supabase
          .from(POI_TABLE)
          .select('quantity_received')
          .eq('id', item.purchase_order_item_id)
          .single();

        const newQty = (poi?.quantity_received || 0) + item.quantity_received;
        await supabase
          .from(POI_TABLE)
          .update({ quantity_received: newQty })
          .eq('id', item.purchase_order_item_id);
      }
    }

    // Update PO status
    const { data: poItems } = await supabase
      .from(POI_TABLE)
      .select('quantity_ordered, quantity_received')
      .eq('purchase_order_id', poId);

    const allReceived = poItems.every(i => (i.quantity_received || 0) >= i.quantity_ordered);
    const anyReceived = poItems.some(i => (i.quantity_received || 0) > 0);
    const newStatus = allReceived ? 'FULLY_RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : 'SENT';
    await purchaseOrderService.updateStatus(poId, newStatus, tenantId);

    // Create supplier invoice
    const invoice = {
      tenant_id: tenantId,
      business_id: po.business_id,
      supplier_id: po.supplier_id,
      goods_received_id: grnData.id,
      purchase_order_id: poId,
      invoice_number: grn.reference_invoice || grnNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      subtotal: grnData.subtotal || items.reduce((sum, i) => sum + i.line_total, 0),
      total_amount: grnData.total_amount || items.reduce((sum, i) => sum + i.line_total, 0),
      amount_due: grnData.total_amount || items.reduce((sum, i) => sum + i.line_total, 0),
      created_by: grn.received_by,
    };
    await supabase.from(SI_TABLE).insert(invoice);

    return this.getById(grnData.id, tenantId);
  },

  async createQuick(grn, tenantId) {
    // Quick purchase without PO
    const grnNumber = await generateGRNNumber(grn.business_id);
    const header = {
      tenant_id: tenantId,
      business_id: grn.business_id,
      branch_id: grn.branch_id,
      supplier_id: grn.supplier_id,
      grn_number: grnNumber,
      reference_invoice: grn.reference_invoice,
      notes: grn.notes,
      received_by: grn.received_by,
    };

    const { data: grnData, error: grnError } = await supabase
      .from(GRN_TABLE)
      .insert(header)
      .select()
      .single();
    if (grnError) throw grnError;

    const items = grn.items.map(i => ({
      goods_received_id: grnData.id,
      product_id: i.product_id,
      quantity_received: i.quantity_received,
      unit_id: i.unit_id,
      unit_cost: i.unit_cost,
      line_total: i.quantity_received * i.unit_cost,
      batch_number: i.batch_number,
      expiry_date: i.expiry_date,
      notes: i.notes,
    }));

    const { error: itemsError } = await supabase.from(GRI_TABLE).insert(items);
    if (itemsError) throw itemsError;

    // Update inventory
    for (const item of grn.items) {
      await updateInventoryOnReceipt({
        tenant_id: tenantId,
        business_id: grn.business_id,
        branch_id: grn.branch_id,
        productId: item.product_id,
        quantity: item.quantity_received,
        unitCost: item.unit_cost,
        batchNumber: item.batch_number,
        expiryDate: item.expiry_date,
        referenceId: grnData.id,
        referenceType: 'GOODS_RECEIVED',
      });
    }

    // Create supplier invoice
    const totalAmount = items.reduce((sum, i) => sum + i.line_total, 0);
    const invoice = {
      tenant_id: tenantId,
      business_id: grn.business_id,
      supplier_id: grn.supplier_id,
      goods_received_id: grnData.id,
      invoice_number: grn.reference_invoice || grnNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      subtotal: totalAmount,
      total_amount: totalAmount,
      amount_due: totalAmount,
      created_by: grn.received_by,
    };
    await supabase.from(SI_TABLE).insert(invoice);

    return this.getById(grnData.id, tenantId);
  },
};

// ── Supplier Returns ───────────────────────────────────────
export const supplierReturnService = {
  async getAll({ tenantId, businessId, status, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(SR_TABLE)
      .select(`*, supplier:lb_suppliers(id, name), branch:lb_branches(id, name), items:${SRI_TABLE}(*, product:lb_products(id, name, sku))`, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .order('return_date', { ascending: false });

    if (status) query = query.eq('status', status);

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count, page, limit };
  },

  async create(sr) {
    const { items, ...header } = sr;
    const returnNumber = await generateReturnNumber(sr.business_id);
    header.return_number = returnNumber;

    const { data: srData, error: srError } = await supabase
      .from(SR_TABLE)
      .insert(header)
      .select()
      .single();
    if (srError) throw srError;

    if (items?.length) {
      const itemsWithId = items.map(i => ({ ...i, supplier_return_id: srData.id }));
      const { error: itemsError } = await supabase.from(SRI_TABLE).insert(itemsWithId);
      if (itemsError) throw itemsError;

      // Reduce inventory
      for (const item of items) {
        await updateInventoryOnAdjustment({
          tenant_id: sr.tenant_id,
          business_id: sr.business_id,
          branch_id: sr.branch_id,
          product_id: item.product_id,
          quantity: -item.quantity_returned,
          reason: `Supplier return: ${sr.reason}`,
          reference_id: srData.id,
          reference_type: 'SUPPLIER_RETURN',
        });
      }
    }

    return srData;
  },

  async updateStatus(id, status) {
    const { data, error } = await supabase
      .from(SR_TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Supplier Invoices ──────────────────────────────────────
export const supplierInvoiceService = {
  async getAll({ tenantId, businessId, status, supplierId, page = 1, limit = 50 } = {}) {
    let query = supabase
      .from(SI_TABLE)
      .select(`*, supplier:lb_suppliers(id, name)`, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .order('invoice_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (supplierId) query = query.eq('supplier_id', supplierId);

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count, page, limit };
  },

  async recordPayment(id, { amount, paymentMethod, referenceNumber, notes, createdBy }) {
    const { data: invoice, error: fetchError } = await supabase
      .from(SI_TABLE)
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const newPaid = (invoice.amount_paid || 0) + amount;
    const { data, error } = await supabase
      .from(SI_TABLE)
      .update({
        amount_paid: newPaid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ── Helper: Number Generators ──────────────────────────────
async function generatePONumber(businessId) {
  const { count } = await supabase
    .from(PO_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId);
  return `PO-${businessId.slice(0, 8).toUpperCase()}-${String((count || 0) + 1).padStart(5, '0')}`;
}

async function generateGRNNumber(businessId) {
  const { count } = await supabase
    .from(GRN_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId);
  return `GRN-${businessId.slice(0, 8).toUpperCase()}-${String((count || 0) + 1).padStart(5, '0')}`;
}

async function generateReturnNumber(businessId) {
  const { count } = await supabase
    .from(SR_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId);
  return `SR-${businessId.slice(0, 8).toUpperCase()}-${String((count || 0) + 1).padStart(5, '0')}`;
}

// ── Helper: Inventory Updates ──────────────────────────────
async function updateInventoryOnReceipt({ tenantId, businessId, branchId, productId, quantity, unitCost, batchNumber, expiryDate, referenceId, referenceType }) {
  // Get or create inventory record
  const { data: existing } = await supabase
    .from('lb_inventory')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .single();

  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvgCost = ((existing.quantity * existing.average_cost) + (quantity * unitCost)) / newQty;
    await supabase
      .from('lb_inventory')
      .update({
        quantity: newQty,
        average_cost: newAvgCost,
        last_receipt_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('lb_inventory').insert({
      tenant_id: tenantId,
      business_id: businessId,
      branch_id: branchId,
      product_id: productId,
      quantity,
      average_cost: unitCost,
      last_receipt_date: new Date().toISOString(),
    });
  }

  // Record stock movement
  await supabase.from('lb_stock_movements').insert({
    tenant_id: tenantId,
    business_id: businessId,
    branch_id: branchId,
    product_id: productId,
    movement_type: 'RECEIPT',
    quantity,
    unit_cost: unitCost,
    reference_id: referenceId,
    reference_type: referenceType,
    batch_number: batchNumber,
    expiry_date: expiryDate,
    notes: `Goods received from ${referenceType}`,
  });

  // Update product cost price if different
  await supabase
    .from('lb_products')
    .update({ cost_price: unitCost, updated_at: new Date().toISOString() })
    .eq('id', productId);
}

async function updateInventoryOnAdjustment({ tenant_id, business_id, branch_id, product_id, quantity, reason, reference_id, reference_type }) {
  const { data: existing } = await supabase
    .from('lb_inventory')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('business_id', business_id)
    .eq('branch_id', branch_id)
    .eq('product_id', product_id)
    .single();

  if (existing) {
    await supabase
      .from('lb_inventory')
      .update({
        quantity: existing.quantity + quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  }

  await supabase.from('lb_stock_movements').insert({
    tenant_id,
    business_id,
    branch_id,
    product_id,
    movement_type: 'ADJUSTMENT',
    quantity,
    reference_id,
    reference_type,
    notes: reason,
  });
}
