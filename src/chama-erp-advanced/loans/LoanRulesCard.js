import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import { Settings, ShieldCheck, Save, Loader2, CheckCircle2, Info } from "lucide-react";
import "./LoanRulesCard.css";

// -----------------------------------------------------------------------------
// LoanRulesCard
// One physical "card/form" per chama, mounted in the Officials dashboard.
// Only chairperson / treasurer / secretary / admin may open and edit it —
// this is where the multi-chama loan engine's per-tenant policy lives.
// Writes to: chama_loan_rules (see sql/001_schema_upgrade.sql)
// -----------------------------------------------------------------------------

const ALL_ROLES = [
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "chairperson", label: "Chairperson" },
  { value: "welfare_officer", label: "Welfare Officer" },
];

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
  required_approvals: 3,
  approver_roles: ["secretary", "treasurer", "chairperson"],
  max_active_loans_per_member: 1,
};

export default function LoanRulesCard({ chamaId: chamaIdProp }) {
  const { chama, member, hasRole } = useChama();
  const chamaId = chamaIdProp || chama?.id;
  const canEdit = hasRole(["secretary", "treasurer", "chairperson", "admin"]);

  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("chama_loan_rules")
      .select("*")
      .eq("chama_id", chamaId)
      .maybeSingle();

    if (err) {
      setError(err.message);
    } else if (data) {
      setForm({
        ...DEFAULTS,
        ...data,
        max_loan_amount: data.max_loan_amount ?? "",
        approver_roles: Array.isArray(data.approver_roles) ? data.approver_roles : DEFAULTS.approver_roles,
      });
    } else {
      setForm(DEFAULTS);
    }
    setLoading(false);
  }, [chamaId]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const toggleRole = (role) => {
    setForm((f) => {
      const has = f.approver_roles.includes(role);
      const next = has ? f.approver_roles.filter((r) => r !== role) : [...f.approver_roles, role];
      return { ...f, approver_roles: next, required_approvals: Math.max(next.length, 1) };
    });
  };

  const save = async () => {
    if (!canEdit) return;
    if (form.approver_roles.length < 3) {
      setError("The loan engine requires at least 3 named approving roles (secretary, treasurer, chairperson by default). Add more roles before saving.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      chama_id: chamaId,
      savings_multiplier: Number(form.savings_multiplier) || 1,
      max_loan_amount: form.max_loan_amount === "" ? null : Number(form.max_loan_amount),
      min_membership_months: Number(form.min_membership_months) || 0,
      requires_guarantors: !!form.requires_guarantors,
      min_guarantors: Number(form.min_guarantors) || 0,
      guarantor_coverage_percent: Number(form.guarantor_coverage_percent) || 0,
      requires_security: !!form.requires_security,
      security_instructions: form.security_instructions || null,
      default_interest_rate: Number(form.default_interest_rate) || 0,
      default_interest_type: form.default_interest_type,
      required_approvals: form.approver_roles.length,
      approver_roles: form.approver_roles,
      max_active_loans_per_member: Number(form.max_active_loans_per_member) || 1,
      updated_by: member?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { error: err } = await supabase
      .from("chama_loan_rules")
      .upsert(payload, { onConflict: "chama_id" });

    setSaving(false);
    if (err) setError(err.message);
    else setSavedAt(new Date());
  };

  if (!canEdit) {
    return (
      <div className="lrc-card lrc-locked">
        <ShieldCheck size={18} />
        <p>Loan rules can only be configured by the secretary, treasurer or chairperson.</p>
      </div>
    );
  }

  return (
    <div className="lrc-card">
      <div className="lrc-head">
        <div className="lrc-head-title">
          <span className="lrc-icon"><Settings size={16} /></span>
          <div>
            <h3>Loan Rules</h3>
            <p>Policy applied to every new application in this chama</p>
          </div>
        </div>
        {savedAt && (
          <span className="lrc-saved"><CheckCircle2 size={14} /> Saved</span>
        )}
      </div>

      {loading ? (
        <div className="lrc-loading"><Loader2 size={18} className="spin" /> Loading rules...</div>
      ) : (
        <>
          {error && <div className="lrc-error"><Info size={14} /> {error}</div>}

          <div className="lrc-section">
            <h4>Eligibility</h4>
            <div className="lrc-grid">
              <label>
                Savings multiplier
                <input type="number" min="0" step="0.5" value={form.savings_multiplier}
                  onChange={(e) => update("savings_multiplier", e.target.value)} />
                <small>Member may borrow up to this many times their savings</small>
              </label>
              <label>
                Max loan amount (KES, optional cap)
                <input type="number" min="0" value={form.max_loan_amount}
                  onChange={(e) => update("max_loan_amount", e.target.value)} placeholder="No cap" />
              </label>
              <label>
                Min. membership length (months)
                <input type="number" min="0" value={form.min_membership_months}
                  onChange={(e) => update("min_membership_months", e.target.value)} />
              </label>
              <label>
                Max active loans per member
                <input type="number" min="1" value={form.max_active_loans_per_member}
                  onChange={(e) => update("max_active_loans_per_member", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="lrc-section">
            <h4>Guarantors &amp; security</h4>
            <div className="lrc-grid">
              <label className="lrc-checkbox">
                <input type="checkbox" checked={form.requires_guarantors}
                  onChange={(e) => update("requires_guarantors", e.target.checked)} />
                Require guarantors
              </label>
              {form.requires_guarantors && (
                <>
                  <label>
                    Minimum guarantors
                    <input type="number" min="1" value={form.min_guarantors}
                      onChange={(e) => update("min_guarantors", e.target.value)} />
                  </label>
                  <label>
                    Guarantor coverage required (%)
                    <input type="number" min="0" max="100" value={form.guarantor_coverage_percent}
                      onChange={(e) => update("guarantor_coverage_percent", e.target.value)} />
                  </label>
                </>
              )}
              <label className="lrc-checkbox">
                <input type="checkbox" checked={form.requires_security}
                  onChange={(e) => update("requires_security", e.target.checked)} />
                Require physical security / collateral
              </label>
              {form.requires_security && (
                <label className="lrc-span-2">
                  Security instructions shown to applicants
                  <textarea value={form.security_instructions}
                    onChange={(e) => update("security_instructions", e.target.value)}
                    placeholder="e.g. Logbook or title deed to be lodged with the treasurer before disbursement" />
                </label>
              )}
            </div>
          </div>

          <div className="lrc-section">
            <h4>Interest</h4>
            <div className="lrc-grid">
              <label>
                Default interest rate (%)
                <input type="number" min="0" step="0.5" value={form.default_interest_rate}
                  onChange={(e) => update("default_interest_rate", e.target.value)} />
              </label>
              <label>
                Interest type
                <select value={form.default_interest_type}
                  onChange={(e) => update("default_interest_type", e.target.value)}>
                  <option value="flat_monthly">Flat, monthly</option>
                  <option value="reducing_annual">Reducing balance, annual</option>
                </select>
              </label>
            </div>
          </div>

          <div className="lrc-section">
            <h4>Approval chain</h4>
            <p className="lrc-hint">
              Every loan must be signed off by each role checked below, in this order, before
              it can be disbursed. The platform enforces a minimum of 3 approving roles.
            </p>
            <div className="lrc-role-chips">
              {ALL_ROLES.map((r) => (
                <button
                  type="button" key={r.value}
                  className={`lrc-chip ${form.approver_roles.includes(r.value) ? "active" : ""}`}
                  onClick={() => toggleRole(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="lrc-chain-preview">
              {form.approver_roles.map((r, i) => (
                <React.Fragment key={r}>
                  <span className="lrc-chain-step">{ALL_ROLES.find((x) => x.value === r)?.label || r}</span>
                  {i < form.approver_roles.length - 1 && <span className="lrc-chain-arrow">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          <button className="lrc-save-btn" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save loan rules"}
          </button>
        </>
      )}
    </div>
  );
}
