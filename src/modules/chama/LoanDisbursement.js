import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import {
  Wallet,
  CheckCircle,
  Building2,
  Search,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";

/**
 * LoanDisbursement
 * Jungle-green & gold themed disbursement module.
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

export default function LoanDisbursement({ chamaId }) {
  const [loans, setLoans] = useState([]);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [loanRes, fundRes] = await Promise.all([
        supabase
          .from("chama_loans")
          .select("*")
          .eq("chama_id", chamaId)
          .eq("disbursed", false),

        supabase.from("chama_fund_movements").select("*").eq("chama_id", chamaId),
      ]);

      if (loanRes.error) throw loanRes.error;
      if (fundRes.error) throw fundRes.error;

      setLoans(loanRes.data || []);
      setFunds(fundRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load disbursement data. Check your connection and try again.");
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

  // Balance per fund source: deposits into a destination add, withdrawals from a source subtract.
  const fundBalances = useMemo(() => {
    const balances = {};
    const touch = (name) => {
      if (!name) return;
      if (!(name in balances)) balances[name] = 0;
    };

    funds.forEach((f) => {
      const amount = Number(f.amount || 0);
      if (f.type === "deposit" && f.to_destination) {
        touch(f.to_destination);
        balances[f.to_destination] += amount;
      }
      if (f.type === "withdrawal" && f.from_source) {
        touch(f.from_source);
        balances[f.from_source] -= amount;
      }
      // Some movements record both sides (transfer) — cover the destination credit too.
      if (f.type === "withdrawal" && f.to_destination) {
        touch(f.to_destination);
        balances[f.to_destination] += amount;
      }
    });

    return balances;
  }, [funds]);

  const sourceOptions = useMemo(() => Object.keys(fundBalances).sort(), [fundBalances]);

  const filteredLoans = useMemo(
    () =>
      loans
        .filter((l) => (l.member_name || "").toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)),
    [loans, search]
  );

  const totalPending = filteredLoans.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  const disburseLoan = async (loan, source) => {
    await supabase.from("chama_fund_movements").insert([
      {
        chama_id: chamaId,
        type: "withdrawal",
        category: "Loan Disbursement",
        amount: loan.amount,
        from_source: source,
        description: `Loan disbursed to ${loan.member_name}`,
      },
    ]);

    const { error: updateError } = await supabase
      .from("chama_loans")
      .update({
        disbursed: true,
        disbursement_date: new Date().toISOString().slice(0, 10),
        disbursement_source: source,
        status: "Active",
      })
      .eq("id", loan.id);

    if (updateError) throw updateError;

    setLoans((prev) => prev.filter((l) => l.id !== loan.id));
    setToast(`${formatMoney(loan.amount)} disbursed to ${loan.member_name}`);
    // Refresh fund balances in the background without blocking the UI.
    loadData();
  };

  return (
    <div className="disb-root">
      <style>{CSS}</style>

      <div className="disb-header">
        <div className="disb-header-title">
          <span className="disb-icon-wrap">
            <Wallet size={18} />
          </span>
          <div>
            <p className="disb-eyebrow">Welfare Fund</p>
            <h2>Loan Disbursement</h2>
          </div>
        </div>

        <div className="disb-header-actions">
          <div className="disb-search">
            <Search size={14} />
            <input
              placeholder="Search member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="disb-refresh" onClick={loadData} disabled={loading}>
            <RefreshCcw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {!loading && filteredLoans.length > 0 && (
        <div className="disb-summary">
          <span>
            <strong>{filteredLoans.length}</strong> loan{filteredLoans.length === 1 ? "" : "s"} awaiting
            disbursement
          </span>
          <span className="disb-summary-amount">{formatMoney(totalPending)}</span>
        </div>
      )}

      {error && (
        <div className="disb-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="disb-skeleton-grid">
          {[...Array(3)].map((_, i) => (
            <div className="disb-skeleton-card" key={i} />
          ))}
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="disb-empty">
          <CheckCircle size={28} />
          <p>All approved loans have been disbursed.</p>
        </div>
      ) : (
        <div className="disb-grid">
          {filteredLoans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              sourceOptions={sourceOptions}
              fundBalances={fundBalances}
              onDisburse={disburseLoan}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className="disb-toast">
          <CheckCircle size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function LoanCard({ loan, sourceOptions, fundBalances, onDisburse }) {
  const [source, setSource] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cardError, setCardError] = useState(null);
  const [touched, setTouched] = useState(false);

  const balance = source ? fundBalances[source] : null;
  const insufficient = source && balance !== undefined && balance < Number(loan.amount || 0);

  const handlePrimaryClick = () => {
    setTouched(true);
    if (!source) return;
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setBusy(true);
    setCardError(null);
    try {
      await onDisburse(loan, source);
    } catch (err) {
      console.error(err);
      setCardError(err?.message || "Disbursement failed. Please try again.");
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="loan-card">
      <div className="loan-card-top">
        <div className="loan-card-who">
          <span className="loan-avatar">{getInitials(loan.member_name)}</span>
          <div>
            <h3>{loan.member_name}</h3>
            <small>Approved · requested {formatDate(loan.created_at)}</small>
          </div>
        </div>
        <h2 className="loan-amount">{formatMoney(loan.amount)}</h2>
      </div>

      <div className="loan-card-body">
        <label htmlFor={`source-${loan.id}`}>Disbursement source</label>

        <div className="select-wrap">
          <Building2 size={14} />
          <select
            id={`source-${loan.id}`}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setTouched(true);
            }}
            disabled={busy}
          >
            <option value="">Select source</option>
            {sourceOptions.map((fund) => (
              <option key={fund} value={fund}>
                {fund} · {formatMoney(fundBalances[fund])}
              </option>
            ))}
          </select>
        </div>

        {touched && !source && <p className="field-hint error">Select a source fund to continue.</p>}
        {insufficient && (
          <p className="field-hint error">
            <AlertTriangle size={12} /> Only {formatMoney(balance)} available in this fund.
          </p>
        )}

        {cardError && (
          <p className="field-hint error">
            <AlertTriangle size={12} /> {cardError}
          </p>
        )}

        {!confirming ? (
          <button className="disburse-btn" onClick={handlePrimaryClick} disabled={busy}>
            <CheckCircle size={16} />
            Disburse loan
          </button>
        ) : (
          <div className="confirm-row">
            <p>
              Confirm disbursing <strong>{formatMoney(loan.amount)}</strong> to{" "}
              <strong>{loan.member_name}</strong> from <strong>{source}</strong>?
            </p>
            <div className="confirm-actions">
              <button className="confirm-btn" onClick={handleConfirm} disabled={busy}>
                {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                {busy ? "Processing..." : "Confirm"}
              </button>
              <button className="cancel-btn" onClick={() => setConfirming(false)} disabled={busy}>
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.disb-root {
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
}

.disb-root * { box-sizing: border-box; }

.disb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 18px;
}

.disb-header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.disb-icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(212, 175, 55, 0.14);
  border: 1px solid rgba(212, 175, 55, 0.3);
  color: var(--gold-300);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.disb-eyebrow {
  margin: 0 0 2px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold-300);
}

.disb-header h2 {
  margin: 0;
  font-family: 'Fraunces', serif;
  font-weight: 700;
  font-size: 21px;
  color: var(--cream);
}

.disb-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.disb-search {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 175, 55, 0.2);
  border-radius: 999px;
  padding: 7px 14px;
  color: var(--muted);
}

.disb-search input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--cream);
  font-size: 13px;
  width: 140px;
}

.disb-refresh {
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

.disb-refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

.spin {
  animation: disb-spin 0.9s linear infinite;
}

@keyframes disb-spin {
  to { transform: rotate(360deg); }
}

.disb-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(212, 175, 55, 0.08);
  border: 1px solid rgba(212, 175, 55, 0.2);
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--gold-100);
  margin-bottom: 16px;
}

.disb-summary strong {
  color: var(--gold-300);
}

.disb-summary-amount {
  font-family: 'JetBrains Mono', monospace;
  color: var(--gold-300);
}

.disb-error {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(226, 105, 79, 0.12);
  border: 1px solid rgba(226, 105, 79, 0.4);
  color: #f4c7bb;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 16px;
}

.disb-error button {
  margin-left: auto;
  background: transparent;
  border: 1px solid rgba(244, 199, 187, 0.4);
  color: inherit;
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
}

.disb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  padding: 40px 0;
  text-align: center;
}

.disb-empty svg {
  color: var(--gold-400);
}

.disb-skeleton-grid, .disb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.disb-skeleton-card {
  height: 190px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(212,175,55,0.05), rgba(212,175,55,0.14), rgba(212,175,55,0.05));
  background-size: 200% 100%;
  animation: disb-shimmer 1.4s ease-in-out infinite;
}

@keyframes disb-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.loan-card {
  background: radial-gradient(120% 140% at 0% 0%, var(--jungle-800), var(--jungle-900));
  border: 1px solid rgba(212, 175, 55, 0.2);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loan-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.loan-card-who {
  display: flex;
  align-items: center;
  gap: 10px;
}

.loan-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--jungle-700);
  border: 1px solid rgba(212, 175, 55, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--gold-100);
  flex-shrink: 0;
}

.loan-card-who h3 {
  margin: 0;
  font-size: 14px;
  color: var(--cream);
}

.loan-card-who small {
  color: var(--muted);
  font-size: 11px;
}

.loan-amount {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px;
  color: var(--gold-300);
  white-space: nowrap;
}

.loan-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loan-card-body label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.select-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 10px;
  padding: 8px 10px;
  color: var(--gold-300);
}

.select-wrap select {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--cream);
  font-size: 13px;
}

.select-wrap select option {
  background: var(--jungle-900);
  color: var(--cream);
}

.field-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 11px;
}

.field-hint.error {
  color: #f2a48f;
}

.disburse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--gold-400);
  color: var(--jungle-950);
  border: none;
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: background 0.15s ease;
}

.disburse-btn:hover:not(:disabled) {
  background: var(--gold-300);
}

.disburse-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.confirm-row {
  background: rgba(212, 175, 55, 0.06);
  border: 1px solid rgba(212, 175, 55, 0.3);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-row p {
  margin: 0;
  font-size: 12px;
  color: var(--cream);
  line-height: 1.4;
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.confirm-btn, .cancel-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  padding: 7px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.confirm-btn {
  background: var(--gold-400);
  color: var(--jungle-950);
  border: none;
}

.confirm-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.cancel-btn {
  background: transparent;
  color: var(--muted);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.disb-toast {
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
  animation: disb-toast-in 0.25s ease;
  z-index: 30;
}

@keyframes disb-toast-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 520px) {
  .disb-header-actions { width: 100%; }
  .disb-search { flex: 1; }
  .disb-search input { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .spin, .disb-skeleton-card, .disb-toast {
    animation: none;
  }
}
`;