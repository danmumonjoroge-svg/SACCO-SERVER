// Universal Scanning Engine — Barcode Utilities
// Pure functions only. No supabase/network access here.

/**
 * Strip whitespace/control characters that keyboard-wedge scanners sometimes
 * inject, and upper-case CODE-39 style alpha barcodes for consistent lookups.
 */
export function normalizeBarcode(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().replace(/[\r\n\t]/g, '');
}

/**
 * Basic sanity check — real barcodes are numeric/alnum and within a sane
 * length range. This is intentionally permissive: MSMEs use everything from
 * short internal CODE-39 labels to long GS1 strings.
 */
export function isValidBarcode(value) {
  const v = normalizeBarcode(value);
  if (!v) return false;
  if (v.length < 3 || v.length > 48) return false;
  return /^[A-Za-z0-9\-_.]+$/.test(v);
}

/**
 * Checksum validation for EAN-13 (also covers UPC-A when treated as a
 * zero-padded EAN-13). Used only to give a quick "looks right" signal —
 * never used to block a scan outright, since MSME barcode printers are not
 * always perfectly compliant.
 */
export function isValidEan13(value) {
  const v = normalizeBarcode(value);
  if (!/^\d{13}$/.test(v)) return false;
  const digits = v.split('').map(Number);
  const checksum = digits.slice(0, 12).reduce(
    (sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3),
    0
  );
  const check = (10 - (checksum % 10)) % 10;
  return check === digits[12];
}

/**
 * Very rough guess at barcode format from shape alone. This is a fallback
 * used when the underlying reader (native BarcodeDetector, hardware
 * keyboard-wedge) doesn't report a format itself.
 */
export function guessBarcodeFormat(value) {
  const v = normalizeBarcode(value);
  if (/^\d{13}$/.test(v)) return 'EAN-13';
  if (/^\d{12}$/.test(v)) return 'UPC-A';
  if (/^\d{8}$/.test(v)) return 'EAN-8';
  if (/^\d{6,8}$/.test(v)) return 'UPC-E';
  if (/^[A-Z0-9\-. $/+%]+$/.test(v) && v.length <= 24) return 'CODE-39';
  return 'CODE-128';
}

/**
 * Builds a consistent scan-result payload shape used across camera scans,
 * hardware scans, and manual entry, so downstream consumers never need to
 * special-case the source.
 */
export function buildScanPayload({ barcode, format, scannerType }) {
  return {
    barcode: normalizeBarcode(barcode),
    format: format || guessBarcodeFormat(barcode),
    scannerType: scannerType || 'MANUAL',
    scannedAt: new Date().toISOString(),
  };
}
