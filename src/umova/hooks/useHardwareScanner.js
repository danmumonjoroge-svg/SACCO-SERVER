// Universal Scanning Engine — Hardware Scanner Hook
//
// USB and Bluetooth barcode scanners behave like a very fast keyboard: they
// "type" the barcode digits and then send an ENTER (or a configurable
// suffix key). This hook listens globally for that pattern and distinguishes
// it from normal human typing, without interfering with regular input
// fields (search boxes, forms, etc).

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  HARDWARE_SCAN_MAX_CHAR_INTERVAL_MS,
  HARDWARE_SCAN_MIN_LENGTH,
} from '../constants/scannerModes';
import { normalizeBarcode } from '../utils/barcodeUtils';

/**
 * @param {(barcode: string) => void} onScan
 * @param {object} options
 * @param {boolean} options.enabled - allows callers to disable listening
 * @param {number} options.maxCharIntervalMs - keystrokes faster than this are considered scanner input
 * @param {number} options.minLength - minimum characters before ENTER to count as a scan
 * @param {string} options.terminator - key that ends a scan (default 'Enter')
 */
export function useHardwareScanner(onScan, options = {}) {
  const {
    enabled = true,
    maxCharIntervalMs = HARDWARE_SCAN_MAX_CHAR_INTERVAL_MS,
    minLength = HARDWARE_SCAN_MIN_LENGTH,
    terminator = 'Enter',
  } = options;

  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const [isListening, setIsListening] = useState(false);

  const handleKeyDown = useCallback(
    (e) => {
      // Never hijack input while the user is typing in a normal field
      // (search boxes, forms, textareas) — only listen when focus is on the
      // document body / a non-editable element, or when explicitly enabled
      // via a scanner-aware input (see ScannerInput.jsx which forwards here).
      const target = e.target;
      const isEditable =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditable && !target.dataset?.scannerAware) return;

      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === terminator) {
        const candidate = normalizeBarcode(bufferRef.current);
        bufferRef.current = '';
        if (candidate.length >= minLength) {
          onScan?.(candidate);
        }
        return;
      }

      // A human typing normally leaves gaps well above the scanner threshold.
      // If the gap is too large, this keystroke starts a fresh buffer.
      if (gap > maxCharIntervalMs * 4 || bufferRef.current.length === 0) {
        bufferRef.current = '';
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    },
    [onScan, maxCharIntervalMs, minLength, terminator]
  );

  useEffect(() => {
    if (!enabled) {
      setIsListening(false);
      return;
    }
    window.addEventListener('keydown', handleKeyDown, true);
    setIsListening(true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      bufferRef.current = '';
    };
  }, [enabled, handleKeyDown]);

  return { isListening };
}
