import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";

import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Receipt,
  BarChart3,
  Search,
  RefreshCcw,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  ArrowUpDown,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

/**
 * ChamaLoansDashboard
 * Jungle-green & gold themed loan management dashboard.
 *
 * IMPORTANT — CSS ISOLATION:
 * This app has many similarly named global stylesheets (ChamaLoans.css,
 * LoanApplications.css, chamaStyles.css, ChamaWelfare.css...). Generic
 * class names like `.sidebar`, `.panel`, `.avatar`, `.pill` are prime
 * candidates for collisions between those files, which is why a sidebar
 * kept appearing even after the internal nav was removed — it wasn't
 * being rendered by this component at all, it was leaking in from a
 * global class name defined elsewhere.
 *
 * Every class below is prefixed with `cld-` (ChamaLoansDashboard) and
 * nested under a single `.cld-root` ancestor, so this component cannot
 * be affected by outside CSS and cannot leak styles onto anything else.
 * There is no sidebar markup anywhere in this file — navigation between
 * Dashboard / Applications / Active Loans / Repayments / Reports is a
 * horizontal tab bar (`.cld-tabs`), rendered inline in the page.
 */

const STATUS = {
  ACTIVE: "Active",
  OVERDUE: "Overdue",
  REPAID: "Repaid",
};

export default function ChamaLoansDashboard({ chamaId }) {
  const [activeTab, setActiveTab] = useState("dashboard");

  const [loans, setLoans] = useState([]);
  const [applications, setApplications] = useState([]);
  const [repayments, setRepayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortConfig, setSortConfig] = useState({ key: "amount", dir: "desc" });
  const [actionBusyId, setActionBusyId] = useState(null);

  const formatMoney = (value) => `KES ${Number(value || 0).toLocaleString()}`;

  const formatDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getLoanStatus = (loan) => {
    const balance = Number(loan.amount || 0) - Number(loan.amount_repaid || 0);
    if (balance <= 0) return STATUS.REPAID;
    if (loan.due_date && new Date(loan.due_date) < new Date()) return STATUS.OVERDUE;
    return STATUS.ACTIVE;
  };

  const getInitials = (name = "") =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [loansRes, applicationsRes, repaymentsRes] = await Promise.all([
        supabase.from("chama_loans").select("*").eq("chama_id", chamaId),
        supabase.from("chama_loan_applications").select("*").eq("chama_id", chamaId),
        supabase.from("chama_loan_repayments").select("*").eq("chama_id", chamaId),
      ]);

      if (loansRes.error) throw loansRes.error;
      if (applicationsRes.error) throw applicationsRes.error;
      if (repaymentsRes.error) throw repaymentsRes.error;

      setLoans(loansRes.data || []);
      setApplications(applicationsRes.data || []);
      setRepayments(repaymentsRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load loan data. Check your connection and try again.");
    }

    setLoading(false);
  }, [chamaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const totalIssued = loans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
    const totalRepaid = loans.reduce((sum, loan) => sum + Number(loan.amount_repaid || 0), 0);
    const outstanding = totalIssued - totalRepaid;
    const pendingApplications = applications.filter((a) => a.status === "Pending").length;
    const activeLoans = loans.filter((l) => getLoanStatus(l) === STATUS.ACTIVE).length;
    const overdueLoans = loans.filter((l) => getLoanStatus(l) === STATUS.OVERDUE).length;
    const recoveryRate = totalIssued > 0 ? ((totalRepaid / totalIssued) * 100).toFixed(1) : 0;

    return {
      totalIssued,
      totalRepaid,
      outstanding,
      pendingApplications,
      activeLoans,
      overdueLoans,
      recoveryRate,
    };
  }, [loans, applications]);

  const filteredLoans = useMemo(() => {
    let rows = loans.filter((loan) =>
      (loan.member_name || "").toLowerCase().includes(search.toLowerCase())
    );

    if (statusFilter !== "All") {
      rows = rows.filter((loan) => getLoanStatus(loan) === statusFilter);
    }

    rows = [...rows].sort((a, b) => {
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      if (sortConfig.key === "member_name") {
        return (a.member_name || "").localeCompare(b.member_name || "") * dir;
      }
      if (sortConfig.key === "due_date") {
        return (new Date(a.due_date || 0) - new Date(b.due_date || 0)) * dir;
      }
      if (sortConfig.key === "balance") {
        const balA = Number(a.amount || 0) - Number(a.amount_repaid || 0);
        const balB = Number(b.amount || 0) - Number(b.amount_repaid || 0);
        return (balA - balB) * dir;
      }
      return (Number(a.amount || 0) - Number(b.amount || 0)) * dir;
    });

    return rows;
  }, [loans, search, statusFilter, sortConfig]);

  const dashboardLoans = filteredLoans.slice(0, 6);

  const filteredApplications = useMemo(
    () =>
      applications.filter((a) =>
        (a.member_name || "").toLowerCase().includes(search.toLowerCase())
      ),
    [applications, search]
  );

  const filteredRepayments = useMemo(
    () =>
      repayments
        .filter((r) => (r.member_name || "").toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0)),
    [repayments, search]
  );

  const monthlyRepayments = useMemo(() => {
    const buckets = {};
    repayments.forEach((r) => {
      if (!r.paid_at) return;
      const d = new Date(r.paid_at);
      const key = d.toLocaleDateString("en-KE", { month: "short", year: "2-digit" });
      buckets[key] = (buckets[key] || 0) + Number(r.amount || 0);
    });
    const entries = Object.entries(buckets);
    const max = entries.length ? Math.max(...entries.map(([, v]) => v)) : 0;
    return { entries, max };
  }, [repayments]);

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const handleApplicationAction = async (application, nextStatus) => {
    setActionBusyId(application.id);
    try {
      const { error: updateError } = await supabase
        .from("chama_loan_applications")
        .update({ status: nextStatus })
        .eq("id", application.id);
      if (updateError) throw updateError;
      setApplications((prev) =>
        prev.map((a) => (a.id === application.id ? { ...a, status: nextStatus } : a))
      );
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not update the application status.");
    }
    setActionBusyId(null);
  };

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "applications", label: "Applications", icon: FileText, badge: metrics.pendingApplications },
    { key: "loans", label: "Active Loans", icon: CreditCard, badge: metrics.activeLoans },
    { key: "repayments", label: "Repayments", icon: Receipt },
    { key: "reports", label: "Reports", icon: BarChart3 },
  ];

  const statusPillClass = (status) => {
    if (status === STATUS.REPAID) return "cld-pill cld-pill-repaid";
    if (status === STATUS.OVERDUE) return "cld-pill cld-pill-overdue";
    return "cld-pill cld-pill-active";
  };

  const SortButton = ({ column, label }) => (
    <button className="cld-sort-btn" onClick={() => toggleSort(column)} type="button">
      {label}
      <ArrowUpDown size={12} className={sortConfig.key === column ? "cld-sort-active" : ""} />
    </button>
  );

  const Skeleton = () => (
    <div className="cld-skeleton-list">
      {[...Array(4)].map((_, i) => (
        <div className="cld-skeleton-row" key={i} />
      ))}
    </div>
  );

  return (
    <div className="cld-root">
      <style>{CSS}</style>

      <div className="cld-header">
        <div>
          <p className="cld-header-eyebrow">Chama Credit Information System</p>
          <h1 className="cld-header-title">Loan Portfolio</h1>
          <p className="cld-header-sub">Applications, approvals, disbursements &amp; repayments</p>
        </div>

        <div className="cld-header-actions">
          <div className="cld-search-box">
            <Search size={15} />
            <input
              placeholder="Search member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button className="cld-refresh-btn" onClick={loadData} disabled={loading} type="button">
            <RefreshCcw size={15} className={loading ? "cld-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <nav className="cld-tabs" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`cld-tab-btn ${activeTab === tab.key ? "cld-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={16} />
              {tab.label}
              {!!tab.badge && <span className="cld-tab-badge">{tab.badge}</span>}
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="cld-error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={loadData} type="button">Retry</button>
        </div>
      )}

      <div className="cld-content">
        {activeTab === "dashboard" && (
          <>
            <div className="cld-kpi-grid">
              <div className="cld-kpi-card">
                <TrendingUp size={20} />
                <span>Total Portfolio</span>
                <h2>{formatMoney(metrics.totalIssued)}</h2>
              </div>

              <div className="cld-kpi-card">
                <CheckCircle size={20} />
                <span>Repaid</span>
                <h2>{formatMoney(metrics.totalRepaid)}</h2>
              </div>

              <div className="cld-kpi-card cld-danger">
                <AlertTriangle size={20} />
                <span>Outstanding</span>
                <h2>{formatMoney(metrics.outstanding)}</h2>
              </div>

              <div className="cld-kpi-card">
                <Clock size={20} />
                <span>Pending Apps</span>
                <h2>{metrics.pendingApplications}</h2>
              </div>

              <div className="cld-kpi-card">
                <CreditCard size={20} />
                <span>Active Loans</span>
                <h2>{metrics.activeLoans}</h2>
              </div>

              <div className={`cld-kpi-card ${metrics.overdueLoans > 0 ? "cld-danger" : ""}`}>
                <AlertTriangle size={20} />
                <span>Overdue Loans</span>
                <h2>{metrics.overdueLoans}</h2>
              </div>

              <div className="cld-kpi-card cld-gold">
                <BarChart3 size={20} />
                <span>Recovery Rate</span>
                <h2>{metrics.recoveryRate}%</h2>
                <div className="cld-kpi-bar-track">
                  <div className="cld-kpi-bar-fill" style={{ width: `${Math.min(metrics.recoveryRate, 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="cld-panel">
              <div className="cld-panel-title-row">
                <div className="cld-panel-title">Recent Loans</div>
                <button className="cld-link-btn" onClick={() => setActiveTab("loans")} type="button">
                  View all
                </button>
              </div>

              {loading ? (
                <Skeleton />
              ) : dashboardLoans.length === 0 ? (
                <p className="cld-empty-state">No loans match your search.</p>
              ) : (
                <div className="cld-loan-list">
                  {dashboardLoans.map((loan) => {
                    const balance = Number(loan.amount || 0) - Number(loan.amount_repaid || 0);
                    const status = getLoanStatus(loan);
                    const pct = Number(loan.amount)
                      ? Math.min((Number(loan.amount_repaid || 0) / Number(loan.amount)) * 100, 100)
                      : 0;

                    return (
                      <div key={loan.id} className="cld-loan-row">
                        <div className="cld-loan-row-main">
                          <span className="cld-avatar">{getInitials(loan.member_name)}</span>
                          <div>
                            <strong>{loan.member_name}</strong>
                            <small>Due {formatDate(loan.due_date)}</small>
                          </div>
                        </div>
                        <div className="cld-loan-row-bar">
                          <div className="cld-bar-track">
                            <div className="cld-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <small>{pct.toFixed(0)}% repaid</small>
                        </div>
                        <div className="cld-loan-row-figures">
                          <span>{formatMoney(loan.amount)}</span>
                          <span className="cld-muted">Bal {formatMoney(balance)}</span>
                        </div>
                        <span className={statusPillClass(status)}>{status}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "applications" && (
          <div className="cld-panel">
            <div className="cld-panel-title-row">
              <div className="cld-panel-title">Loan Applications</div>
              <span className="cld-muted">{filteredApplications.length} total</span>
            </div>

            {loading ? (
              <Skeleton />
            ) : filteredApplications.length === 0 ? (
              <p className="cld-empty-state">No applications found.</p>
            ) : (
              <div className="cld-app-list">
                {filteredApplications.map((app) => (
                  <div key={app.id} className="cld-app-row">
                    <span className="cld-avatar">{getInitials(app.member_name)}</span>
                    <div className="cld-app-row-main">
                      <strong>{app.member_name}</strong>
                      <small>
                        Requested {formatMoney(app.amount)} · {formatDate(app.created_at)}
                      </small>
                    </div>
                    <span
                      className={`cld-pill ${
                        app.status === "Approved"
                          ? "cld-pill-repaid"
                          : app.status === "Rejected"
                          ? "cld-pill-overdue"
                          : "cld-pill-pending"
                      }`}
                    >
                      {app.status || "Pending"}
                    </span>
                    {app.status === "Pending" && (
                      <div className="cld-app-actions">
                        <button
                          className="cld-icon-btn cld-approve"
                          disabled={actionBusyId === app.id}
                          onClick={() => handleApplicationAction(app, "Approved")}
                          aria-label="Approve"
                          type="button"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          className="cld-icon-btn cld-reject"
                          disabled={actionBusyId === app.id}
                          onClick={() => handleApplicationAction(app, "Rejected")}
                          aria-label="Reject"
                          type="button"
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "loans" && (
          <div className="cld-panel">
            <div className="cld-panel-title-row">
              <div className="cld-panel-title">Active Loans</div>
              <div className="cld-filter-group">
                {["All", STATUS.ACTIVE, STATUS.OVERDUE, STATUS.REPAID].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`cld-filter-chip ${statusFilter === s ? "cld-active" : ""}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <Skeleton />
            ) : filteredLoans.length === 0 ? (
              <p className="cld-empty-state">No loans match this filter.</p>
            ) : (
              <div className="cld-table-wrap">
                <table className="cld-loan-table">
                  <thead>
                    <tr>
                      <th><SortButton column="member_name" label="Member" /></th>
                      <th><SortButton column="amount" label="Loan" /></th>
                      <th><SortButton column="balance" label="Balance" /></th>
                      <th><SortButton column="due_date" label="Due date" /></th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.map((loan) => {
                      const balance = Number(loan.amount || 0) - Number(loan.amount_repaid || 0);
                      const status = getLoanStatus(loan);
                      return (
                        <tr key={loan.id}>
                          <td>
                            <span className="cld-avatar cld-small">{getInitials(loan.member_name)}</span>
                            {loan.member_name}
                          </td>
                          <td>{formatMoney(loan.amount)}</td>
                          <td>{formatMoney(balance)}</td>
                          <td>{formatDate(loan.due_date)}</td>
                          <td>
                            <span className={statusPillClass(status)}>{status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "repayments" && (
          <div className="cld-panel">
            <div className="cld-panel-title-row">
              <div className="cld-panel-title">Repayment History</div>
              <span className="cld-muted">{filteredRepayments.length} records</span>
            </div>

            {loading ? (
              <Skeleton />
            ) : filteredRepayments.length === 0 ? (
              <p className="cld-empty-state">No repayments recorded yet.</p>
            ) : (
              <div className="cld-table-wrap">
                <table className="cld-loan-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Amount</th>
                      <th>Date paid</th>
                      <th>Loan ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRepayments.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="cld-avatar cld-small">{getInitials(r.member_name)}</span>
                          {r.member_name}
                        </td>
                        <td>{formatMoney(r.amount)}</td>
                        <td>{formatDate(r.paid_at)}</td>
                        <td className="cld-muted">{r.loan_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "reports" && (
          <div className="cld-panel">
            <div className="cld-panel-title-row">
              <div className="cld-panel-title">Monthly Repayment Trend</div>
            </div>

            {loading ? (
              <Skeleton />
            ) : monthlyRepayments.entries.length === 0 ? (
              <p className="cld-empty-state">Not enough data yet to build a report.</p>
            ) : (
              <div className="cld-report-chart">
                {monthlyRepayments.entries.map(([label, value]) => (
                  <div className="cld-report-row" key={label}>
                    <span className="cld-report-label">{label}</span>
                    <div className="cld-bar-track cld-wide">
                      <div
                        className="cld-bar-fill"
                        style={{
                          width: monthlyRepayments.max
                            ? `${(value / monthlyRepayments.max) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className="cld-report-value">{formatMoney(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* All selectors are nested under .cld-root so nothing here can leak out,
   and nothing outside .cld-root (no matter how generically named) can
   reach in and style these elements. */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.cld-root {
  --cld-jungle-950: #081711;
  --cld-jungle-900: #0d2318;
  --cld-jungle-800: #123321;
  --cld-jungle-700: #1c4a2e;
  --cld-jungle-600: #2a6b3f;
  --cld-gold-400: #d4af37;
  --cld-gold-300: #e8c565;
  --cld-gold-100: #f7ecc9;
  --cld-cream: #f4efdf;
  --cld-muted: #8fae96;
  --cld-danger: #e2694f;

  all: initial;
  display: block;
  font-family: 'Work Sans', system-ui, sans-serif;
  color: var(--cld-cream);
  background: var(--cld-jungle-950);
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}

.cld-root, .cld-root * {
  box-sizing: border-box;
}

.cld-root *, .cld-root *::before, .cld-root *::after {
  font-family: inherit;
  color: inherit;
}

.cld-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
}

.cld-header-eyebrow {
  margin: 0 0 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cld-gold-300);
}

.cld-header-title {
  margin: 0;
  font-family: 'Fraunces', serif;
  font-weight: 700;
  font-size: 24px;
  color: var(--cld-cream);
}

.cld-header-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--cld-muted);
}

.cld-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cld-search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 175, 55, 0.2);
  border-radius: 999px;
  padding: 7px 14px;
  color: var(--cld-muted);
}

.cld-search-box input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--cld-cream);
  font-size: 13px;
  width: 160px;
}

.cld-refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--cld-gold-400);
  color: var(--cld-jungle-950);
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.cld-refresh-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.cld-spin {
  animation: cld-spin-kf 0.9s linear infinite;
}

@keyframes cld-spin-kf {
  to { transform: rotate(360deg); }
}

.cld-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid rgba(212, 175, 55, 0.18);
  margin-bottom: 20px;
  overflow-x: auto;
}

.cld-tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--cld-muted);
  font-size: 13px;
  font-weight: 500;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.cld-tab-btn:hover {
  color: var(--cld-cream);
}

.cld-tab-btn.cld-active {
  color: var(--cld-gold-300);
  border-bottom-color: var(--cld-gold-400);
}

.cld-tab-badge {
  background: var(--cld-gold-400);
  color: var(--cld-jungle-950);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  border-radius: 999px;
  padding: 1px 7px;
}

.cld-error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(226, 105, 79, 0.12);
  border: 1px solid rgba(226, 105, 79, 0.4);
  color: #f4c7bb;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 20px;
}

.cld-error-banner button {
  margin-left: auto;
  background: transparent;
  border: 1px solid rgba(244, 199, 187, 0.4);
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
}

.cld-content {
  min-width: 0;
}

.cld-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}

.cld-kpi-card {
  background: radial-gradient(120% 140% at 0% 0%, var(--cld-jungle-800), var(--cld-jungle-900));
  border: 1px solid rgba(212, 175, 55, 0.18);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--cld-gold-300);
}

.cld-kpi-card span {
  font-size: 12px;
  color: var(--cld-muted);
}

.cld-kpi-card h2 {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 19px;
  color: var(--cld-cream);
}

.cld-kpi-card.cld-danger {
  border-color: rgba(226, 105, 79, 0.4);
  color: var(--cld-danger);
}

.cld-kpi-card.cld-gold {
  border-color: var(--cld-gold-400);
}

.cld-kpi-bar-track {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-top: 4px;
}

.cld-kpi-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--cld-jungle-600), var(--cld-gold-400));
  border-radius: 999px;
  transition: width 0.6s ease;
}

.cld-panel {
  background: linear-gradient(180deg, var(--cld-jungle-900), var(--cld-jungle-950));
  border: 1px solid rgba(212, 175, 55, 0.15);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
}

.cld-panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.cld-panel-title {
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--cld-gold-100);
}

.cld-link-btn {
  background: none;
  border: none;
  color: var(--cld-gold-300);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.cld-muted {
  color: var(--cld-muted);
  font-size: 12px;
}

.cld-empty-state {
  text-align: center;
  color: var(--cld-muted);
  padding: 24px 0;
  font-size: 13px;
}

.cld-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cld-skeleton-row {
  height: 46px;
  border-radius: 10px;
  background: linear-gradient(90deg, rgba(212,175,55,0.05), rgba(212,175,55,0.14), rgba(212,175,55,0.05));
  background-size: 200% 100%;
  animation: cld-shimmer-kf 1.4s ease-in-out infinite;
}

@keyframes cld-shimmer-kf {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.cld-loan-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cld-loan-row, .cld-app-row {
  display: grid;
  grid-template-columns: 1.6fr 1.4fr 1.2fr auto;
  align-items: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(212, 175, 55, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
}

.cld-loan-row-main, .cld-app-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cld-loan-row-main strong, .cld-app-row-main strong {
  display: block;
  font-size: 13px;
  color: var(--cld-cream);
}

.cld-loan-row-main small, .cld-app-row-main small {
  color: var(--cld-muted);
  font-size: 11px;
}

.cld-loan-row-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cld-loan-row-bar small {
  color: var(--cld-muted);
  font-size: 10px;
}

.cld-loan-row-figures {
  display: flex;
  flex-direction: column;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  gap: 2px;
  color: var(--cld-gold-100);
}

.cld-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--cld-jungle-700);
  border: 1px solid rgba(212, 175, 55, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--cld-gold-100);
  flex-shrink: 0;
}

.cld-avatar.cld-small {
  width: 24px;
  height: 24px;
  font-size: 10px;
  margin-right: 8px;
  display: inline-flex;
  vertical-align: middle;
}

.cld-bar-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
  width: 100px;
}

.cld-bar-track.cld-wide {
  width: 100%;
}

.cld-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--cld-jungle-600), var(--cld-gold-400));
  transition: width 0.6s ease;
  display: block;
}

.cld-pill {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  border-radius: 999px;
  padding: 4px 10px;
  text-align: center;
  white-space: nowrap;
  display: inline-block;
}

.cld-pill-active {
  background: rgba(63, 137, 85, 0.2);
  color: #8fdba6;
  border: 1px solid rgba(63, 137, 85, 0.4);
}

.cld-pill-overdue {
  background: rgba(226, 105, 79, 0.15);
  color: #f2a48f;
  border: 1px solid rgba(226, 105, 79, 0.4);
}

.cld-pill-repaid {
  background: rgba(212, 175, 55, 0.15);
  color: var(--cld-gold-300);
  border: 1px solid rgba(212, 175, 55, 0.4);
}

.cld-pill-pending {
  background: rgba(255, 255, 255, 0.06);
  color: var(--cld-muted);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.cld-app-actions {
  display: flex;
  gap: 6px;
}

.cld-icon-btn {
  border: 1px solid rgba(212, 175, 55, 0.3);
  background: transparent;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  color: var(--cld-muted);
  display: inline-flex;
}

.cld-icon-btn.cld-approve:hover { color: #8fdba6; border-color: #8fdba6; }
.cld-icon-btn.cld-reject:hover { color: #f2a48f; border-color: #f2a48f; }
.cld-icon-btn:disabled { opacity: 0.5; cursor: default; }

.cld-filter-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cld-filter-chip {
  border: 1px solid rgba(212, 175, 55, 0.25);
  background: transparent;
  color: var(--cld-muted);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.cld-filter-chip.cld-active {
  background: var(--cld-gold-400);
  color: var(--cld-jungle-950);
  border-color: var(--cld-gold-400);
  font-weight: 600;
}

.cld-table-wrap {
  overflow-x: auto;
}

.cld-loan-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.cld-loan-table th {
  text-align: left;
  padding: 8px 10px;
  color: var(--cld-muted);
  font-weight: 500;
  border-bottom: 1px solid rgba(212, 175, 55, 0.15);
}

.cld-loan-table td {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: var(--cld-cream);
  white-space: nowrap;
}

.cld-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--cld-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.cld-sort-active {
  color: var(--cld-gold-300);
}

.cld-report-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cld-report-row {
  display: grid;
  grid-template-columns: 70px 1fr 110px;
  align-items: center;
  gap: 12px;
}

.cld-report-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--cld-muted);
}

.cld-report-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--cld-gold-100);
  text-align: right;
}

@media (max-width: 700px) {
  .cld-root {
    padding: 16px;
  }

  .cld-header-actions {
    width: 100%;
  }

  .cld-search-box {
    flex: 1;
  }

  .cld-search-box input {
    width: 100%;
  }

  .cld-loan-row, .cld-app-row {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cld-bar-fill, .cld-kpi-bar-fill, .cld-skeleton-row, .cld-spin {
    animation: none;
    transition: none;
  }
}
`;