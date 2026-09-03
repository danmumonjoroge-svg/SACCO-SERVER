import React from 'react';
import { SCAN_RESULTS } from '../constants/scannerModes';

/**
 * Renders feedback for a single scan outcome (as returned by
 * useBarcodeScanner / handleScan). Text-based, not color-only, per the
 * accessibility requirement in the scanning spec.
 *
 * <ScanResult outcome={lastOutcome} onCreateProduct={...} onScanAgain={...} onManual={...} />
 */
export default function ScanResult({ outcome, onCreateProduct, onScanAgain, onManual, onDismiss }) {
  if (!outcome) return null;

  if (outcome.result === SCAN_RESULTS.RESOLVED) {
    const { product, stock, packQuantity } = outcome;
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <div className="flex items-center gap-2 text-green-800 font-semibold">
          <span>✓</span>
          <span>{product.name}</span>
        </div>
        <div className="text-sm text-green-700 mt-1 flex flex-wrap gap-x-4">
          <span>Price: {product.selling_price?.toLocaleString()}</span>
          {stock && <span>Available: {stock.quantity}</span>}
          {packQuantity > 1 && <span>Pack qty: {packQuantity}</span>}
        </div>
      </div>
    );
  }

  if (outcome.result === SCAN_RESULTS.INACTIVE) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
        <div className="font-semibold">This product is inactive.</div>
        <div className="text-sm">{outcome.product?.name} ({outcome.barcode})</div>
      </div>
    );
  }

  if (outcome.result === SCAN_RESULTS.NOT_FOUND) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="text-red-800 font-semibold flex items-center gap-2">
          <span>✕</span>
          <span>Barcode not registered</span>
        </div>
        <div className="text-sm text-red-700 mt-1 font-mono">{outcome.barcode}</div>
        <div className="flex flex-wrap gap-2 mt-3">
          {onCreateProduct && (
            <button type="button" onClick={() => onCreateProduct(outcome.barcode)}
              className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded">
              Create Product
            </button>
          )}
          {onScanAgain && (
            <button type="button" onClick={onScanAgain}
              className="bg-gray-200 text-sm px-3 py-1.5 rounded">
              Scan Again
            </button>
          )}
          {onManual && (
            <button type="button" onClick={onManual}
              className="bg-gray-200 text-sm px-3 py-1.5 rounded">
              Enter Manually
            </button>
          )}
          {onDismiss && (
            <button type="button" onClick={onDismiss}
              className="text-gray-500 text-sm px-3 py-1.5">
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ERROR / invalid barcode
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
      <div className="font-semibold flex items-center gap-2"><span>✕</span><span>Scan failed</span></div>
      <div className="text-sm">{outcome.reason === 'INVALID_BARCODE' ? 'Invalid barcode.' : 'Something went wrong. Please try again.'}</div>
    </div>
  );
}
