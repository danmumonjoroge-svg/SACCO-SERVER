import React, { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Loader2, Save, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient"; // <-- adjust to your project's Supabase client path
import "./LoanApplications.css";

// =============================================================================
// LoanRulesForm — lets a chama define its own sacco-style borrowing rules.
// Writes to public.chama_loan_rules (one row per chama_id, upserted).
// See chama_loan_applications_schema.sql for the table definition.
// =============================================================================

const RULES_TABLE = "chama_loan_rules";
const MEMBERS_TABLE = "chama_members";
const OFFICIAL_ROLES = ["chairperson", "treasurer", "secretary", "welfare_officer"];
const MIN_REQUIRED_APPROVALS = 3;

const DEFAULTS = {
  savings_multiplier: 3,
  max_loan_amount: "",
  min_membership_months: 0,
  requires_guarantors: true,
  min_guarantors: 1,
  guarantor_coverage_percent: 100,
  requires_security: false,
  security_instructions: "",
  default_interest_rate: 10,
  default_interest_type: "flat_monthly",
  required_approvals: MIN_REQUIRED_APPROVALS,
};

export default function LoanRulesForm({ chamaId, onSaved }) {
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Officials-only gate: this screen edits the borrowing rules for the whole
  // chama, so only chairperson/treasurer/secretary/welfare_officer can see
  // or save it. Anyone else gets a clear "not authorized" state instead of a
  // form that would silently fail to save (RLS also blocks the write at the
  // DB level — see chama_loan_applications_schema.sql section 4 — this is
  // just the matching UI-level check).
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isOfficial, setIsOfficial] = useState(false);
  const [officialName, setOfficialName] = useState(null);

  const checkAccess = useCallback(async (id) => {
    setCheckingAccess(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) {
        setIsOfficial(false);
        return;
      }
      const { data, error: memberErr } = await supabase
        .from(MEMBERS_TABLE)
        .select("id, name, role, status")
        .eq("chama_id", id)
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (memberErr) throw memberErr;
      const official = !!data && data.status === "active" && OFFICIAL_ROLES.includes(data.role);
      setIsOfficial(official);
      setOfficialName(data?.name || null);
    } catch (err) {
      console.error("[LoanRulesForm] Failed to check official status:", err);
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
        .from(RULES_TABLE)
        .select("*")
        .eq("chama_id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (data) {
        setForm({
          ...DEFAULTS,
          ...data,
          max_loan_amount: data.max_loan_amount ?? "",
        });
      } else {
        setForm(DEFAULTS);
      }
    } catch (err) {
      setError(err.message || "Failed to load loan rules");
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

  const set = (field, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        chama_id: chamaId,
        savings_multiplier: Number(form.savings_multiplier) || 0,
        max_loan_amount: form.max_loan_amount === "" ? null : Number(form.max_loan_amount),
        min_membership_months: Number(form.min_membership_months) || 0,
        requires_guarantors: !!form.requires_guarantors,
        min_guarantors: Number(form.min_guarantors) || 0,
        guarantor_coverage_percent: Number(form.guarantor_coverage_percent) || 0,
        requires_security: !!form.requires_security,
        security_instructions: form.security_instructions?.trim() || null,
        default_interest_rate: Number(form.default_interest_rate) || 0,
        default_interest_type: form.default_interest_type,
        required_approvals: Math.max(Number(form.required_approvals) || MIN_REQUIRED_APPROVALS, MIN_REQUIRED_APPROVALS),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from(RULES_TABLE)
        .upsert(payload, { onConflict: "chama_id" });
      if (upsertErr) throw upsertErr;

      setSaved(true);
      onSaved?.(payload);
    } catch (err) {
      setError(err.message || "Failed to save loan rules");
    } finally {
      setSaving(false);
    }
  };

  if (checkingAccess || loading) {
    return (
      <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading loan rules...</p></div>
    );
  }

  if (!isOfficial) {
    return (
      <div className="loan-rules-form">
        <div className="empty-state error">
          <AlertCircle size={24} />
          <p>Only chama officials (chairperson, treasurer, secretary, or welfare officer) can view or edit loan rules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="loan-rules-form">
      <h2><ShieldCheck size={20} /> Loan Rules</h2>
      <p className="rules-intro">
        Set how loan eligibility, guarantors, security, and approvals work for this chama —
        similar to how a SACCO defines its lending policy. These rules apply to every new
        loan application submitted after you save. {officialName && <>Editing as <strong>{officialName}</strong>.</>}
      </p>

      {error && <p className="field-error"><AlertCircle size={12} /> {error}</p>}

      <form onSubmit={save}>
        <div className="rules-section">
          <h4>Eligibility</h4>
          <div className="rules-row">
            <label>
              Savings multiplier (x total contributions)
              <input type="number" min="0" step="0.5" value={form.savings_multiplier} onChange={(e) => set("savings_multiplier", e.target.value)} />
            </label>
            <label>
              Maximum loan amount (KES, optional cap)
              <input type="number" min="0" placeholder="No cap" value={form.max_loan_amount} onChange={(e) => set("max_loan_amount", e.target.value)} />
            </label>
            <label>
              Minimum membership length (months)
              <input type="number" min="0" value={form.min_membership_months} onChange={(e) => set("min_membership_months", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="rules-section">
          <h4>Guarantors</h4>
          <div className="toggle-row">
            <input type="checkbox" checked={!!form.requires_guarantors} onChange={(e) => set("requires_guarantors", e.target.checked)} />
            Require guarantors on loan applications
          </div>
          {form.requires_guarantors && (
            <div className="rules-row">
              <label>
                Minimum number of guarantors
                <input type="number" min="1" value={form.min_guarantors} onChange={(e) => set("min_guarantors", e.target.value)} />
              </label>
              <label>
                Guarantor coverage required (% of loan)
                <input type="number" min="0" max="200" value={form.guarantor_coverage_percent} onChange={(e) => set("guarantor_coverage_percent", e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className="rules-section">
          <h4>Security / Collateral</h4>
          <div className="toggle-row">
            <input type="checkbox" checked={!!form.requires_security} onChange={(e) => set("requires_security", e.target.checked)} />
            Require security/collateral for loans
          </div>
          {form.requires_security && (
            <div className="rules-row">
              <label style={{ gridColumn: "1 / -1" }}>
                Instructions shown to the committee on the application form
                <input placeholder="e.g. Title deed copy or logbook required before approval" value={form.security_instructions} onChange={(e) => set("security_instructions", e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className="rules-section">
          <h4>Default loan terms</h4>
          <div className="rules-row">
            <label>
              Default interest rate (%)
              <input type="number" min="0" step="0.5" value={form.default_interest_rate} onChange={(e) => set("default_interest_rate", e.target.value)} />
            </label>
            <label>
              Default interest type
              <select value={form.default_interest_type} onChange={(e) => set("default_interest_type", e.target.value)}>
                <option value="flat_monthly">Flat rate, per month</option>
                <option value="reducing_annual">Reducing balance, annual</option>
              </select>
            </label>
            <label>
              Committee sign-offs required per loan (minimum {MIN_REQUIRED_APPROVALS})
              <input type="number" min={MIN_REQUIRED_APPROVALS} value={form.required_approvals} onChange={(e) => set("required_approvals", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="rules-form-actions">
          {saved && <span className="guarantor-coverage ok" style={{ alignSelf: "center" }}>Saved</span>}
          <button type="submit" className="save-btn" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save loan rules"}
          </button>
        </div>
      </form>
    </div>
  );
}