import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./LoanApplications.css";
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  FileText,
  TrendingUp,
  Users,
  Clock,
  X,
  Loader2,
  ShieldCheck,
  Download,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertCircle,
  PlusCircle,
  Wallet,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Required number of committee sign-offs before a loan is fully approved.
// Most chamas require at least two officials (e.g. Treasurer + Chairperson)
// to sign off before funds are disbursed.
const DEFAULT_REQUIRED_APPROVALS = 2;

// How many times a member's total contributions they may borrow.
// This is the classic chama / merry-go-round lending rule of thumb.
const DEFAULT_ELIGIBILITY_MULTIPLIER = 3;

const STATUS_TABS = ["All", "Pending", "Awaiting Approval", "Approved", "Rejected"];

const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Amount: high to low" },
  { value: "amount_asc", label: "Amount: low to high" },
];

const emptyForm = {
  member_name: "",
  requested_amount: "",
  purpose: "",
  repayment_months: "",
  interest_rate: "10",
  interest_type: "flat_monthly", // 'flat_monthly' | 'reducing_annual'
};

const emptyGuarantor = () => ({ id: crypto.randomUUID(), name: "", amount: "" });

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatKES(value) {
  const n = Number(value || 0);
  return `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function calculateLoan({ amount, months, rate, type }) {
  const P = Number(amount) || 0;
  const n = Number(months) || 0;
  const r = Number(rate) || 0;

  if (P <= 0 || n <= 0) {
    return { monthlyInstallment: 0, totalInterest: 0, totalRepayable: 0 };
  }

  if (type === "reducing_annual") {
    const monthlyRate = r / 100 / 12;
    let monthlyInstallment;
    if (monthlyRate === 0) {
      monthlyInstallment = P / n;
    } else {
      const factor = Math.pow(1 + monthlyRate, n);
      monthlyInstallment = (P * monthlyRate * factor) / (factor - 1);
    }
    const totalRepayable = monthlyInstallment * n;
    return {
      monthlyInstallment,
      totalRepayable,
      totalInterest: totalRepayable - P,
    };
  }

  // Default: flat monthly interest — the common chama convention
  // (interest charged on the original principal for every month of the term).
  const totalInterest = P * (r / 100) * n;
  const totalRepayable = P + totalInterest;
  const monthlyInstallment = totalRepayable / n;
  return { monthlyInstallment, totalInterest, totalRepayable };
}

function buildRepaymentSchedule({ loanId, amount, months, rate, type, startDate }) {
  const { monthlyInstallment } = calculateLoan({ amount, months, rate, type });
  const rows = [];
  const start = startDate ? new Date(startDate) : new Date();

  for (let i = 1; i <= Number(months || 0); i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    rows.push({
      loan_id: loanId,
      installment_number: i,
      due_date: dueDate.toISOString().slice(0, 10),
      amount_due: Math.round(monthlyInstallment * 100) / 100,
      amount_paid: 0,
      status: "Upcoming",
    });
  }
  return rows;
}

function toCSV(rows) {
  const headers = [
    "Member",
    "Amount Requested",
    "Interest Rate",
    "Interest Type",
    "Repayment Months",
    "Monthly Installment",
    "Total Repayable",
    "Status",
    "Guarantors",
    "Applied On",
  ];
  const lines = rows.map((r) => {
    const { monthlyInstallment, totalRepayable } = calculateLoan({
      amount: r.requested_amount,
      months: r.repayment_months,
      rate: r.interest_rate,
      type: r.interest_type,
    });
    const guarantors = (r.guarantors || [])
      .map((g) => `${g.name} (${g.amount})`)
      .join("; ");
    return [
      r.member_name,
      r.requested_amount,
      `${r.interest_rate ?? 0}%`,
      r.interest_type === "reducing_annual" ? "Reducing (annual)" : "Flat (monthly)",
      r.repayment_months,
      Math.round(monthlyInstallment),
      Math.round(totalRepayable),
      r.status,
      guarantors,
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",");
  });
  return [headers.join(","), ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoanApplications({ chamaId }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [guarantors, setGuarantors] = useState([emptyGuarantor()]);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [eligibility, setEligibility] = useState(null); // { limit, contributions } | null

  const [expandedId, setExpandedId] = useState(null);
  const [schedules, setSchedules] = useState({}); // loanApplicationId -> rows

  const [actingId, setActingId] = useState(null); // row currently being approved/rejected
  const [confirmModal, setConfirmModal] = useState(null); // { type: 'approve'|'reject', row }
  const [approverName, setApproverName] = useState("");
  const [approverRole, setApproverRole] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [toast, setToast] = useState(null); // { message, type }

  // ---- Data loading ------------------------------------------------------

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3500);
  };

  const loadApplications = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("chama_loan_applications")
      .select("*")
      .eq("chama_id", chamaId)
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError(error.message);
    } else {
      setApplications(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamaId]);

  // Best-effort eligibility check against member contributions.
  // Silently no-ops if the members/contributions table or columns don't exist.
  useEffect(() => {
    let cancelled = false;

    const checkEligibility = async () => {
      if (!form.member_name.trim()) {
        setEligibility(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("chama_members")
          .select("total_contributions")
          .eq("chama_id", chamaId)
          .ilike("member_name", form.member_name.trim())
          .maybeSingle();

        if (!cancelled) {
          if (error || !data) {
            setEligibility(null);
          } else {
            const contributions = Number(data.total_contributions) || 0;
            setEligibility({
              contributions,
              limit: contributions * DEFAULT_ELIGIBILITY_MULTIPLIER,
            });
          }
        }
      } catch {
        if (!cancelled) setEligibility(null);
      }
    };

    const t = window.setTimeout(checkEligibility, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [form.member_name, chamaId]);

  // ---- Derived data --------------------------------------------------------

  const stats = useMemo(() => {
    const pending = applications.filter(
      (a) => a.status === "Pending" || a.status === "Awaiting Approval"
    );
    const approved = applications.filter((a) => a.status === "Approved");
    const rejected = applications.filter((a) => a.status === "Rejected");
    const decided = approved.length + rejected.length;

    const totalDisbursed = approved.reduce(
      (sum, a) => sum + (Number(a.requested_amount) || 0),
      0
    );
    const totalPending = pending.reduce(
      (sum, a) => sum + (Number(a.requested_amount) || 0),
      0
    );
    const avgLoanSize =
      applications.length > 0
        ? applications.reduce((s, a) => s + (Number(a.requested_amount) || 0), 0) /
          applications.length
        : 0;

    return {
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      totalDisbursed,
      totalPending,
      avgLoanSize,
      approvalRate: decided > 0 ? (approved.length / decided) * 100 : null,
    };
  }, [applications]);

  const filtered = useMemo(() => {
    let rows = applications.filter((a) =>
      (a.member_name || "").toLowerCase().includes(search.toLowerCase())
    );

    if (statusTab !== "All") {
      rows = rows.filter((a) => a.status === statusTab);
    }

    rows = [...rows].sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return new Date(a.created_at) - new Date(b.created_at);
        case "amount_desc":
          return (b.requested_amount || 0) - (a.requested_amount || 0);
        case "amount_asc":
          return (a.requested_amount || 0) - (b.requested_amount || 0);
        case "date_desc":
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return rows;
  }, [applications, search, statusTab, sortBy]);

  const loanPreview = useMemo(
    () =>
      calculateLoan({
        amount: form.requested_amount,
        months: form.repayment_months,
        rate: form.interest_rate,
        type: form.interest_type,
      }),
    [form.requested_amount, form.repayment_months, form.interest_rate, form.interest_type]
  );

  const guarantorTotal = useMemo(
    () => guarantors.reduce((sum, g) => sum + (Number(g.amount) || 0), 0),
    [guarantors]
  );

  // ---- Guarantor list editing ---------------------------------------------

  const addGuarantor = () => setGuarantors((g) => [...g, emptyGuarantor()]);

  const removeGuarantor = (id) =>
    setGuarantors((g) => (g.length > 1 ? g.filter((row) => row.id !== id) : g));

  const updateGuarantor = (id, field, value) =>
    setGuarantors((g) =>
      g.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );

  // ---- Create application --------------------------------------------------

  const validateForm = () => {
    const errors = {};
    if (!form.member_name.trim()) errors.member_name = "Required";
    if (!form.requested_amount || Number(form.requested_amount) <= 0)
      errors.requested_amount = "Enter a valid amount";
    if (!form.repayment_months || Number(form.repayment_months) <= 0)
      errors.repayment_months = "Enter repayment period";
    if (!form.purpose.trim()) errors.purpose = "Required";
    const cleanGuarantors = guarantors.filter((g) => g.name.trim());
    if (cleanGuarantors.length === 0) errors.guarantors = "At least one guarantor";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setForm(emptyForm);
    setGuarantors([emptyGuarantor()]);
    setFormErrors({});
    setEligibility(null);
  };

  const createApplication = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    const cleanGuarantors = guarantors
      .filter((g) => g.name.trim())
      .map((g) => ({ name: g.name.trim(), amount: Number(g.amount) || 0 }));

    const { error } = await supabase.from("chama_loan_applications").insert([
      {
        chama_id: chamaId,
        member_name: form.member_name.trim(),
        requested_amount: Number(form.requested_amount),
        purpose: form.purpose.trim(),
        repayment_months: Number(form.repayment_months),
        interest_rate: Number(form.interest_rate) || 0,
        interest_type: form.interest_type,
        guarantors: cleanGuarantors,
        approvals: [],
        required_approvals: DEFAULT_REQUIRED_APPROVALS,
        status: "Pending",
      },
    ]);

    setSubmitting(false);

    if (error) {
      showToast(`Could not submit application: ${error.message}`, "error");
      return;
    }

    showToast("Application submitted");
    resetForm();
    setFormOpen(false);
    loadApplications();
  };

  // ---- Approval workflow -----------------------------------------------

  const openApprove = (row) => {
    setApproverName("");
    setApproverRole("");
    setConfirmModal({ type: "approve", row });
  };

  const openReject = (row) => {
    setRejectionReason("");
    setConfirmModal({ type: "reject", row });
  };

  const closeModal = () => setConfirmModal(null);

  const finalizeLoan = async (row) => {
    // Convert the application into an active loan, with the computed
    // repayment terms carried across, then generate its schedule.
    const { monthlyInstallment, totalRepayable } = calculateLoan({
      amount: row.requested_amount,
      months: row.repayment_months,
      rate: row.interest_rate,
      type: row.interest_type,
    });

    const { data: loanRows, error: loanError } = await supabase
      .from("chama_loans")
      .insert([
        {
          chama_id: chamaId,
          member_name: row.member_name,
          amount: row.requested_amount,
          amount_repaid: 0,
          interest_rate: row.interest_rate,
          interest_type: row.interest_type,
          monthly_installment: Math.round(monthlyInstallment * 100) / 100,
          total_repayable: Math.round(totalRepayable * 100) / 100,
          issue_date: new Date().toISOString().slice(0, 10),
          status: "Active",
        },
      ])
      .select();

    if (loanError) throw loanError;

    const newLoan = loanRows && loanRows[0];

    // Best-effort: generate a repayment schedule. If the table doesn't
    // exist yet in this project, this silently no-ops.
    if (newLoan) {
      try {
        const scheduleRows = buildRepaymentSchedule({
          loanId: newLoan.id,
          amount: row.requested_amount,
          months: row.repayment_months,
          rate: row.interest_rate,
          type: row.interest_type,
          startDate: new Date(),
        });
        await supabase.from("chama_loan_repayments").insert(scheduleRows);
      } catch {
        // Table may not exist in every deployment — non-fatal.
      }
    }
  };

  const submitApproval = async () => {
    const row = confirmModal.row;
    if (!approverName.trim()) {
      showToast("Enter the approver's name", "error");
      return;
    }

    setActingId(row.id);
    try {
      const existingApprovals = Array.isArray(row.approvals) ? row.approvals : [];
      const alreadyApproved = existingApprovals.some(
        (a) => a.name.toLowerCase() === approverName.trim().toLowerCase()
      );
      if (alreadyApproved) {
        showToast("This approver has already signed off", "error");
        setActingId(null);
        return;
      }

      const newApprovals = [
        ...existingApprovals,
        {
          name: approverName.trim(),
          role: approverRole.trim() || "Committee member",
          decided_at: new Date().toISOString(),
        },
      ];

      const required = row.required_approvals || DEFAULT_REQUIRED_APPROVALS;
      const fullyApproved = newApprovals.length >= required;

      const { error } = await supabase
        .from("chama_loan_applications")
        .update({
          approvals: newApprovals,
          status: fullyApproved ? "Approved" : "Awaiting Approval",
          approved_at: fullyApproved ? new Date().toISOString() : null,
        })
        .eq("id", row.id);

      if (error) throw error;

      if (fullyApproved) {
        await finalizeLoan(row);
        showToast(`Loan approved and disbursed to ${row.member_name}`);
      } else {
        showToast(
          `Sign-off recorded (${newApprovals.length}/${required}). Awaiting further approval.`
        );
      }

      closeModal();
      loadApplications();
    } catch (err) {
      showToast(`Could not process approval: ${err.message}`, "error");
    } finally {
      setActingId(null);
    }
  };

  const submitRejection = async () => {
    const row = confirmModal.row;
    setActingId(row.id);
    try {
      const { error } = await supabase
        .from("chama_loan_applications")
        .update({
          status: "Rejected",
          rejection_reason: rejectionReason.trim() || null,
        })
        .eq("id", row.id);
      if (error) throw error;

      showToast(`Application from ${row.member_name} rejected`);
      closeModal();
      loadApplications();
    } catch (err) {
      showToast(`Could not reject: ${err.message}`, "error");
    } finally {
      setActingId(null);
    }
  };

  // ---- Repayment schedule viewing -----------------------------------------

  const toggleSchedule = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (schedules[row.id]) return;

    try {
      const { data } = await supabase
        .from("chama_loan_repayments")
        .select("*")
        .eq("loan_id", row.loan_id || row.id)
        .order("installment_number", { ascending: true });
      setSchedules((s) => ({ ...s, [row.id]: data || [] }));
    } catch {
      setSchedules((s) => ({ ...s, [row.id]: [] }));
    }
  };

  // ---- Export --------------------------------------------------------------

  const exportCSV = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loan-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Render ----------------------------------------------------------

  return (
    <div className="loan-applications">
      {/* HEADER */}
      <div className="module-header">
        <h2>
          <FileText size={20} />
          Loan Applications
        </h2>

        <div className="header-actions">
          <div className="search-box">
            <Search size={14} />
            <input
              placeholder="Search by member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button className="export-btn" onClick={exportCSV} type="button">
            <Download size={16} />
            Export
          </button>

          <button
            className="new-application-btn"
            onClick={() => setFormOpen((v) => !v)}
            type="button"
          >
            <Plus size={16} />
            New Application
          </button>
        </div>
      </div>

      {/* DASHBOARD */}
      <div className="stats-dashboard">
        <div className="stat-card">
          <div className="stat-icon pending">
            <Clock size={18} />
          </div>
          <div>
            <p className="stat-value">{stats.pendingCount}</p>
            <p className="stat-label">Pending review</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon disbursed">
            <Wallet size={18} />
          </div>
          <div>
            <p className="stat-value">{formatKES(stats.totalDisbursed)}</p>
            <p className="stat-label">Total disbursed</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon rate">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="stat-value">
              {stats.approvalRate === null ? "—" : `${stats.approvalRate.toFixed(0)}%`}
            </p>
            <p className="stat-label">Approval rate</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon avg">
            <Users size={18} />
          </div>
          <div>
            <p className="stat-value">{formatKES(stats.avgLoanSize)}</p>
            <p className="stat-label">Average loan size</p>
          </div>
        </div>
      </div>

      {/* NEW APPLICATION */}
      {formOpen && (
        <div className="application-form">
          <h3>
            <Plus size={18} />
            New Loan Application
          </h3>

          <form onSubmit={createApplication}>
            <div className="form-row">
              <div className="form-field">
                <input
                  placeholder="Member Name"
                  value={form.member_name}
                  onChange={(e) => setForm({ ...form, member_name: e.target.value })}
                />
                {formErrors.member_name && (
                  <span className="field-error">{formErrors.member_name}</span>
                )}
                {eligibility && (
                  <span className="eligibility-badge">
                    <ShieldCheck size={12} />
                    Eligible up to {formatKES(eligibility.limit)} (based on{" "}
                    {formatKES(eligibility.contributions)} contributed)
                  </span>
                )}
              </div>

              <div className="form-field">
                <input
                  type="number"
                  min="0"
                  placeholder="Amount Requested (KES)"
                  value={form.requested_amount}
                  onChange={(e) =>
                    setForm({ ...form, requested_amount: e.target.value })
                  }
                />
                {formErrors.requested_amount && (
                  <span className="field-error">{formErrors.requested_amount}</span>
                )}
                {eligibility &&
                  Number(form.requested_amount) > eligibility.limit && (
                    <span className="field-warning">
                      <AlertCircle size={12} />
                      Exceeds this member's eligibility limit
                    </span>
                  )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <input
                  type="number"
                  min="1"
                  placeholder="Repayment Period (months)"
                  value={form.repayment_months}
                  onChange={(e) =>
                    setForm({ ...form, repayment_months: e.target.value })
                  }
                />
                {formErrors.repayment_months && (
                  <span className="field-error">{formErrors.repayment_months}</span>
                )}
              </div>

              <div className="form-field">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Interest Rate (%)"
                  value={form.interest_rate}
                  onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                />
              </div>

              <div className="form-field">
                <select
                  value={form.interest_type}
                  onChange={(e) => setForm({ ...form, interest_type: e.target.value })}
                >
                  <option value="flat_monthly">Flat rate, per month</option>
                  <option value="reducing_annual">Reducing balance, annual</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <textarea
                placeholder="Purpose of the loan"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
              {formErrors.purpose && (
                <span className="field-error">{formErrors.purpose}</span>
              )}
            </div>

            {/* Loan preview */}
            {Number(form.requested_amount) > 0 && Number(form.repayment_months) > 0 && (
              <div className="loan-preview">
                <div className="preview-row">
                  <span>Monthly installment</span>
                  <strong>{formatKES(loanPreview.monthlyInstallment)}</strong>
                </div>
                <div className="preview-row">
                  <span>Total interest</span>
                  <strong>{formatKES(loanPreview.totalInterest)}</strong>
                </div>
                <div className="preview-row">
                  <span>Total repayable</span>
                  <strong>{formatKES(loanPreview.totalRepayable)}</strong>
                </div>
              </div>
            )}

            {/* Guarantors */}
            <div className="guarantor-section">
              <div className="guarantor-header">
                <span>Guarantors</span>
                <button type="button" className="add-guarantor-btn" onClick={addGuarantor}>
                  <PlusCircle size={14} />
                  Add guarantor
                </button>
              </div>

              <div className="guarantor-list">
                {guarantors.map((g) => (
                  <div className="guarantor-row" key={g.id}>
                    <input
                      placeholder="Guarantor name"
                      value={g.name}
                      onChange={(e) => updateGuarantor(g.id, "name", e.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Amount guaranteed"
                      value={g.amount}
                      onChange={(e) => updateGuarantor(g.id, "amount", e.target.value)}
                    />
                    <button
                      type="button"
                      className="remove-guarantor-btn"
                      onClick={() => removeGuarantor(g.id)}
                      disabled={guarantors.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {formErrors.guarantors && (
                <span className="field-error">{formErrors.guarantors}</span>
              )}

              {Number(form.requested_amount) > 0 && (
                <p
                  className={
                    guarantorTotal >= Number(form.requested_amount)
                      ? "guarantor-coverage ok"
                      : "guarantor-coverage warn"
                  }
                >
                  Guarantors cover {formatKES(guarantorTotal)} of{" "}
                  {formatKES(form.requested_amount)} requested
                </p>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={16} className="spin" /> Submitting...
                  </>
                ) : (
                  "Submit Application"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FILTER TABS + SORT */}
      <div className="filter-bar">
        <div className="filter-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              className={`tab ${statusTab === tab ? "active" : ""}`}
              onClick={() => setStatusTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* APPLICATIONS */}
      {loading ? (
        <div className="loading-state">
          <Loader2 size={24} className="spin" />
          <p>Loading applications...</p>
        </div>
      ) : loadError ? (
        <div className="empty-state error">
          <AlertCircle size={24} />
          <p>Could not load applications: {loadError}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <FileText size={24} />
          <p>No loan applications match your filters yet.</p>
        </div>
      ) : (
        <div className="application-grid">
          {filtered.map((app) => {
            const { monthlyInstallment, totalRepayable } = calculateLoan({
              amount: app.requested_amount,
              months: app.repayment_months,
              rate: app.interest_rate,
              type: app.interest_type,
            });
            const approvals = Array.isArray(app.approvals) ? app.approvals : [];
            const required = app.required_approvals || DEFAULT_REQUIRED_APPROVALS;
            const isPendingLike =
              app.status === "Pending" || app.status === "Awaiting Approval";

            return (
              <div className="application-card" key={app.id}>
                <div className="card-top">
                  <h3>{app.member_name}</h3>
                  <span className={`status ${app.status.replace(/\s+/g, "-")}`}>
                    {app.status}
                  </span>
                </div>

                <div className="card-body">
                  <p>
                    Amount: <strong>{formatKES(app.requested_amount)}</strong>
                  </p>
                  <p>Purpose: {app.purpose}</p>
                  <p>
                    Terms: {app.repayment_months} months at {app.interest_rate ?? 0}%{" "}
                    {app.interest_type === "reducing_annual"
                      ? "(reducing, annual)"
                      : "(flat, monthly)"}
                  </p>
                  <p>
                    Monthly installment: <strong>{formatKES(monthlyInstallment)}</strong>{" "}
                    &middot; Total repayable: <strong>{formatKES(totalRepayable)}</strong>
                  </p>
                  <p>
                    Guarantors:{" "}
                    {(app.guarantors || []).length > 0
                      ? app.guarantors
                          .map((g) => `${g.name} (${formatKES(g.amount)})`)
                          .join(", ")
                      : "None on file"}
                  </p>

                  {isPendingLike && required > 1 && (
                    <div className="approval-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${(approvals.length / required) * 100}%` }}
                        />
                      </div>
                      <span>
                        {approvals.length}/{required} sign-offs
                        {approvals.length > 0 &&
                          ` (${approvals.map((a) => a.name).join(", ")})`}
                      </span>
                    </div>
                  )}

                  {app.status === "Rejected" && app.rejection_reason && (
                    <p className="rejection-reason">
                      <AlertCircle size={12} /> {app.rejection_reason}
                    </p>
                  )}
                </div>

                <div className="card-actions">
                  {isPendingLike && (
                    <>
                      <button
                        className="approve-btn"
                        onClick={() => openApprove(app)}
                        disabled={actingId === app.id}
                      >
                        <CheckCircle size={16} />
                        Approve
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => openReject(app)}
                        disabled={actingId === app.id}
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                    </>
                  )}

                  {app.status === "Approved" && (
                    <button className="expand-btn" onClick={() => toggleSchedule(app)}>
                      {expandedId === app.id ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                      Repayment schedule
                    </button>
                  )}
                </div>

                {expandedId === app.id && (
                  <div className="schedule-wrap">
                    {!schedules[app.id] ? (
                      <p className="schedule-empty">Loading schedule...</p>
                    ) : schedules[app.id].length === 0 ? (
                      <p className="schedule-empty">
                        No schedule found for this loan yet.
                      </p>
                    ) : (
                      <table className="schedule-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Due date</th>
                            <th>Amount due</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedules[app.id].map((row) => (
                            <tr key={row.id || row.installment_number}>
                              <td>{row.installment_number}</td>
                              <td>{row.due_date}</td>
                              <td>{formatKES(row.amount_due)}</td>
                              <td>{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRM MODAL: approve / reject */}
      {confirmModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {confirmModal.type === "approve"
                  ? `Sign off on ${confirmModal.row.member_name}'s loan`
                  : `Reject ${confirmModal.row.member_name}'s application`}
              </h3>
              <button className="modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            {confirmModal.type === "approve" ? (
              <>
                <p className="modal-hint">
                  This records your sign-off as a committee member. Once{" "}
                  {confirmModal.row.required_approvals || DEFAULT_REQUIRED_APPROVALS}{" "}
                  members have signed off, the loan is disbursed automatically.
                </p>
                <input
                  placeholder="Your name"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                />
                <input
                  placeholder="Your role (e.g. Treasurer)"
                  value={approverRole}
                  onChange={(e) => setApproverRole(e.target.value)}
                />
              </>
            ) : (
              <>
                <p className="modal-hint">
                  Let the member know why this application was declined.
                </p>
                <textarea
                  placeholder="Reason for rejection (optional but recommended)"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </>
            )}

            <div className="modal-actions">
              <button className="cancel-btn" onClick={closeModal}>
                Cancel
              </button>
              <button
                className={confirmModal.type === "approve" ? "approve-btn" : "reject-btn"}
                onClick={confirmModal.type === "approve" ? submitApproval : submitRejection}
                disabled={actingId === confirmModal.row.id}
              >
                {actingId === confirmModal.row.id ? (
                  <Loader2 size={16} className="spin" />
                ) : confirmModal.type === "approve" ? (
                  "Confirm sign-off"
                ) : (
                  "Confirm rejection"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}