import React, { useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { ScannerModal, useBarcodeScanner } from '../index';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export default function ProductsPage() {
  const { staffId } = usePosErpAuth();
  const { products, loading, create, update, remove } = useProducts();
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', barcode: '', selling_price: '', cost_price: '', category_id: '', unit_id: '', selling_mode: 'PER_UNIT', track_inventory: true });
  const [formError, setFormError] = useState('');

  // On the product form, scanning a barcode that ISN'T registered yet is the
  // normal/expected outcome — it just fills the field. If it happens to
  // match an existing active product, warn instead of silently overwriting.
  const { processScan, lastOutcome } = useBarcodeScanner({
    contextType: 'PRODUCT_FORM',
    userId: staffId,
    onResolved: (outcome) => {
      if (outcome.barcode) setForm((f) => ({ ...f, barcode: outcome.barcode }));
      if (outcome.result === 'RESOLVED') return; // handled inline via lastOutcome warning below
      setShowScanner(false);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      await create({ ...form, selling_price: parseFloat(form.selling_price), cost_price: parseFloat(form.cost_price) || 0 });
      setShowForm(false); setForm({ name: '', sku: '', barcode: '', selling_price: '', cost_price: '', category_id: '', unit_id: '', selling_mode: 'PER_UNIT', track_inventory: true });
    } catch (err) {
      setFormError(err.message);
    }
  };


  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded">{showForm ? 'Cancel' : '+ Product'}</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {formError && <div className="md:col-span-3 bg-red-50 text-red-700 text-sm rounded px-3 py-2">{formError}</div>}
          <input required placeholder="Product Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="border rounded px-3 py-2" />
          <input placeholder="SKU" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} className="border rounded px-3 py-2" />
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input placeholder="Barcode" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} className="border rounded px-3 py-2 flex-1" />
              <button type="button" onClick={() => setShowScanner(true)} className="bg-gray-800 text-white px-3 rounded">📷</button>
            </div>
            <span className="text-xs text-gray-400">{form.barcode ? '✓ Barcode set' : '⚠ No barcode'}</span>
          </div>
          <input required type="number" placeholder="Selling Price" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} className="border rounded px-3 py-2" />
          <input type="number" placeholder="Cost Price" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})} className="border rounded px-3 py-2" />
          <select value={form.selling_mode} onChange={e => setForm({...form, selling_mode: e.target.value})} className="border rounded px-3 py-2">
            <option value="PER_UNIT">Per Unit</option><option value="WEIGHT">By Weight</option><option value="VOLUME">By Volume</option>
          </select>
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded md:col-span-3">Save</button>
        </form>
      )}

      <ScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        scan={processScan}
        lastOutcome={lastOutcome}
        title="Scan Barcode"
        onAccept={() => setShowScanner(false)}
      />
      {loading ? <div className="text-center py-10">Loading...</div> : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50"><tr><th className="px-4 py-2">Name</th><th>SKU</th><th>Barcode</th><th>Price</th><th>Mode</th><th>Actions</th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.name}</td><td>{p.sku || '-'}</td>
                  <td>{p.barcode ? <span title="Registered">✓ {p.barcode}</span> : <span className="text-yellow-600" title="No barcode">⚠ none</span>}</td>
                  <td>{p.selling_price?.toLocaleString()}</td><td>{p.selling_mode}</td>
                  <td className="flex gap-2 py-2"><button onClick={() => remove(p.id)} className="text-red-600 text-sm">Delete</button></td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No products</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
