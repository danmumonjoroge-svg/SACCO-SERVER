import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import {
  Send,
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  FileText,
  RefreshCcw,
  AlertTriangle,
  Smartphone,
  Banknote,
  Coins,
} from "lucide-react";
import "./ChamasendContributions.css";

/* ================= CONSTANTS ================= */
const PAGE_SIZE = 8;

const CONTRIBUTION_TYPES = [
  { value: "monthly_savings", label: "Monthly Savings" },
  { value: "loan_repayment", label: "Loan Repayment" },
  { value: "welfare", label: "Welfare" },
  { value: "shares", label: "Shares" },
  { value: "fine", label: "Fine" },
];

const PAYMENT_METHODS = [
  { value: "MPESA", label: "M-Pesa", icon: Smartphone },
  { value: "BANK", label: "Bank Transfer", icon: Banknote },
  { value: "CASH", label: "Cash", icon: Coins },
];

const STATUS_FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED"];

const currency = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});
const formatKES = (val) => currency.format(Number(val) || 0);
const toNumber = (val) => Number(val) || 0;

const emptyForm = () => ({
  amount: "",
  contribution_type: "monthly_savings",
  payment_method: "MPESA",
  reference: "",
  notes: "",
});

const statusMeta = {
  PENDING: { icon: Clock, label: "Pending" },
  APPROVED: { icon: CheckCircle, label: "Approved" },
  COMPLETED: { icon: CheckCircle, label: "Completed" },
  REJECTED: { icon: XCircle, label: "Rejected" },
};

const StatusBadge = ({ status }) => {
  const meta = statusMeta[status] || { icon: Clock, label: status };
  const Icon = meta.icon;
  return (
    <span className={`status-badge status-${(status || "").toLowerCase()}`}>
      <Icon size={12} />
      {meta.label}
    </span>
  );
};

export default function ChamaSendContribution({ chamaId, user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);

  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  /* ================= FETCH ================= */
  const fetchHistory = useCallback(
    async (isRefresh = false) => {
      if (!chamaId || !user?.id) return;

      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("chama_contribution_requests")
        .select("*")
        .eq("chama_id", chamaId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (err) {
        setError(err.message || "Could not load your contribution history.");
      } else {
        setHistory(data || []);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [chamaId, user?.id]
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /* ================= SUMMARY ================= */
  const summary = useMemo(() => {
    const approved = history.filter((h) => ["APPROVED", "COMPLETED"].includes(h.status));
    const pending = history.filter((h) => h.status === "PENDING");

    const now = new Date();
    const thisMonth = history.filter((h) => {
      if (!h.created_at) return false;
      const d = new Date(h.created_at);
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear() &&
        ["APPROVED", "COMPLETED"].includes(h.status)
      );
    });

    return {
      totalApproved: approved.reduce((s, h) => s + toNumber(h.amount), 0),
      pendingAmount: pending.reduce((s, h) => s + toNumber(h.amount), 0),
      pendingCount: pending.length,
      monthTotal: thisMonth.reduce((s, h) => s + toNumber(h.amount), 0),
      totalCount: history.length,
    };
  }, [history]);

  /* ================= FILTER + PAGINATION ================= */
  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return history;
    return history.filter((h) => h.status === statusFilter);
  }, [history, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const changeStatusFilter = (s) => {
    setStatusFilter(s);
    setPage(1);
  };

  /* ================= FORM ================= */
  const updateForm = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFormError(null);
  };

  const requiresReference = form.payment_method !== "CASH";

  const validate = () => {
    if (!form.amount || Number(form.amount) <= 0) return "Enter a valid amount";
    if (requiresReference && !form.reference.trim())
      return `Enter the ${form.payment_method === "MPESA" ? "M-Pesa" : "bank"} transaction reference`;
    return null;
  };

  const submitContribution = async () => {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setBanner(null);

    try {
      const { error: insertError } = await supabase
        .from("chama_contribution_requests")
        .insert([
          {
            chama_id: chamaId,
            user_id: user.id,
            amount: Number(form.amount),
            contribution_type: form.contribution_type,
            payment_method: form.payment_method,
            reference: form.reference || null,
            notes: form.notes || null,
            status: "PENDING",
          },
        ]);

      if (insertError) throw insertError;

      setBanner({ type: "success", text: "Contribution submitted and awaiting approval." });
      setForm(emptyForm());
      fetchHistory(true);
    } catch (err2) {
      setBanner({ type: "error", text: err2.message || "Could not submit contribution." });
    }

    setSubmitting(false);
  };

  const typeLabel = (value) =>
    CONTRIBUTION_TYPES.find((t) => t.value === value)?.label || value;

  const methodIcon = (value) => {
    const m = PAYMENT_METHODS.find((pm) => pm.value === value);
    const Icon = m?.icon || Wallet;
    return <Icon size={14} />;
  };

  /* ================= RENDER ================= */
  return (
    <div className="contribution-page">
      {/* HEADER */}
      <div className="contribution-header">
        <div className="contribution-title">
          <span className="title-icon">
            <Send size={18} />
          </span>
          <div>
            <h2>Send a Contribution</h2>
            <p className="subtitle">Submit and track your payments to the chama.</p>
          </div>
        </div>

        <button className="refresh-btn" onClick={() => fetchHistory(true)} disabled={loading || refreshing}>
          <RefreshCcw size={14} className={refreshing ? "spin" : ""} />
          Refresh
        </button>
      </div>

      {banner && (
        <div className={`page-banner ${banner.type === "success" ? "banner-success" : "banner-error"}`}>
          {banner.text}
        </div>
      )}

      {/* SUMMARY */}
      <div className="summary-grid">
        <div className="summary-card tone-green">
          <span className="summary-icon">
            <Wallet size={18} />
          </span>
          <div>
            <h4>Total Contributed</h4>
            <h2>{formatKES(summary.totalApproved)}</h2>
          </div>
        </div>

        <div className="summary-card tone-amber">
          <span className="summary-icon">
            <Clock size={18} />
          </span>
          <div>
            <h4>Pending ({summary.pendingCount})</h4>
            <h2>{formatKES(summary.pendingAmount)}</h2>
          </div>
        </div>

        <div className="summary-card tone-gold">
          <span className="summary-icon">
            <TrendingUp size={18} />
          </span>
          <div>
            <h4>This Month</h4>
            <h2>{formatKES(summary.monthTotal)}</h2>
          </div>
        </div>

        <div className="summary-card tone-ink">
          <span className="summary-icon">
            <FileText size={18} />
          </span>
          <div>
            <h4>Total Transactions</h4>
            <h2>{summary.totalCount}</h2>
          </div>
        </div>
      </div>

      {/* FORM */}
      <div className="contribution-card">
        <h3>Submit Contribution</h3>

        {formError && (
          <div className="form-error">
            <AlertTriangle size={14} />
            {formError}
          </div>
        )}

        <div className="form-grid">
          <div className="form-control">
            <label>Amount (KES)</label>
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={(e) => updateForm("amount", e.target.value)}
              placeholder="e.g. 2000"
            />
          </div>

          <div className="form-control">
            <label>Contribution Type</label>
            <select
              value={form.contribution_type}
              onChange={(e) => updateForm("contribution_type", e.target.value)}
            >
              {CONTRIBUTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-control">
            <label>Payment Method</label>
            <div className="method-toggle">
              {PAYMENT_METHODS.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    type="button"
                    key={m.value}
                    className={`method-btn ${form.payment_method === m.value ? "active" : ""}`}
                    onClick={() => updateForm("payment_method", m.value)}
                  >
                    <Icon size={14} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-control">
            <label>
              {form.payment_method === "MPESA" ? "M-Pesa Code" : "Transaction Reference"}
              {requiresReference ? "" : " (optional)"}
            </label>
            <input
              value={form.reference}
              onChange={(e) => updateForm("reference", e.target.value)}
              placeholder={form.payment_method === "MPESA" ? "e.g. QFT7X8YABC" : "Reference / receipt no."}
            />
          </div>

          <div className="form-control span-2">
            <label>Notes (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => updateForm("notes", e.target.value)}
              placeholder="Anything the treasurer should know"
            />
          </div>
        </div>

        <button className="submit-btn" onClick={submitContribution} disabled={submitting}>
          <Send size={18} /> {submitting ? "Submitting..." : "Submit Contribution"}
        </button>
      </div>

      {/* HISTORY */}
      <div className="history-card">
        <div className="history-header">
          <h3>Your Contribution History</h3>
          <div className="status-filters">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                className={`filter-chip ${statusFilter === s ? "active" : ""}`}
                onClick={() => changeStatusFilter(s)}
              >
                {s === "ALL" ? "All" : statusMeta[s]?.label || s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="page-banner banner-error">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div className="skeleton-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="empty-state">
            <FileText size={26} />
            <p>No contributions {statusFilter !== "ALL" ? `with status "${statusFilter}"` : "yet"}.</p>
          </div>
        ) : (
          <>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((row) => (
                  <tr key={row.id}>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</td>
                    <td>{typeLabel(row.contribution_type)}</td>
                    <td className="method-cell">
                      {methodIcon(row.payment_method)}
                      {row.payment_method}
                    </td>
                    <td className="ref-cell">{row.reference || "-"}</td>
                    <td className="num">{formatKES(row.amount)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="pagination-controls">
                <button disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Prev
                </button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}