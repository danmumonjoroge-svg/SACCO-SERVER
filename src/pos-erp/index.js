// Universal Scanning Engine — public barrel export.
// Every module (POS, GRN, Stocktake, Products, etc.) should import scanning
// capability ONLY from here, never reach into scanning/components or
// scanning/hooks directly. Keeps the internal folder structure free to
// change without breaking callers.

export { default as BarcodeScanner } from './components/BarcodeScanner';
export { default as ScannerOverlay } from './components/ScannerOverlay';
export { default as ScanResult } from './components/ScanResult';
export { default as ScannerInput } from './components/ScannerInput';
export { default as ScannerModal } from './components/ScannerModal';
export { default as ScannerButton } from './components/ScannerButton';
export { default as ScanPermissionGate } from './components/ScanPermissionGate';

export { useBarcodeScanner } from './hooks/useBarcodeScanner';
export { useCameraScanner } from './hooks/useCameraScanner';
export { useHardwareScanner } from './hooks/useHardwareScanner';

export { resolveBarcode, checkBarcodeAvailable } from './services/productResolverService';
export { handleScan } from './services/scannerService';

export { SCAN_PERMISSIONS, can } from './utils/permissions';

export {
  SCANNER_MODES,
  SCANNER_TYPES,
  SCAN_CONTEXTS,
  SCAN_RESULTS,
  DEFAULT_DUPLICATE_SCAN_COOLDOWN_MS,
} from './constants/scannerModes';

export { BARCODE_FORMATS } from './constants/barcodeFormats';
