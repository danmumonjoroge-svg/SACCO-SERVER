import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import {
  Receipt,
  Search,
  DollarSign,
  CheckCircle,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  Users,
  Wallet,
} from "lucide-react";

/**
 * LoanRepayments
 * Jungle-green & gold themed repayment module.
 * CSS is embedded in this file (no external stylesheet needed).
 */

const formatMoney = (value) => `KES ${Number(value || 0).toLocaleString()}`;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
};

const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const HISTORY_PAGE_SIZE = 10;

export default function LoanRepayments({ chamaId }) {
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);

  const [selectedLoan, setSelectedLoan] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [mpesaCode, setMpesaCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [loansRes, repayRes] = await Promise.all([
        supabase
          .from("chama_loans")
          .select("*")
          .eq("chama_id", chamaId)
          .order("created_at", { ascending: false }),

        supabase
          .from("chama_loan_repayments")
          .select("*")
          .eq("chama_id", chamaId)
          .order("created_at", { ascending: false }),
      ]);

      if (loansRes.error) throw loansRes.error;
      if (repayRes.error) throw repayRes.error;

      setLoans(loansRes.data || []);
      setRepayments(repayRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load repayment data. Check your connection and try again.");
    }

    setLoading(false);
  }, [chamaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const loansById = useMemo(() => {
    const map = {};
    loans.forEach((l) => {
      map[l.id] = l;
    });
    return map;
  }, [loans]);

  const activeLoans = useMemo(
    () => loans.filter((loan) => Number(loan.amount_repaid || 0) < Number(loan.amount || 0)),
    [loans]
  );

  const filteredLoans = useMemo(
    () =>
      activeLoans.filter((loan) => (loan.member_name || "").toLowerCase().includes(search.toLowerCase())),
    [activeLoans, search]
  );

  const totalCollections = useMemo(
    () => repayments.reduce((a, b) => a + Number(b.amount || 0), 0),
    [repayments]
  );

  const filteredHistory = useMemo(() => {
    const term = historySearch.toLowerCase();
    return repayments.filter((r) => {
      const loan = loansById[r.loan_id];
      const name = loan?.member_name || "";
      return (
        name.toLowerCase().includes(term) ||
        (r.member_phone || "").toLowerCase().includes(term) ||
        (r.mpesa_code || "").toLowerCase().includes(term)
      );
    });
  }, [repayments, historySearch, loansById]);

  const selected = loans.find((l) => l.id === selectedLoan);
  const selectedBalance = selected
    ? Number(selected.amount || 0) - Number(selected.amount_repaid || 0)
    : 0;

  const paymentAmount = Number(amount);
  const isOverpaying = selected && paymentAmount > selectedBalance && paymentAmount > 0;
  const projectedRepaid = selected ? Number(selected.amount_repaid || 0) + (paymentAmount || 0) : 0;
  const projectedStatus =
    selected && projectedRepaid >= Number(selected.amount || 0) ? "Cleared" : "Active";

  const resetForm = () => {
    setSelectedLoan("");
    setAmount("");
    setPhone("");
    setMpesaCode("");
    setFormError(null);
  };

  const submitRepayment = async (e) => {
    e.preventDefault();
    setFormError(null);

    const loan = loans.find((l) => l.id === selectedLoan);
    if (!loan) {
      setFormError("Select a loan to record a repayment against.");
      return;
    }

    if (!amount || paymentAmount <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }

    setSubmitting(true);

    try {
      const newRepaid = Number(loan.amount_repaid || 0) + paymentAmount;
      const loanAmount = Number(loan.amount || 0);
      const status = newRepaid >= loanAmount ? "Cleared" : "Active";

      const { error: insertError } = await supabase.from("chama_loan_repayments").insert([
        {
          chama_id: chamaId,
          loan_id: loan.id,
          member_phone: phone,
          amount: paymentAmount,
          mpesa_code: mpesaCode,
        },
      ]);

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("chama_loans")
        .update({
          amount_repaid: newRepaid,
          last_payment_date: new Date().toISOString().slice(0, 10),
          status,
        })
        .eq("id", loan.id);

      if (updateError) throw updateError;

      setToast(`${formatMoney(paymentAmount)} recorded for ${loan.member_name}`);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      setFormError(err?.message || "Could not save this repayment. Please try again.");
    }

    setSubmitting(false);
  };

  return (
    <div className="repay-root">
      <style>{CSS}</style>

      <div className="module-header">
        <h2>
          <Receipt size={20} />
          Loan Repayments
        </h2>

        <div className="header-actions">
          <div className="search-box">
            <Search size={15} />
            <input
              placeholder="Search borrower..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="refresh-btn" onClick={loadData} disabled={loading}>
            <RefreshCcw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      <div className="repayment-kpis">
        <div className="mini-card">
          <Users size={16} />
          <span>Active Loans</span>
          <h3>{activeLoans.length}</h3>
        </div>

        <div className="mini-card">
          <Receipt size={16} />
          <span>Repayments</span>
          <h3>{repayments.length}</h3>
        </div>

        <div className="mini-card gold">
          <Wallet size={16} />
          <span>Collections</span>
          <h3>{formatMoney(totalCollections)}</h3>
        </div>
      </div>

      <div className="repayment-form">
        <h3>
          <DollarSign size={18} />
          Record repayment
        </h3>

        <form onSubmit={submitRepayment}>
          <label className="field-label">Loan</label>
          <select
            value={selectedLoan}
            onChange={(e) => {
              setSelectedLoan(e.target.value);
              setFormError(null);
            }}
            disabled={submitting}
            required
          >
            <option value="">Select loan</option>
            {filteredLoans.map((loan) => (
              <option key={loan.id} value={loan.id}>
                {loan.member_name} — {formatMoney(loan.amount)}
              </option>
            ))}
          </select>

          {selected && (
            <div className="loan-preview">
              <div className="loan-preview-row">
                <span>Loan</span>
                <strong>{formatMoney(selected.amount)}</strong>
              </div>
              <div className="loan-preview-row">
                <span>Repaid so far</span>
                <strong>{formatMoney(selected.amount_repaid)}</strong>
              </div>
              <div className="loan-preview-row">
                <span>Balance</span>
                <strong>{formatMoney(selectedBalance)}</strong>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(
                      (Number(selected.amount_repaid || 0) / Number(selected.amount || 1)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>

              {paymentAmount > 0 && (
                <div className={`projection ${projectedStatus === "Cleared" ? "cleared" : ""}`}>
                  After this payment: {formatMoney(Math.min(projectedRepaid, Number(selected.amount)))} repaid
                  <span className={`pill ${projectedStatus === "Cleared" ? "pill-repaid" : "pill-active"}`}>
                    {projectedStatus}
                  </span>
                </div>
              )}

              {isOverpaying && (
                <p className="field-hint error">
                  <AlertTriangle size={12} /> This exceeds the outstanding balance by{" "}
                  {formatMoney(paymentAmount - selectedBalance)}.
                </p>
              )}
            </div>
          )}

          <label className="field-label">Amount paid</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 2000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
            required
          />

          <label className="field-label">Phone</label>
          <input
            placeholder="e.g. 07XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
          />

          <label className="field-label">M-Pesa code</label>
          <input
            placeholder="e.g. QCH7XXXXXX"
            value={mpesaCode}
            onChange={(e) => setMpesaCode(e.target.value)}
            disabled={submitting}
          />

          {formError && (
            <p className="field-hint error">
              <AlertTriangle size={12} /> {formError}
            </p>
          )}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
            {submitting ? "Saving..." : "Save repayment"}
          </button>
        </form>
      </div>

      <div className="repayment-history">
        <div className="history-header">
          <h3>Recent repayments</h3>
          <div className="search-box small">
            <Search size={13} />
            <input
              placeholder="Filter history..."
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryLimit(HISTORY_PAGE_SIZE);
              }}
            />
          </div>
        </div>

        {loading ? (
          <div className="skeleton-list">
            {[...Array(4)].map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : filteredHistory.length === 0 ? (
          <p className="empty-state">No repayments match your search.</p>
        ) : (
          <>
            <div className="history-list">
              {filteredHistory.slice(0, historyLimit).map((payment) => {
                const loan = loansById[payment.loan_id];
                return (
                  <div key={payment.id} className="history-row">
                    <span className="avatar">{getInitials(loan?.member_name || payment.member_phone)}</span>
                    <div className="history-main">
                      <strong>{loan?.member_name || "Unknown member"}</strong>
                      <small>
                        {payment.mpesa_code || "No code"} · {payment.member_phone || "No phone"}
                      </small>
                    </div>
                    <span className="history-amount">{formatMoney(payment.amount)}</span>
                    <span className="history-date">{formatDate(payment.created_at)}</span>
                  </div>
                );
              })}
            </div>

            {filteredHistory.length > historyLimit && (
              <button className="load-more" onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE_SIZE)}>
                Load more
              </button>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="repay-toast">
          <CheckCircle size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.repay-root {
  --jungle-950: #081711;
  --jungle-900: #0d2318;
  --jungle-800: #123321;
  --jungle-700: #1c4a2e;
  --jungle-600: #2a6b3f;
  --jungle-500: #3f8955;
  --gold-600: #a9791f;
  --gold-400: #d4af37;
  --gold-300: #e8c565;
  --gold-100: #f7ecc9;
  --cream: #f4efdf;
  --muted: #8fae96;
  --danger: #e2694f;

  position: relative;
  font-family: 'Work Sans', system-ui, sans-serif;
  color: var(--cream);
  background: var(--jungle-950);
  border-radius: 18px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.repay-root * { box-sizing: border-box; }

.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.module-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: 'Fraunces', serif;
  font-weight: 700;
  font-size: 20px;
  color: var(--gold-300);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 175, 55, 0.2);
  border-radius: 999px;
  padding: 7px 14px;
  color: var(--muted);
}

.search-box.small {
  padding: 5px 12px;
}

.search-box input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--cream);
  font-size: 13px;
  width: 150px;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--gold-400);
  color: var(--jungle-950);
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.refresh-btn:disabled { opacity: 0.6; cursor: default; }

.spin { animation: repay-spin 0.9s linear infinite; }

@keyframes repay-spin {
  to { transform: rotate(360deg); }
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(226, 105, 79, 0.12);
  border: 1px solid rgba(226, 105, 79, 0.4);
  color: #f4c7bb;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
}

.error-banner button {
  margin-left: auto;
  background: transparent;
  border: 1px solid rgba(244, 199, 187, 0.4);
  color: inherit;
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
}

.repayment-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.mini-card {
  background: radial-gradient(120% 140% at 0% 0%, var(--jungle-800), var(--jungle-900));
  border: 1px solid rgba(212, 175, 55, 0.18);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--gold-300);
}

.mini-card span {
  font-size: 12px;
  color: var(--muted);
}

.mini-card h3 {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  color: var(--cream);
}

.mini-card.gold {
  border-color: var(--gold-400);
}

.repayment-form {
  background: linear-gradient(180deg, var(--jungle-900), var(--jungle-950));
  border: 1px solid rgba(212, 175, 55, 0.15);
  border-radius: 16px;
  padding: 20px;
}

.repayment-form h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 16px;
  color: var(--gold-100);
}

.repayment-form form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
}

.field-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 6px;
}

.repayment-form select,
.repayment-form input {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--cream);
  font-size: 13px;
  outline: none;
}

.repayment-form select:focus,
.repayment-form input:focus {
  border-color: var(--gold-400);
}

.repayment-form select option {
  background: var(--jungle-900);
}

.loan-preview {
  background: rgba(212, 175, 55, 0.06);
  border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
}

.loan-preview-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
}

.loan-preview-row strong {
  color: var(--gold-100);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
}

.bar-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--jungle-600), var(--gold-400));
  transition: width 0.6s ease;
}

.projection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--gold-100);
  gap: 8px;
}

.pill {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  border-radius: 999px;
  padding: 3px 9px;
  white-space: nowrap;
}

.pill-active {
  background: rgba(63, 137, 85, 0.2);
  color: #8fdba6;
  border: 1px solid rgba(63, 137, 85, 0.4);
}

.pill-repaid {
  background: rgba(212, 175, 55, 0.15);
  color: var(--gold-300);
  border: 1px solid rgba(212, 175, 55, 0.4);
}

.field-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 2px 0 0;
  font-size: 11px;
}

.field-hint.error { color: #f2a48f; }

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--gold-400);
  color: var(--jungle-950);
  border: none;
  border-radius: 10px;
  padding: 11px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
}

.submit-btn:hover:not(:disabled) { background: var(--gold-300); }
.submit-btn:disabled { opacity: 0.6; cursor: default; }

.repayment-history {
  background: linear-gradient(180deg, var(--jungle-900), var(--jungle-950));
  border: 1px solid rgba(212, 175, 55, 0.15);
  border-radius: 16px;
  padding: 20px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.history-header h3 {
  margin: 0;
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 16px;
  color: var(--gold-100);
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-row {
  height: 46px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(212,175,55,0.05), rgba(212,175,55,0.14), rgba(212,175,55,0.05));
  background-size: 200% 100%;
  animation: repay-shimmer 1.4s ease-in-out infinite;
}

@keyframes repay-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.empty-state {
  text-align: center;
  color: var(--muted);
  padding: 20px 0;
  font-size: 13px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-row {
  display: grid;
  grid-template-columns: auto 1.6fr 1fr auto;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(212, 175, 55, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--jungle-700);
  border: 1px solid rgba(212, 175, 55, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--gold-100);
  flex-shrink: 0;
}

.history-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-main strong {
  font-size: 13px;
  color: var(--cream);
}

.history-main small {
  font-size: 11px;
  color: var(--muted);
}

.history-amount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--gold-300);
  white-space: nowrap;
}

.history-date {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  text-align: right;
}

.load-more {
  display: block;
  margin: 14px auto 0;
  background: transparent;
  border: 1px solid rgba(212, 175, 55, 0.3);
  color: var(--gold-300);
  border-radius: 999px;
  padding: 7px 18px;
  font-size: 12px;
  cursor: pointer;
}

.repay-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--jungle-800);
  border: 1px solid var(--gold-400);
  color: var(--gold-100);
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  animation: repay-toast-in 0.25s ease;
  z-index: 30;
}

@keyframes repay-toast-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 640px) {
  .history-row {
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "avatar main"
      "amount date";
  }
  .history-row .avatar { grid-area: avatar; }
  .history-row .history-main { grid-area: main; }
  .history-row .history-amount { grid-area: amount; }
  .history-row .history-date { grid-area: date; text-align: left; }
}

@media (prefers-reduced-motion: reduce) {
  .spin, .skeleton-row, .repay-toast, .bar-fill {
    animation: none;
    transition: none;
  }
}
`;