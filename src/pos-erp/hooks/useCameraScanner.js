// Universal Scanning Engine — Camera Scanner Hook
//
// Manages camera lifecycle (permission, stream, decoder) for a <video>
// element ref. Always stops the camera on unmount/close — never leaves it
// running in the background.

import { useRef, useState, useCallback, useEffect } from 'react';
import { createVideoDecoder, startCameraStream, stopMediaStream } from '../services/barcodeService';
import { ScanCooldown } from '../utils/scannerUtils';
import { DEFAULT_DUPLICATE_SCAN_COOLDOWN_MS } from '../constants/scannerModes';

export function useCameraScanner({ onScan, cooldownMs = DEFAULT_DUPLICATE_SCAN_COOLDOWN_MS, active = false } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const decoderRef = useRef(null);
  const cooldownRef = useRef(new ScanCooldown(cooldownMs));
  const [status, setStatus] = useState('idle'); // idle | requesting | active | denied | unavailable | error
  const [errorMessage, setErrorMessage] = useState(null);

  const stop = useCallback(() => {
    decoderRef.current?.stop();
    decoderRef.current = null;
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    }
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setStatus('requesting');
    setErrorMessage(null);
    try {
      const stream = await startCameraStream();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const decoder = await createVideoDecoder(videoRef.current);
      decoderRef.current = decoder;
      decoder.start(
        (result) => {
          if (!cooldownRef.current.shouldAccept(result.barcode)) return;
          onScan?.(result);
        },
        (err) => {
          // Per-frame decode misses are normal and not surfaced as errors.
        }
      );
      setStatus('active');
    } catch (err) {
      if (err.message === 'PERMISSION_DENIED') {
        setStatus('denied');
        setErrorMessage('Camera permission was denied. Please enable camera access or use another scanner.');
      } else {
        setStatus('unavailable');
        setErrorMessage('Camera is unavailable.');
      }
    }
  }, [onScan]);

  useEffect(() => {
    if (active) start();
    else stop();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { videoRef, status, errorMessage, start, stop };
}
