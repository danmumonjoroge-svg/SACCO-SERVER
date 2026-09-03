// Universal Scanning Engine — Scanner Modes & Contexts

export const SCANNER_MODES = {
  CAMERA: 'CAMERA',
  HARDWARE: 'HARDWARE',
  MANUAL: 'MANUAL',
  AUTO: 'AUTO',
};

export const SCANNER_TYPES = {
  CAMERA: 'CAMERA',
  USB: 'USB',
  BLUETOOTH: 'BLUETOOTH',
  MANUAL: 'MANUAL',
};

// Where a scan is being used — logged for audit and used to route behaviour
// (e.g. weight prompts only make sense inside SALE / RETURN contexts).
export const SCAN_CONTEXTS = {
  SALE: 'SALE',
  GRN: 'GRN',
  STOCKTAKE: 'STOCKTAKE',
  TRANSFER: 'TRANSFER',
  SALES_RETURN: 'SALES_RETURN',
  SUPPLIER_RETURN: 'SUPPLIER_RETURN',
  PRODUCT_FORM: 'PRODUCT_FORM',
};

export const SCAN_RESULTS = {
  RESOLVED: 'RESOLVED',
  NOT_FOUND: 'NOT_FOUND',
  INACTIVE: 'INACTIVE',
  ERROR: 'ERROR',
};

// Local storage key used to remember the shopkeeper's preferred scan method.
export const SCANNER_PREFERENCE_KEY = 'umova_scanner_preference';

// Default debounce window (ms) to stop the same barcode being re-added
// multiple times from a lingering camera frame or a stuck hardware trigger.
export const DEFAULT_DUPLICATE_SCAN_COOLDOWN_MS = 1200;

// Hardware (keyboard-wedge) scanner timing defaults.
export const HARDWARE_SCAN_MAX_CHAR_INTERVAL_MS = 50; // keystrokes faster than this look like a scanner, not typing
export const HARDWARE_SCAN_MIN_LENGTH = 4;
