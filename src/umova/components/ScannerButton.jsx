import React, { useState, useContext } from 'react';
import ScannerModal from './ScannerModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { AuthContext } from '../../part1/context/authContext';

/**
 * Drop-in, self-contained scan button for pages that just need "scan a
 * barcode, get the outcome" without wiring up useBarcodeScanner themselves.
 *
 * <ScannerButton
 *   businessId={businessId}
 *   branchId={branchId}
 *   contextType="STOCKTAKE"
 *   onScan={(outcome) => ...}
 *   label="Scan Barcode"
 * />
 *
 * For POS/GRN, where you need fine control over cart/line behaviour, use
 * useBarcodeScanner + ScannerModal directly instead (see POSPage.jsx).
 */
export default function ScannerButton({ businessId, branchId, contextType, onScan, label = '📷 Scan', className = '' }) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;
  const [open, setOpen] = useState(false);

  const { processScan, lastOutcome } = useBarcodeScanner({
    tenantId,
    businessId,
    branchId,
    userId: user?.id,
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
