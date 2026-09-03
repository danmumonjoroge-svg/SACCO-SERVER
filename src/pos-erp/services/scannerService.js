// Universal Scanning Engine — Scanner Service
//
// Sits between the raw scan (camera/hardware/manual) and the business
// transaction. Responsible for:
//   - resolving the barcode to a product (via productResolverService)
//   - attaching current stock info for display (read-only)
//   - classifying the outcome (RESOLVED / NOT_FOUND / INACTIVE / ERROR)
//   - optional lightweight scan-event audit logging
//
// It NEVER writes to lb_inventory or lb_stock_movements. That responsibility
// belongs to the existing sale/GRN/inventory services — see saleService.js,
// purchaseService.js and inventoryService.js.
//
// Adapted: tenant_id/business_id/branch_id stripped throughout — this app
// is single-org, single-location (see usePosErpAuth.js). lb_inventory is
// keyed by product_id alone here, matching saleService.js/inventoryService.js.

import { supabase } from '../../supabaseClient';
import { resolveBarcode } from './productResolverService';
import { SCAN_RESULTS } from '../constants/scannerModes';

/**
 * Full scan handling pipeline used by every module (POS, GRN, stocktake,
 * transfer, returns). Returns a consistent shape regardless of outcome.
 */
export async function handleScan({ barcode, scannerType, contextType, contextId, userId }) {
  let outcome;
  try {
    const resolution = await resolveBarcode({ barcode });
    if (!resolution.found) {
      outcome = { result: SCAN_RESULTS.NOT_FOUND, barcode: resolution.barcode };
    } else if (resolution.reason === 'INACTIVE') {
      outcome = { result: SCAN_RESULTS.INACTIVE, barcode: resolution.barcode, product: resolution.product };
    } else {
      let stock = null;
      if (resolution.product.track_inventory) {
        stock = await getAvailableStock({ productId: resolution.product.id });
      }
      outcome = {
        result: SCAN_RESULTS.RESOLVED,
        barcode: resolution.barcode,
        product: resolution.product,
        packQuantity: resolution.packQuantity || 1,
        stock,
      };
    }
  } catch (err) {
    outcome = { result: SCAN_RESULTS.ERROR, barcode, error: err.message };
  }

  // Fire-and-forget audit log; never let logging failures block the scan.
  logScanEvent({ userId, barcode, scannerType, contextType, contextId, outcome }).catch(() => {});
  return outcome;
}

/** Read-only stock lookup for scan-time display. Never used for final posting. */
async function getAvailableStock({ productId }) {
  const { data, error } = await supabase
    .from('lb_inventory')
    .select('quantity, average_cost')
    .eq('product_id', productId)
    .maybeSingle();
  if (error) return null;
  return data ? { quantity: data.quantity, averageCost: data.average_cost } : { quantity: 0, averageCost: 0 };
}

/**
 * Optional lightweight audit trail of scan events. Only stores barcode
 * metadata — never camera frames/images. Fails silently if the
 * lb_scanner_events table hasn't been migrated in yet, so this feature
 * degrades gracefully in older environments.
 */
async function logScanEvent({ userId, barcode, scannerType, contextType, contextId, outcome }) {
  try {
    await supabase.from('lb_scanner_events').insert({
      user_id: userId || null,
      barcode,
      format: outcome?.format || null,
      scanner_type: scannerType || 'MANUAL',
      context_type: contextType || null,
      context_id: contextId || null,
      result: outcome?.result || 'ERROR',
    });
  } catch (e) {
    // Table may not exist yet, or RLS may reject — this is best-effort only.
  }
}
