// Universal Scanning Engine — useBarcodeScanner
//
// The single hook every module (POS, GRN, Stocktake, Transfer, Returns,
// Products) should use to get scanning capability. It combines:
//   - hardware (USB/Bluetooth) listening
//   - manual entry
//   - product resolution + scan-event logging (via scannerService)
//
// Camera scanning is handled separately by useCameraScanner + ScannerModal,
// since it needs a <video> element; this hook exposes a `scanManual(barcode)`
// entry point that the modal calls once it has decoded a frame, so all three
// input methods funnel through the same resolution + feedback pipeline.

import { useState, useCallback, useRef } from 'react';
import { handleScan } from '../services/scannerService';
import { useHardwareScanner } from './useHardwareScanner';
import { ScanCooldown } from '../utils/scannerUtils';
import { playScanBeep, vibrateOnScan } from '../utils/scannerUtils';
import { SCANNER_TYPES, DEFAULT_DUPLICATE_SCAN_COOLDOWN_MS, SCAN_RESULTS } from '../constants/scannerModes';

/**
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.businessId
 * @param {string} [params.branchId]
 * @param {string} [params.userId]
 * @param {string} params.contextType - one of SCAN_CONTEXTS
 * @param {string} [params.contextId]
 * @param {(outcome: object) => void} params.onResolved - called for every scan outcome (found or not)
 * @param {boolean} [params.hardwareEnabled] - whether to listen for USB/Bluetooth scanner input
 */
export function useBarcodeScanner({
  tenantId,
  businessId,
  branchId,
  userId,
  contextType,
  contextId,
  onResolved,
  hardwareEnabled = true,
}) {
  const [lastOutcome, setLastOutcome] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const cooldownRef = useRef(new ScanCooldown(DEFAULT_DUPLICATE_SCAN_COOLDOWN_MS));

  const processScan = useCallback(
    async (barcode, scannerType = SCANNER_TYPES.MANUAL, { bypassCooldown = false } = {}) => {
      if (!barcode) return;
      if (!bypassCooldown && !cooldownRef.current.shouldAccept(barcode)) return;

      setIsProcessing(true);
      const outcome = await handleScan({
        tenantId,
        businessId,
        branchId,
        barcode,
        scannerType,
        contextType,
        contextId,
        userId,
      });
      setIsProcessing(false);
      setLastOutcome(outcome);
      playScanBeep(outcome.result === SCAN_RESULTS.RESOLVED);
      vibrateOnScan(outcome.result === SCAN_RESULTS.RESOLVED);
      setRecentScans((prev) => [
        { ...outcome, at: new Date().toISOString() },
        ...prev.slice(0, 19),
      ]);
      onResolved?.(outcome);
      return outcome;
    },
    [tenantId, businessId, branchId, contextType, contextId, userId, onResolved]
  );

  const scanManual = useCallback((barcode) => processScan(barcode, SCANNER_TYPES.MANUAL), [processScan]);

  const { isListening: hardwareListening } = useHardwareScanner(
    (barcode) => processScan(barcode, SCANNER_TYPES.USB),
    { enabled: hardwareEnabled }
  );

  return {
    scanManual,
    processScan,
    lastOutcome,
    isProcessing,
    recentScans,
    hardwareListening,
  };
}
