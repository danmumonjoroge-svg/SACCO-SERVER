import React, { useState } from 'react';
import ScannerModal from './ScannerModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { usePosErpAuth } from '../auth/usePosErpAuth';

/**
 * Drop-in, self-contained scan button for pages that just need "scan a
 * barcode, get the outcome" without wiring up useBarcodeScanner themselves.
 *
 * <ScannerButton
 *   contextType="STOCKTAKE"
 *   onScan={(outcome) => ...}
 *   label="Scan Barcode"
 * />
 *
 * For POS/GRN, where you need fine control over cart/line behaviour, use
 * useBarcodeScanner + ScannerModal directly instead (see POSPage.jsx).
 */
export default function ScannerButton({ contextType, onScan, label = '📷 Scan', className = '' }) {
  const { staffId } = usePosErpAuth();
  const [open, setOpen] = useState(false);

  const { processScan, lastOutcome } = useBarcodeScanner({
    userId: staffId,
    contextType,
    onResolved: (outcome) => {
      onScan?.(outcome);
    },
    hardwareEnabled: false, // standalone button only listens while its modal is open
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold text-base ${className}`}
      >
        {label}
      </button>
      <ScannerModal
        open={open}
        onClose={() => setOpen(false)}
        scan={processScan}
        lastOutcome={lastOutcome}
        title={label.replace('📷', '').trim() || 'Scan Product'}
      />
    </>
  );
}
