import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ClipboardEdit, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient"; // <-- adjust to your project's Supabase client path
import "./LoanApplications.css";

// =============================================================================
// ManualLoanEntry — lets a chama official record a loan directly, instead of
// waiting for a member to submit it through the normal application form.
//
// Two uses this covers:
//   1. Historical loans — one that was already disbursed before this system
//      existed. Officials can record it as already Approved, with the actual
//      approval date, so it shows up correctly in reports.
//   2. Fast-tracked / manual loans — the committee decided outside the app
//      (e.g. in a physical meeting) and just wants it on record. This still
//      goes into the normal Pending -> sign-off pipeline unless marked
//      "already approved" below, so the 3-official rule still applies unless
//      you explicitly bypass it for a historical entry.
//
// Every row created here is flagged `manual_entry = true` and stamped with
// `recorded_by` (the officials's own chama_members.id) so it's always clear
// in the data which applications came through the member-facing form vs.
// were entered directly by an official.
//
// Officials-only: gated the same way as LoanRulesForm / LoanTypesManager.
// =============================================================================

const APPLICATIONS_TABLE = "chama_loan_applications";
const MEMBERS_TABLE = "chama_members";
const CONTRIBUTIONS_TABLE = "chama_contributions";
const RULES_TABLE = "chama_loan_rules";
const LOAN_TYPES_TABLE = "chama_loan_types";

const OFFICIAL_ROLES = ["chairperson", "treasurer", "secretary", "welfare_officer"];
const MIN_REQUIRED_APPROVALS = 3;

function normalizeName(s) {
  return (s || "").trim().toLowerCase();
}

function calculateLoan({ amount, months, rate, type }) {
  const P = Number(amount) || 0;
  const n = Number(months) || 0;
  const r = Number(rate) || 0;
  if (P <= 0 || n <= 0) return { monthlyInstallment: 0, totalInterest: 0, totalRepayable: 0 };
  if (type === "reducing_annual") {
    const monthlyRate = r / 100 / 12;
    const factor = monthlyRate === 0 ? null : Math.pow(1 + monthlyRate, n);
    const monthlyInstallment = monthlyRate === 0 ? P / n : (P * monthlyRate * factor) / (factor - 1);
    const totalRepayable = monthlyInstallment * n;
    return { monthlyInstallment, totalRepayable, totalInterest: totalRepayable - P };
  }
  const totalInterest = P * (r / 100) * n;
  const totalRepayable = P + totalInterest;
  return { monthlyInstallment: totalRepayable / n, totalInterest, totalRepayable };
}

function formatKES(value) {
  return `KES ${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const emptyForm = {
  member_id: "",
  requested_amount: "",
  purpose: "",
  repayment_months: "",
  interest_rate: "10",
  interest_type: "flat_monthly",
  loan_type_id: "",
  mark_as_approved: false,
  approved_at: new Date().toISOString().slice(0, 10),
};

export default function ManualLoanEntry({ chamaId, onRecorded }) {
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [official, setOfficial] = useState(null); // {id, name, role} — also used as recorded_by / approver

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [loanTypes, setLoanTypes] = useState([]);
  const [rules, setRules] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const checkAccess = useCallback(async (id) => {
    setCheckingAccess(true);
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) { setOfficial(null); return; }
      const { data, error: memberErr } = await supabase
        .from(MEMBERS_TABLE)
        .select("id, name, role, status")
        .eq("chama_id", id)
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (memberErr) throw memberErr;
      const valid = !!data && data.status === "active" && OFFICIAL_ROLES.includes(data.role);
      setOfficial(valid ? { id: data.id, name: data.name, role: data.role } : null);
    } catch (err) {
      console.error("[ManualLoanEntry] Failed to check official status:", err);
      setOfficial(null);
    } finally {
      setCheckingAccess(false);
    }
  }, []);

  const loadMembers = useCallback(async (id) => {
    setMembersLoading(true);
    try {
      const { data: memberRows, error: memberErr } = await supabase
        .from(MEMBERS_TABLE).select("*").eq("chama_id", id).eq("status", "active");
      if (memberErr) throw memberErr;

      let contribByName = new Map();
      try {
        const { data: contribRows } = await supabase
          .from(CONTRIBUTIONS_TABLE).select("name, savings").eq("chama_id", id);
        (contribRows || []).forEach((c) => contribByName.set(normalizeName(c.name), c));
      } catch { /* savings lookup is best-effort */ }

      const rows = (memberRows || []).map((m) => ({
        id: m.id,
        member_name: m.name || "Unnamed member",
        total_contributions: Number(contribByName.get(normalizeName(m.name))?.savings) || 0,
      }));
      rows.sort((a, b) => a.member_name.localeCompare(b.member_name));
      setMembers(rows);
    } catch (err) {
      console.error("[ManualLoanEntry] Failed to load members:", err);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadSupportingData = useCallback(async (id) => {
    try {
      const { data: rulesData } = await supabase.from(RULES_TABLE).select("*").eq("chama_id", id).maybeSingle();
      setRules(rulesData || null);
    } catch { setRules(null); }
    try {
      const { data: typesData } = await supabase.from(LOAN_TYPES_TABLE).select("*").eq("chama_id", id).eq("active", true);
      setLoanTypes(typesData || []);
    } catch { setLoanTypes([]); }
  }, []);

  useEffect(() => {
    if (!chamaId) return;
    checkAccess(chamaId);
    loadMembers(chamaId);
    loadSupportingData(chamaId);
  }, [chamaId, checkAccess, loadMembers, loadSupportingData]);

  const membersById = useMemo(() => {
    const map = {};
    members.forEach((m) => { map[m.id] = m; });
    return map;
  }, [members]);

  const selectedMember = membersById[form.member_id] || null;
  const selectedLoanType = loanTypes.find((t) => t.id === form.loan_type_id) || null;

  const preview = useMemo(
    () => calculateLoan({ amount: form.requested_amount, months: form.repayment_months, rate: form.interest_rate, type: form.interest_type }),
    [form.requested_amount, form.repayment_months, form.interest_rate, form.interest_type]
  );

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const applyLoanType = (typeId) => {
    set("loan_type_id", typeId);
    const type = loanTypes.find((t) => t.id === typeId);
    if (type) {
      setForm((f) => ({ ...f, loan_type_id: typeId, interest_rate: String(type.interest_rate), interest_type: type.interest_type }));
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  const validate = () => {
    const errs = {};
    if (!form.member_id) errs.member_id = "Select which member this loan is for";
    if (!form.requested_amount || Number(form.requested_amount) <= 0) errs.requested_amount = "Enter a valid amount";
    if (!form.repayment_months || Number(form.repayment_months) <= 0) errs.repayment_months = "Enter repayment period";
    if (!form.purpose.trim()) errs.purpose = "Required";
    if (form.mark_as_approved && !form.approved_at) errs.approved_at = "Enter the date this loan was approved";
    setErrors(errs);
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!official) {
      showToast("Only chama officials can record loans manually.", "error");
      return;
    }
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      showToast(Object.values(errs)[0], "error");
      return;
    }

    setSubmitting(true);
    try {
      const requiredApprovals = Math.max(rules?.required_approvals || MIN_REQUIRED_APPROVALS, MIN_REQUIRED_APPROVALS);
      const nowIso = new Date().toISOString();

      const basePayload = {
        chama_id: chamaId,
        member_id: form.member_id,
        member_name: selectedMember?.member_name || "",
        requested_amount: Number(form.requested_amount),
        purpose: form.purpose.trim(),
        repayment_months: Number(form.repayment_months),
        interest_rate: Number(form.interest_rate) || 0,
        interest_type: form.interest_type,
        guarantors: JSON.stringify([]),
        loan_type_id: form.loan_type_id || null,
        manual_entry: true,
        recorded_by: official.id,
        required_approvals: requiredApprovals,
      };

      const payload = form.mark_as_approved
        ? {
            ...basePayload,
            status: "Approved",
            approvals: [{ official_id: official.id, name: official.name, role: official.role, decided_at: nowIso }],
            approved_by: official.id,
            approved_at: new Date(form.approved_at).toISOString(),
            loan_id: crypto.randomUUID(),
          }
        : {
            ...basePayload,
            status: "Pending",
            approvals: [],
          };

      const { error } = await supabase.from(APPLICATIONS_TABLE).insert([payload]);
      if (error) throw error;

      showToast(form.mark_as_approved ? "Historical loan recorded as approved" : "Loan recorded and sent for the usual sign-off");
      setForm(emptyForm);
      onRecorded?.();
    } catch (err) {
      console.error("[ManualLoanEntry] Failed to record loan:", err);
      showToast(`Could not record loan: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingAccess) {
    return <div className="loading-state"><Loader2 size={24} className="spin" /><p>Checking access...</p></div>;
  }

  if (!official) {
    return (
      <div className="application-form">
        <div className="empty-state error">
          <AlertCircle size={24} />
          <p>Only chama officials (chairperson, treasurer, secretary, or welfare officer) can record loans manually.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="application-form">
      <h3><ClipboardEdit size={18} /> Manual Loan Entry</h3>
      <div className="rules-banner official">
        <ShieldCheck size={14} />
        Recording as {official.name} ({official.role})
      </div>

      <form onSubmit={submit}>
        <div className="form-row">
          <div className="form-field">
            <select value={form.member_id} onChange={(e) => set("member_id", e.target.value)} disabled={membersLoading}>
              <option value="">{membersLoading ? "Loading members..." : "Select member"}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.member_name}</option>)}
            </select>
            {errors.member_id && <span className="field-error">{errors.member_id}</span>}
            {selectedMember && <span className="eligibility-badge">Savings on file: {formatKES(selectedMember.total_contributions)}</span>}
          </div>

          <div className="form-field">
            <input type="number" min="0" placeholder="Amount (KES)" value={form.requested_amount} onChange={(e) => set("requested_amount", e.target.value)} />
            {errors.requested_amount && <span className="field-error">{errors.requested_amount}</span>}
          </div>
        </div>

        {loanTypes.length > 0 && (
          <div className="form-row">
            <div className="form-field">
              <select value={form.loan_type_id} onChange={(e) => applyLoanType(e.target.value)}>
                <option value="">No specific loan type</option>
                {loanTypes.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.interest_rate}%</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-field">
            <input type="number" min="1" placeholder="Repayment period (months)" value={form.repayment_months} onChange={(e) => set("repayment_months", e.target.value)} />
            {errors.repayment_months && <span className="field-error">{errors.repayment_months}</span>}
          </div>
          <div className="form-field">
            <input type="number" min="0" step="0.5" placeholder="Interest rate (%)" value={form.interest_rate} onChange={(e) => set("interest_rate", e.target.value)} disabled={!!selectedLoanType} />
          </div>
          <div className="form-field">
            <select value={form.interest_type} onChange={(e) => set("interest_type", e.target.value)} disabled={!!selectedLoanType}>
              <option value="flat_monthly">Flat rate, per month</option>
              <option value="reducing_annual">Reducing balance, annual</option>
            </select>
          </div>
        </div>

        <div className="form-field">
          <textarea placeholder="Purpose of the loan" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          {errors.purpose && <span className="field-error">{errors.purpose}</span>}
        </div>

        {Number(form.requested_amount) > 0 && Number(form.repayment_months) > 0 && (
          <div className="loan-preview">
            <div className="preview-row"><span>Monthly installment</span><strong>{formatKES(preview.monthlyInstallment)}</strong></div>
            <div className="preview-row"><span>Total interest</span><strong>{formatKES(preview.totalInterest)}</strong></div>
            <div className="preview-row"><span>Total repayable</span><strong>{formatKES(preview.totalRepayable)}</strong></div>
          </div>
        )}

        <div className="rules-section">
          <div className="toggle-row">
            <input type="checkbox" checked={form.mark_as_approved} onChange={(e) => set("mark_as_approved", e.target.checked)} />
            This is a historical loan — mark it as already approved (skips the {Math.max(rules?.required_approvals || MIN_REQUIRED_APPROVALS, MIN_REQUIRED_APPROVALS)}-official sign-off)
          </div>
          {form.mark_as_approved && (
            <div className="rules-row">
              <label>
                Date it was actually approved
                <input type="date" value={form.approved_at} onChange={(e) => set("approved_at", e.target.value)} />
              </label>
              {errors.approved_at && <span className="field-error">{errors.approved_at}</span>}
            </div>
          )}
          {!form.mark_as_approved && (
            <p className="rules-intro" style={{ margin: "8px 0 0" }}>
              Leave this unchecked to send it through the normal Pending → sign-off flow — it'll appear
              in Loan Applications waiting for {Math.max(rules?.required_approvals || MIN_REQUIRED_APPROVALS, MIN_REQUIRED_APPROVALS)} officials, same as a member-submitted request.
            </p>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? (<><Loader2 size={16} className="spin" /> Recording...</>) : "Record Loan"}
          </button>
        </div>
      </form>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}