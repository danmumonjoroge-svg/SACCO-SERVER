import React, { useEffect, useState, useCallback } from "react";
import { Layers, Loader2, Save, AlertCircle, Plus, Trash2, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient"; // <-- adjust to your project's Supabase client path
import "./LoanApplications.css";

// =============================================================================
// LoanTypesManager — lets chama officials define multiple loan products for
// their chama (e.g. "Emergency Loan", "School Fees Loan", "Development Loan"),
// each with its own rate, term limits, and processing charges.
//
// Writes to public.chama_loan_types. See chama_loan_applications_schema.sql
// for the table definition and the officials-only RLS policy on it.
// =============================================================================

const LOAN_TYPES_TABLE = "chama_loan_types";
const MEMBERS_TABLE = "chama_members";
const OFFICIAL_ROLES = ["chairperson", "treasurer", "secretary", "welfare_officer"];

const emptyType = () => ({
  id: null, // null = not yet saved
  name: "",
  description: "",
  interest_rate: 10,
  interest_type: "flat_monthly",
  processing_fee_percent: 0,
  processing_fee_flat: 0,
  min_amount: "",
  max_amount: "",
  min_repayment_months: "",
  max_repayment_months: "",
  savings_based: true,
  savings_multiplier: "",
  active: true,
});

export default function LoanTypesManager({ chamaId }) {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isOfficial, setIsOfficial] = useState(false);

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null); // "new" while creating, or a type's id while editing
  const [toast, setToast] = useState(null);

  const checkAccess = useCallback(async (id) => {
    setCheckingAccess(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) { setIsOfficial(false); return; }
      const { data, error: memberErr } = await supabase
        .from(MEMBERS_TABLE)
        .select("status, role")
        .eq("chama_id", id)
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (memberErr) throw memberErr;
      setIsOfficial(!!data && data.status === "active" && OFFICIAL_ROLES.includes(data.role));
    } catch (err) {
      console.error("[LoanTypesManager] Failed to check official status:", err);
      setIsOfficial(false);
    } finally {
      setCheckingAccess(false);
    }
  }, []);

  const load = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from(LOAN_TYPES_TABLE)
        .select("*")
        .eq("chama_id", id)
        .order("created_at", { ascending: true });
      if (fetchErr) throw fetchErr;
      setTypes(
        (data || []).map((t) => ({
          ...t,
          min_amount: t.min_amount ?? "",
          max_amount: t.max_amount ?? "",
          min_repayment_months: t.min_repayment_months ?? "",
          max_repayment_months: t.max_repayment_months ?? "",
          savings_multiplier: t.savings_multiplier ?? "",
        }))
      );
    } catch (err) {
      setError(err.message || "Failed to load loan types");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (chamaId) {
      load(chamaId);
      checkAccess(chamaId);
    }
  }, [chamaId, load, checkAccess]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const addBlankRow = () => setTypes((t) => [...t, emptyType()]);

  const updateRow = (index, field, value) =>
    setTypes((t) => t.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const removeRow = async (index) => {
    const row = types[index];
    if (!row.id) {
      setTypes((t) => t.filter((_, i) => i !== index));
      return;
    }
    if (!window.confirm(`Deactivate "${row.name}"? Existing applications keep their recorded terms; this only stops it from being offered for new ones.`)) return;
    try {
      const { error: updateErr } = await supabase.from(LOAN_TYPES_TABLE).update({ active: false }).eq("id", row.id);
      if (updateErr) throw updateErr;
      setTypes((t) => t.map((r, i) => (i === index ? { ...r, active: false } : r)));
      showToast("Loan type deactivated");
    } catch (err) {
      showToast(`Could not deactivate: ${err.message}`, "error");
    }
  };

  const saveRow = async (index) => {
    const row = types[index];
    if (!row.name.trim()) {
      showToast("Give this loan type a name first", "error");
      return;
    }
    setSavingId(row.id || "new");
    try {
      const payload = {
        chama_id: chamaId,
        name: row.name.trim(),
        description: row.description?.trim() || null,
        interest_rate: Number(row.interest_rate) || 0,
        interest_type: row.interest_type,
        processing_fee_percent: Number(row.processing_fee_percent) || 0,
        processing_fee_flat: Number(row.processing_fee_flat) || 0,
        min_amount: row.min_amount === "" ? null : Number(row.min_amount),
        max_amount: row.max_amount === "" ? null : Number(row.max_amount),
        min_repayment_months: row.min_repayment_months === "" ? null : Number(row.min_repayment_months),
        max_repayment_months: row.max_repayment_months === "" ? null : Number(row.max_repayment_months),
        savings_based: !!row.savings_based,
        savings_multiplier: row.savings_multiplier === "" ? null : Number(row.savings_multiplier),
        active: row.active,
        updated_at: new Date().toISOString(),
      };

      if (row.id) {
        const { error: updateErr } = await supabase.from(LOAN_TYPES_TABLE).update(payload).eq("id", row.id);
        if (updateErr) throw updateErr;
      } else {
        const { data, error: insertErr } = await supabase.from(LOAN_TYPES_TABLE).insert([payload]).select().single();
        if (insertErr) throw insertErr;
        setTypes((t) => t.map((r, i) => (i === index ? { ...r, id: data.id } : r)));
      }
      showToast("Loan type saved");
    } catch (err) {
      showToast(`Could not save: ${err.message}`, "error");
    } finally {
      setSavingId(null);
    }
  };

  if (checkingAccess || loading) {
    return <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading loan types...</p></div>;
  }

  if (!isOfficial) {
    return (
      <div className="loan-rules-form">
        <div className="empty-state error">
          <AlertCircle size={24} />
          <p>Only chama officials (chairperson, treasurer, secretary, or welfare officer) can manage loan types.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="loan-rules-form">
      <h2><Layers size={20} /> Loan Types</h2>
      <p className="rules-intro">
        Define the loan products this chama offers — each can carry its own rate, term limits,
        and processing charges. Members pick one of these when applying; it pre-fills the terms.
      </p>

      {error && <p className="field-error"><AlertCircle size={12} /> {error}</p>}

      <div className="loan-types-list">
        {types.length === 0 && (
          <p className="rules-intro" style={{ margin: "0 0 12px" }}>No loan types yet — add one below.</p>
        )}

        {types.map((row, index) => (
          <div className="loan-type-card" key={row.id || `new-${index}`}>
            <div className="rules-row">
              <label style={{ gridColumn: "1 / -1" }}>
                Name
                <input placeholder="e.g. Emergency Loan" value={row.name} onChange={(e) => updateRow(index, "name", e.target.value)} />
              </label>
            </div>

            <div className="rules-row">
              <label style={{ gridColumn: "1 / -1" }}>
                Description (shown to members on the application form)
                <input placeholder="e.g. Fast-track loan for urgent needs, capped lower, approved quickly" value={row.description || ""} onChange={(e) => updateRow(index, "description", e.target.value)} />
              </label>
            </div>

            <div className="rules-row">
              <label>
                Interest rate (%)
                <input type="number" min="0" step="0.5" value={row.interest_rate} onChange={(e) => updateRow(index, "interest_rate", e.target.value)} />
              </label>
              <label>
                Interest type
                <select value={row.interest_type} onChange={(e) => updateRow(index, "interest_type", e.target.value)}>
                  <option value="flat_monthly">Flat rate, per month</option>
                  <option value="reducing_annual">Reducing balance, annual</option>
                </select>
              </label>
              <label>
                Processing fee (% of principal)
                <input type="number" min="0" step="0.5" value={row.processing_fee_percent} onChange={(e) => updateRow(index, "processing_fee_percent", e.target.value)} />
              </label>
              <label>
                Processing fee (flat KES)
                <input type="number" min="0" value={row.processing_fee_flat} onChange={(e) => updateRow(index, "processing_fee_flat", e.target.value)} />
              </label>
            </div>

            <div className="rules-row">
              <label>
                Minimum amount (KES)
                <input type="number" min="0" placeholder="No minimum" value={row.min_amount} onChange={(e) => updateRow(index, "min_amount", e.target.value)} />
              </label>
              <label>
                Maximum amount (KES)
                <input type="number" min="0" placeholder="No maximum" value={row.max_amount} onChange={(e) => updateRow(index, "max_amount", e.target.value)} />
              </label>
              <label>
                Min repayment (months)
                <input type="number" min="1" placeholder="No minimum" value={row.min_repayment_months} onChange={(e) => updateRow(index, "min_repayment_months", e.target.value)} />
              </label>
              <label>
                Max repayment (months)
                <input type="number" min="1" placeholder="No maximum" value={row.max_repayment_months} onChange={(e) => updateRow(index, "max_repayment_months", e.target.value)} />
              </label>
            </div>

            <div className="toggle-row">
              <input type="checkbox" checked={!!row.savings_based} onChange={(e) => updateRow(index, "savings_based", e.target.checked)} />
              Eligibility based on savings multiplier
            </div>
            {row.savings_based && (
              <div className="rules-row">
                <label>
                  Savings multiplier override (blank = use chama default)
                  <input type="number" min="0" step="0.5" placeholder="Chama default" value={row.savings_multiplier} onChange={(e) => updateRow(index, "savings_multiplier", e.target.value)} />
                </label>
              </div>
            )}

            <div className="rules-form-actions">
              {row.id && !row.active && <span className="field-warning">Inactive — hidden from new applications</span>}
              <button type="button" className="cancel-btn" onClick={() => removeRow(index)}>
                <Trash2 size={14} style={{ marginRight: 4, verticalAlign: "-2px" }} /> {row.id ? "Deactivate" : "Remove"}
              </button>
              <button type="button" className="save-btn" onClick={() => saveRow(index)} disabled={savingId === (row.id || "new")}>
                {savingId === (row.id || "new") ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                {savingId === (row.id || "new") ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="add-guarantor-btn" onClick={addBlankRow} style={{ marginTop: 12 }}>
        <Plus size={14} /> Add loan type
      </button>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}