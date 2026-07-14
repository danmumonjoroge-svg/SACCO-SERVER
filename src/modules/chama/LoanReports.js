import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  DollarSign,
  Printer,
  Download,
  RefreshCcw,
  Search,
  Leaf,
} from "lucide-react";

/**
 * LoanReports
 * Jungle-green & gold themed loan reporting module.
 * CSS is embedded in this file (no external stylesheet needed).
 */

const money = (v) => `KES ${Number(v || 0).toLocaleString()}`;

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

const daysOverdue = (dueDate) => {
  if (!dueDate) return 0;
  const diff = new Date() - new Date(dueDate);
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

const COLLECTIONS_PAGE_SIZE = 10;

export default function LoanReports({ chamaId }) {
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collectionsSearch, setCollectionsSearch] = useState("");
  const [collectionsLimit, setCollectionsLimit] = useState(COLLECTIONS_PAGE_SIZE);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [loanRes, repaymentRes] = await Promise.all([
        supabase.from("chama_loans").select("*").eq("chama_id", chamaId),
        supabase.from("chama_loan_repayments").select("*").eq("chama_id", chamaId),
      ]);

      if (loanRes.error) throw loanRes.error;
      if (repaymentRes.error) throw repaymentRes.error;

      setLoans(loanRes.data || []);
      setRepayments(repaymentRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load report data. Check your connection and try again.");
    }

    setLoading(false);
  }, [chamaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loansById = useMemo(() => {
    const map = {};
    loans.forEach((l) => {
      map[l.id] = l;
    });
    return map;
  }, [loans]);

  const metrics = useMemo(() => {
    const issued = loans.reduce((a, b) => a + Number(b.amount || 0), 0);
    const repaid = loans.reduce((a, b) => a + Number(b.amount_repaid || 0), 0);
    const outstanding = issued - repaid;
    const interest = loans.reduce((a, b) => a + Number(b.interest_amount || 0), 0);
    const penalties = loans.reduce((a, b) => a + Number(b.penalties || 0), 0);
    const recoveryRate = issued > 0 ? ((repaid / issued) * 100).toFixed(1) : 0;

    return { issued, repaid, outstanding, interest, penalties, recoveryRate };
  }, [loans]);

  const overdueLoans = useMemo(() => {
    return loans
      .filter(
        (loan) =>
          loan.due_date &&
          new Date(loan.due_date) < new Date() &&
          Number(loan.amount_repaid || 0) < Number(loan.amount || 0)
      )
      .sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date));
  }, [loans]);

  const topBorrowers = useMemo(() => {
    return [...loans].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 10);
  }, [loans]);

  const maxBorrowed = topBorrowers.length ? Number(topBorrowers[0].amount || 0) : 0;

  const monthlyCollections = useMemo(() => {
    const buckets = {};
    repayments.forEach((r) => {
      if (!r.created_at) return;
      const d = new Date(r.created_at);
      const key = d.toLocaleDateString("en-KE", { month: "short", year: "2-digit" });
      buckets[key] = (buckets[key] || 0) + Number(r.amount || 0);
    });
    const entries = Object.entries(buckets);
    const max = entries.length ? Math.max(...entries.map(([, v]) => v)) : 0;
    return { entries, max };
  }, [repayments]);

  const filteredCollections = useMemo(() => {
    const term = collectionsSearch.toLowerCase();
    return repayments
      .filter((p) => {
        const loan = loansById[p.loan_id];
        const name = loan?.member_name || "";
        return (
          name.toLowerCase().includes(term) ||
          (p.member_phone || "").toLowerCase().includes(term) ||
          (p.mpesa_code || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [repayments, collectionsSearch, loansById]);

  const printReport = () => window.print();

  const exportCsv = () => {
    const rows = [
      ["Member", "Loan amount", "Repaid", "Balance", "Due date", "Status"],
      ...loans.map((l) => {
        const balance = Number(l.amount || 0) - Number(l.amount_repaid || 0);
        const status = balance <= 0 ? "Repaid" : daysOverdue(l.due_date) > 0 ? "Overdue" : "Active";
        return [l.member_name, l.amount, l.amount_repaid, balance, l.due_date || "", status];
      }),
    ];

    const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `loan-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-root">
      <style>{CSS}</style>

      <div className="reports-header">
        <div>
          <p className="reports-eyebrow">Welfare Fund</p>
          <h2>
            <BarChart3 size={22} />
            Loan Reports
          </h2>
          <p className="reports-sub">Credit portfolio analytics & performance</p>
        </div>

        <div className="reports-actions">
          <button onClick={loadData} className="ghost-btn" disabled={loading}>
            <RefreshCcw size={15} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button onClick={exportCsv} className="ghost-btn" disabled={loading || loans.length === 0}>
            <Download size={15} />
            Export CSV
          </button>
          <button onClick={printReport} className="print-btn">
            <Printer size={16} />
            Print
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

      {loading ? (
        <div className="skeleton-grid">
          {[...Array(4)].map((_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="report-kpis">
            <div className="report-card">
              <CreditCard size={20} />
              <span>Total Portfolio</span>
              <h3>{money(metrics.issued)}</h3>
            </div>

            <div className="report-card">
              <TrendingUp size={20} />
              <span>Repaid</span>
              <h3>{money(metrics.repaid)}</h3>
            </div>

            <div className="report-card danger">
              <AlertTriangle size={20} />
              <span>Outstanding</span>
              <h3>{money(metrics.outstanding)}</h3>
            </div>

            <div className="report-card gold">
              <DollarSign size={20} />
              <span>Recovery Rate</span>
              <h3>{metrics.recoveryRate}%</h3>
              <div className="kpi-bar-track">
                <div
                  className="kpi-bar-fill"
                  style={{ width: `${Math.min(metrics.recoveryRate, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="report-panel">
            <h3>Portfolio summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <span>Interest earned</span>
                <strong>{money(metrics.interest)}</strong>
              </div>
              <div className="summary-item">
                <span>Penalties</span>
                <strong>{money(metrics.penalties)}</strong>
              </div>
              <div className="summary-item">
                <span>Total loans</span>
                <strong>{loans.length}</strong>
              </div>
              <div className="summary-item">
                <span>Repayments</span>
                <strong>{repayments.length}</strong>
              </div>
            </div>
          </div>

          <div className="report-panel">
            <h3>Monthly collections trend</h3>
            {monthlyCollections.entries.length === 0 ? (
              <p className="empty-state">Not enough data yet to chart a trend.</p>
            ) : (
              <div className="trend-chart">
                {monthlyCollections.entries.map(([label, value]) => (
                  <div className="trend-row" key={label}>
                    <span className="trend-label">{label}</span>
                    <div className="bar-track wide">
                      <div
                        className="bar-fill"
                        style={{
                          width: monthlyCollections.max ? `${(value / monthlyCollections.max) * 100}%` : "0%",
                        }}
                      />
                    </div>
                    <span className="trend-value">{money(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="report-panel">
            <div className="panel-title-row">
              <h3>Overdue loans</h3>
              {overdueLoans.length > 0 && <span className="count-pill danger">{overdueLoans.length}</span>}
            </div>

            {overdueLoans.length === 0 ? (
              <p className="empty-state good">No overdue loans. Portfolio is healthy.</p>
            ) : (
              <div className="report-list">
                {overdueLoans.map((loan) => {
                  const overdue = daysOverdue(loan.due_date);
                  const balance = Number(loan.amount || 0) - Number(loan.amount_repaid || 0);
                  const severity = overdue > 30 ? "high" : overdue > 7 ? "mid" : "low";
                  return (
                    <div key={loan.id} className="report-row overdue-row">
                      <span className="avatar">{getInitials(loan.member_name)}</span>
                      <div className="overdue-main">
                        <strong>{loan.member_name}</strong>
                        <small>Due {formatDate(loan.due_date)}</small>
                      </div>
                      <span className="muted">{money(balance)} balance</span>
                      <span className={`severity-pill ${severity}`}>{overdue}d overdue</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="report-panel">
            <h3>Top borrowers</h3>
            {topBorrowers.length === 0 ? (
              <p className="empty-state">No loans issued yet.</p>
            ) : (
              <div className="report-list">
                {topBorrowers.map((borrower, index) => {
                  const pct = maxBorrowed ? (Number(borrower.amount || 0) / maxBorrowed) * 100 : 0;
                  return (
                    <div key={borrower.id} className="report-row borrower-row">
                      {index < 3 ? (
                        <span className={`leaf-badge rank-${index + 1}`}>
                          <Leaf size={14} />
                          <em>{index + 1}</em>
                        </span>
                      ) : (
                        <span className="rank-num">{index + 1}</span>
                      )}
                      <span className="avatar small">{getInitials(borrower.member_name)}</span>
                      <div className="borrower-main">
                        <strong>{borrower.member_name}</strong>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="borrower-amount">{money(borrower.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="report-panel">
            <div className="panel-title-row">
              <h3>Recent collections</h3>
              <div className="search-box">
                <Search size={13} />
                <input
                  placeholder="Filter collections..."
                  value={collectionsSearch}
                  onChange={(e) => {
                    setCollectionsSearch(e.target.value);
                    setCollectionsLimit(COLLECTIONS_PAGE_SIZE);
                  }}
                />
              </div>
            </div>

            {filteredCollections.length === 0 ? (
              <p className="empty-state">No collections match your search.</p>
            ) : (
              <>
                <div className="report-list">
                  {filteredCollections.slice(0, collectionsLimit).map((payment) => {
                    const loan = loansById[payment.loan_id];
                    return (
                      <div key={payment.id} className="report-row">
                        <span className="avatar small">{getInitials(loan?.member_name || payment.member_phone)}</span>
                        <div className="collection-main">
                          <strong>{loan?.member_name || "Unknown member"}</strong>
                          <small>
                            {payment.mpesa_code || "No code"} · {payment.member_phone || "No phone"}
                          </small>
                        </div>
                        <span className="muted">{formatDate(payment.created_at)}</span>
                        <span className="collection-amount">{money(payment.amount)}</span>
                      </div>
                    );
                  })}
                </div>

                {filteredCollections.length > collectionsLimit && (
                  <button className="load-more" onClick={() => setCollectionsLimit((n) => n + COLLECTIONS_PAGE_SIZE)}>
                    Load more
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.reports-root {
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

  font-family: 'Work Sans', system-ui, sans-serif;
  color: var(--cream);
  background: var(--jungle-950);
  border-radius: 18px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.reports-root * { box-sizing: border-box; }

.reports-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.reports-eyebrow {
  margin: 0 0 2px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gold-300);
}

.reports-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: 'Fraunces', serif;
  font-weight: 700;
  font-size: 22px;
  color: var(--cream);
}

.reports-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.reports-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ghost-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(212, 175, 55, 0.3);
  color: var(--gold-300);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}

.ghost-btn:disabled { opacity: 0.5; cursor: default; }

.print-btn {
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

.spin { animation: rep-spin 0.9s linear infinite; }

@keyframes rep-spin {
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

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
}

.skeleton-card {
  height: 90px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(212,175,55,0.05), rgba(212,175,55,0.14), rgba(212,175,55,0.05));
  background-size: 200% 100%;
  animation: rep-shimmer 1.4s ease-in-out infinite;
}

@keyframes rep-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.report-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
}

.report-card {
  background: radial-gradient(120% 140% at 0% 0%, var(--jungle-800), var(--jungle-900));
  border: 1px solid rgba(212, 175, 55, 0.18);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--gold-300);
}

.report-card span { font-size: 12px; color: var(--muted); }

.report-card h3 {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  color: var(--cream);
}

.report-card.danger { border-color: rgba(226, 105, 79, 0.4); color: var(--danger); }
.report-card.gold { border-color: var(--gold-400); }

.kpi-bar-track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-top: 4px;
}

.kpi-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--jungle-600), var(--gold-400));
  border-radius: 999px;
  transition: width 0.6s ease;
}

.report-panel {
  background: linear-gradient(180deg, var(--jungle-900), var(--jungle-950));
  border: 1px solid rgba(212, 175, 55, 0.15);
  border-radius: 16px;
  padding: 20px;
}

.report-panel h3 {
  margin: 0 0 14px;
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 16px;
  color: var(--gold-100);
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.panel-title-row h3 { margin: 0; }

.count-pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  border-radius: 999px;
  padding: 3px 10px;
}

.count-pill.danger {
  background: rgba(226, 105, 79, 0.15);
  color: #f2a48f;
  border: 1px solid rgba(226, 105, 79, 0.4);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 14px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}

.summary-item strong {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  color: var(--gold-100);
}

.trend-chart, .report-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trend-row {
  display: grid;
  grid-template-columns: 60px 1fr 110px;
  align-items: center;
  gap: 12px;
}

.trend-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--muted);
}

.trend-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--gold-100);
  text-align: right;
}

.bar-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.bar-track.wide { width: 100%; }

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--jungle-600), var(--gold-400));
  transition: width 0.6s ease;
}

.empty-state {
  text-align: center;
  color: var(--muted);
  padding: 16px 0;
  font-size: 13px;
  margin: 0;
}

.empty-state.good { color: #8fdba6; }

.report-row {
  display: grid;
  grid-template-columns: auto 1.6fr auto auto;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(212, 175, 55, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
}

.avatar {
  width: 34px;
  height: 34px;
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

.avatar.small { width: 28px; height: 28px; font-size: 10px; }

.overdue-main, .collection-main, .borrower-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.overdue-main strong, .collection-main strong, .borrower-main strong {
  font-size: 13px;
  color: var(--cream);
}

.overdue-main small, .collection-main small {
  font-size: 11px;
  color: var(--muted);
}

.muted { color: var(--muted); font-size: 12px; white-space: nowrap; }

.severity-pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  border-radius: 999px;
  padding: 4px 10px;
  white-space: nowrap;
}

.severity-pill.low {
  background: rgba(232, 197, 101, 0.15);
  color: var(--gold-300);
  border: 1px solid rgba(232, 197, 101, 0.4);
}

.severity-pill.mid {
  background: rgba(226, 150, 79, 0.15);
  color: #f2c48f;
  border: 1px solid rgba(226, 150, 79, 0.4);
}

.severity-pill.high {
  background: rgba(226, 105, 79, 0.18);
  color: #f2a48f;
  border: 1px solid rgba(226, 105, 79, 0.5);
}

.leaf-badge {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--jungle-950);
  flex-shrink: 0;
}

.leaf-badge em {
  position: absolute;
  font-style: normal;
  font-family: 'Fraunces', serif;
  font-weight: 700;
  font-size: 10px;
}

.leaf-badge svg { position: absolute; opacity: 0.9; }

.leaf-badge.rank-1 { background: radial-gradient(circle at 30% 30%, var(--gold-300), var(--gold-600)); }
.leaf-badge.rank-2 { background: radial-gradient(circle at 30% 30%, #d9d9d9, #9a9a9a); }
.leaf-badge.rank-3 { background: radial-gradient(circle at 30% 30%, #cf9a63, #9c6a37); }

.rank-num {
  width: 28px;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
}

.borrower-row, .overdue-row {
  grid-template-columns: auto auto 1.6fr auto;
}

.borrower-amount, .collection-amount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--gold-300);
  white-space: nowrap;
  text-align: right;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 175, 55, 0.2);
  border-radius: 999px;
  padding: 6px 12px;
  color: var(--muted);
}

.search-box input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--cream);
  font-size: 13px;
  width: 150px;
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

@media (max-width: 640px) {
  .report-row, .borrower-row, .overdue-row {
    grid-template-columns: auto 1fr;
    row-gap: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin, .skeleton-card, .bar-fill, .kpi-bar-fill {
    animation: none;
    transition: none;
  }
}

@media print {
  .reports-root {
    background: #ffffff !important;
    color: #1a1a1a !important;
    padding: 0;
  }
  .reports-actions, .search-box, .load-more { display: none !important; }
  .report-card, .report-panel {
    background: #ffffff !important;
    border: 1px solid #ccc !important;
    color: #1a1a1a !important;
    break-inside: avoid;
  }
  .report-card h3, .report-panel h3, .reports-header h2, .summary-item strong,
  .trend-value, .borrower-amount, .collection-amount { color: #1a1a1a !important; }
  .muted, .reports-sub, .reports-eyebrow, .trend-label { color: #555 !important; }
  .bar-fill, .kpi-bar-fill { background: #999 !important; }
  .avatar, .leaf-badge, .rank-num { color: #1a1a1a !important; }
}
`;