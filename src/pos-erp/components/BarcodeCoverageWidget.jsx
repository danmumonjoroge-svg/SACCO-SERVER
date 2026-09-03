import React, { useState, useEffect } from 'react';
import { productService } from '../services/productService';

/**
 * Dashboard KPI (spec section 37) — informational only, computed from the
 * existing productService.getAll (no new query pattern, no new table).
 * Drop this into the existing dashboard page's grid; it does not touch or
 * assume anything about how that page renders its other widgets.
 *
 * <BarcodeCoverageWidget />
 */
export default function BarcodeCoverageWidget() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Pull a page large enough to cover typical MSME catalogues in one
    // request; for very large catalogues this should move server-side
    // (a COUNT query) rather than paging through everything client-side —
    // flagged here rather than silently doing something that won't scale.
    productService.getAll({ limit: 5000 })
      .then(({ data }) => {
        if (cancelled) return;
        const total = data.length;
        const withBarcode = data.filter((p) => p.barcode && p.barcode.trim() !== '').length;
        setStats({ total, withBarcode, withoutBarcode: total - withBarcode });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="bg-white rounded shadow p-4 text-sm text-gray-400">Loading barcode coverage…</div>;
  }
  if (!stats || stats.total === 0) {
    return <div className="bg-white rounded shadow p-4 text-sm text-gray-400">No products yet.</div>;
  }

  const coveragePct = ((stats.withBarcode / stats.total) * 100).toFixed(1);

  return (
    <div className="bg-white rounded shadow p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Barcode Coverage</h4>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold text-blue-600">{coveragePct}%</span>
        <span className="text-sm text-gray-500">of catalogue</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${coveragePct}%` }} />
      </div>
      <div className="flex justify-between text-sm text-gray-600">
        <span>Products: {stats.total}</span>
        <span>With barcode: {stats.withBarcode}</span>
        <span className={stats.withoutBarcode > 0 ? 'text-yellow-600' : ''}>Without: {stats.withoutBarcode}</span>
      </div>
    </div>
  );
}
