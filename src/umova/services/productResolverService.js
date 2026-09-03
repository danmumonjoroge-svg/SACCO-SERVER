// Universal Scanning Engine — Product Resolver
//
// This is the ONLY place in the app that turns a scanned barcode into a
// product. POS, GRN, Stocktake, Transfers and Returns all call this service
// instead of querying lb_products directly, so tenant/business isolation and
// "what counts as a usable product" logic live in exactly one place.
//
// Scanning identifies a product. It never touches inventory.

import { supabase } from '../../supabaseClient';
import { normalizeBarcode, isValidBarcode } from '../utils/barcodeUtils';

const PRODUCT_FIELDS =
  'id, name, sku, barcode, description, category_id, unit_id, cost_price, selling_price, wholesale_price, selling_mode, track_inventory, allow_negative_stock, status, unit:lb_product_units(id, name, abbreviation)';

/**
 * Resolve a scanned barcode to a product, strictly scoped to the current
 * tenant + business. Never queries across tenant/business boundaries.
 *
 * @returns {Promise<{found: boolean, product?: object, barcode: string, reason?: string}>}
 */
export async function resolveBarcode({ tenantId, businessId, barcode }) {
  const normalized = normalizeBarcode(barcode);

  if (!tenantId || !businessId) {
    throw new Error('resolveBarcode requires both tenantId and businessId');
  }

  if (!isValidBarcode(normalized)) {
    return { found: false, barcode: normalized, reason: 'INVALID_BARCODE' };
  }

  // 1. Try the primary product barcode field (lb_products.barcode).
  let { data, error } = await supabase
    .from('lb_products')
    .select(PRODUCT_FIELDS)
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)
    .eq('barcode', normalized)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  // 2. Fall back to the optional multi-barcode mapping table, if present,
  //    for packaging/carton/supplier barcodes (see lb_product_barcodes).
  if (!data) {
    const mapped = await resolveViaBarcodeMap({ tenantId, businessId, barcode: normalized });
    if (mapped) {
      return {
        found: true,
        product: mapped.product,
        barcode: normalized,
        packQuantity: mapped.packQuantity,
        barcodeType: mapped.barcodeType,
      };
    }
  }

  if (!data) {
    return { found: false, barcode: normalized };
  }

  if (data.status && data.status !== 'ACTIVE') {
    return { found: true, product: data, barcode: normalized, reason: 'INACTIVE' };
  }

  return { found: true, product: data, barcode: normalized, packQuantity: 1, barcodeType: 'UNIT' };
}

/**
 * Looks up lb_product_barcodes for carton/pack/alternative barcodes.
 * Fails soft (returns null) if the table doesn't exist yet in this
 * environment's schema — multi-barcode support is optional/Phase 2.
 */
async function resolveViaBarcodeMap({ tenantId, businessId, barcode }) {
  try {
    const { data, error } = await supabase
      .from('lb_product_barcodes')
      .select(
        `barcode, barcode_type, pack_quantity, is_primary, status, product:lb_products(${PRODUCT_FIELDS})`
      )
      .eq('tenant_id', tenantId)
      .eq('business_id', businessId)
      .eq('barcode', barcode)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.product) return null;
    return {
      product: data.product,
      packQuantity: data.pack_quantity || 1,
      barcodeType: data.barcode_type || 'UNIT',
    };
  } catch (e) {
    return null;
  }
}

/**
 * Duplicate barcode guard used by the Products form before create/update.
 * NULL/blank barcodes are always allowed (many MSME products have none).
 */
export async function checkBarcodeAvailable({ tenantId, businessId, barcode, excludeProductId }) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return { available: true };

  let query = supabase
    .from('lb_products')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)
    .eq('barcode', normalized)
    .neq('status', 'INACTIVE');

  if (excludeProductId) query = query.neq('id', excludeProductId);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;

  if (data) {
    return { available: false, conflictingProduct: data };
  }
  return { available: true };
}
