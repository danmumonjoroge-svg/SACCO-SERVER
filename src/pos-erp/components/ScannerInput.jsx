import React, { useState } from 'react';

/**
 * Manual barcode entry field. Marked `data-scanner-aware` so the global
 * useHardwareScanner listener still recognises rapid keyboard-wedge input
 * even while this field has focus (USB/Bluetooth scanners often "click"
 * into whatever input is focused before typing).
 *
 * <ScannerInput onSubmit={(barcode) => ...} placeholder="Enter barcode" />
 */
export default function ScannerInput({ onSubmit, placeholder = 'Enter barcode manually', autoFocus = false, className = '' }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit?.(v);
    setValue('');
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        data-scanner-aware="true"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        className="flex-1 border rounded px-3 py-2"
      />
      <button type="button" onClick={submit} className="bg-gray-800 text-white px-4 rounded">
        Go
      </button>
    </div>
  );
}
