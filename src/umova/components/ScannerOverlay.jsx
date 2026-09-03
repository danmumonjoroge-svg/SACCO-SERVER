import React from 'react';

/** Purely visual scan-area guide drawn over the camera preview. */
export default function ScannerOverlay({ status }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={`w-4/5 max-w-xs aspect-[3/2] border-4 rounded-lg transition-colors ${
          status === 'active' ? 'border-green-400' : 'border-white/60'
        }`}
        style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
      >
        <div className="w-full h-0.5 bg-red-500/80 mt-1/2 animate-pulse" />
      </div>
    </div>
  );
}
