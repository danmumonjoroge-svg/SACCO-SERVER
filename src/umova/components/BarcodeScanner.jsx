import React from 'react';
import { useCameraScanner } from '../hooks/useCameraScanner';
import ScannerOverlay from './ScannerOverlay';

/**
 * Reusable camera scanning surface. Renders the live video feed + scan
 * guide. Does NOT resolve products itself — it just reports decoded
 * barcodes via onScan, so callers (usually ScannerModal) can route the
 * result through the shared resolution pipeline.
 *
 * <BarcodeScanner onScan={(result) => ...} active={true} />
 */
export default function BarcodeScanner({ onScan, active = true, className = '' }) {
  const { videoRef, status, errorMessage } = useCameraScanner({ onScan, active });

  return (
    <div className={`relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden ${className}`}>
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      {status === 'active' && <ScannerOverlay status={status} />}
      {status === 'requesting' && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/60">
          Requesting camera access...
        </div>
      )}
      {(status === 'denied' || status === 'unavailable') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 p-4 text-center gap-2">
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
