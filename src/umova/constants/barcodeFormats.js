// Universal Scanning Engine — Barcode Formats
// Central list of barcode/QR formats the engine understands. Not every camera
// or hardware scanner will support every format — the scanner service reports
// back whatever the underlying reader (BarcodeDetector API, ZXing, or hardware
// keyboard-wedge input) actually detected.

export const BARCODE_FORMATS = {
  EAN_13: 'EAN-13',
  EAN_8: 'EAN-8',
  UPC_A: 'UPC-A',
  UPC_E: 'UPC-E',
  CODE_128: 'CODE-128',
  CODE_39: 'CODE-39',
  ITF: 'ITF',
  QR: 'QR',
  UNKNOWN: 'UNKNOWN',
};

// Maps this app's format names to the native BarcodeDetector API format
// strings (https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API)
export const NATIVE_DETECTOR_FORMAT_MAP = {
  'ean_13': BARCODE_FORMATS.EAN_13,
  'ean_8': BARCODE_FORMATS.EAN_8,
  'upc_a': BARCODE_FORMATS.UPC_A,
  'upc_e': BARCODE_FORMATS.UPC_E,
  'code_128': BARCODE_FORMATS.CODE_128,
  'code_39': BARCODE_FORMATS.CODE_39,
  'itf': BARCODE_FORMATS.ITF,
  'qr_code': BARCODE_FORMATS.QR,
};

// Formats requested from the native BarcodeDetector when it's available.
export const SUPPORTED_DETECTOR_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code',
];
