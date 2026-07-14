import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import { Landmark, PlusCircle, Lock, Loader2, Power } from "lucide-react";
import "./ChamaBankAccounts.css";

// -----------------------------------------------------------------------------
// ChamaBankAccounts
// Officials configure the chama's real accounts here (e.g. "CIC Chama
// Account", "Equity - Main", "Till 123456"). These are what members pick
// from in MemberContributionForm and what the treasurer pays out of in
// LoanDisbursementDesk — one shared source of truth, per chama (multi-tenant
// safe: every row is scoped by chama_id).
// -----------------------------------------------------------------------------

const emptyForm = { account_name: "", account_type: "bank", account_number: "", provider: "", opening_balance: "" };

export default function ChamaBankAccounts({ chamaId: chamaIdProp }) {
  const { chama, hasRole } = useChama();
  const chamaId = chamaIdProp || chama?.id;
  const canManage = hasRole(["treasurer", "chairperson", "admin"]);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    const { data } = await supabase.from("chama_bank_accounts").select("*").eq("chama_id", chamaId).order("created_at", { ascending: true });
    setAccounts(data || []);
    setLoading(false);
  }, [chamaId]);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.account_name.trim()) return;
    setSaving(true);
    await supabase.from("chama_bank_accounts").insert([{
      chama_id: chamaId,
      account_name: form.account_name,
      account_type: form.account_type,
      account_number: form.account_number || null,
      provider: form.provider || null,
      opening_balance: Number(form.opening_balance) || 0,
      is_active: true,
    }]);
    setSaving(false);
    setForm(emptyForm);
    setFormOpen(false);
    load();
  };

  const toggleActive = async (acc) => {
    await supabase.from("chama_bank_accounts").update({ is_active: !acc.is_active }).eq("id", acc.id);
    load();
  };

  if (!canManage) {
    return (
      <div className="cba-locked"><Lock size={18} /><p>Only the treasurer and chairperson can manage chama accounts.</p></div>
    );
  }

  return (
    <div className="cba-page">
      <div className="cba-header">
        <div>
          <span className="cba-icon"><Landmark size={16} /></span>
          <div>
            <h2>Chama Accounts</h2>
            <p>The real bank / M-Pesa / SACCO accounts members pay into.</p>
          </div>
        </div>
        <button className="cba-add-btn" onClick={() => setFormOpen((v) => !v)}><PlusCircle size={15} /> Add account</button>
      </div>

      {formOpen && (
        <form className="cba-form" onSubmit={save}>
          <div className="cba-form-grid">
            <label>
              Account name
              <input value={form.account_name} onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))} placeholder="e.g. CIC Chama Account" required />
            </label>
            <label>
              Type
              <select value={form.account_type} onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))}>
                <option value="bank">Bank</option>
                <option value="mpesa">M-Pesa</option>
                <option value="sacco">SACCO</option>
                <option value="cash_till">Cash till</option>
              </select>
            </label>
            <label>
              Provider
              <input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="e.g. CIC, Equity, Safaricom" />
            </label>
            <label>
              Account / till number
              <input value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} />
            </label>
            <label>
              Opening balance
              <input type="number" min="0" value={form.opening_balance} onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))} />
            </label>
          </div>
          <div className="cba-form-actions">
            <button type="button" className="cba-cancel" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" className="cba-submit" disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : "Save account"}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="cba-loading"><Loader2 size={18} className="spin" /></div>
      ) : accounts.length === 0 ? (
        <p className="cba-empty">No accounts configured yet.</p>
      ) : (
        <div className="cba-list">
          {accounts.map((a) => (
            <div className={`cba-row ${!a.is_active ? "inactive" : ""}`} key={a.id}>
              <div>
                <strong>{a.account_name}</strong>
                <span>{a.provider} {a.account_number ? `· ${a.account_number}` : ""} · {a.account_type}</span>
              </div>
              <button className="cba-toggle" onClick={() => toggleActive(a)}>
                <Power size={13} /> {a.is_active ? "Active" : "Disabled"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
