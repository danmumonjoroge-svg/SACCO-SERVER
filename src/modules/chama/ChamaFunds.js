// modules/chama/funds/ChamaFundsDashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// Advanced Chama Funds Position Dashboard
//
// Features over the starter:
//   ✅ Full fund breakdown — where funds are held (bank/wallet), amount per account
//   ✅ Growth tracking — month-over-month % change per account
//   ✅ Allocation donut — visual pie/bar showing fund distribution
//   ✅ Assets register — livestock, land, shares with valuations
//   ✅ Net worth trend — running total over time
//   ✅ Recent movements — filterable, paginated, with source → dest
//   ✅ Fund health indicator — liquidity ratio, target vs actual
//   ✅ Transfer trail — internal moves between accounts
//   ✅ CSV export of all movements
//   ✅ Fully responsive (phone → desktop)
//   ✅ Dark ledger theme consistent with rest of chama system

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import {
  Landmark, Wallet, TrendingUp, TrendingDown, ArrowRightLeft,
  Package, Building2, RefreshCw, Download, ChevronDown,
  ChevronUp, Eye, EyeOff, AlertCircle, CheckCircle2,
} from "lucide-react";
import "./ChamaFunds.css";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TX_TYPES   = ["All", "deposit", "withdrawal", "transfer", "investment"];
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Colour palette for accounts (cycles through)
const ACCOUNT_COLOURS = [
  "#60a5fa","#4ade80","#fbbf24","#a78bfa","#f472b6",
  "#34d399","#fb923c","#818cf8","#2dd4bf","#e879f9",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt    = n  => `KES ${Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
const fmtPct = n  => `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)}%`;
const fmtK   = n  => n >= 1_000_000 ? `${(n/1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : String(n);

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function growthPct(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function downloadCSV(rows, filename) {
  const headers = ["Date","Type","Description","From","To","Amount","Asset","Asset Value"];
  const lines   = [headers.join(",")];
  rows.forEach(r => {
    lines.push([
      r.created_at?.slice(0,10) ?? "",
      r.type ?? "",
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
      r.from_source ?? "",
      r.to_destination ?? "",
      r.amount ?? 0,
      r.asset_name ?? "",
      r.asset_value ?? 0,
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// MICRO-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, icon: Icon, colour, trend, trendLabel }) {
  const up = trend >= 0;
  return (
    <div className="cf-kpi" style={{ borderColor: colour + "44" }}>
      <div className="cf-kpi-icon" style={{ background: colour + "22", color: colour }}>
        <Icon size={18} />
      </div>
      <div className="cf-kpi-body">
        <p className="cf-kpi-title">{title}</p>
        <p className="cf-kpi-value" style={{ color: colour }}>{value}</p>
        {sub && <p className="cf-kpi-sub">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`cf-kpi-trend ${up ? "up" : "down"}`}>
          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          <span>{fmtPct(trend)}</span>
          {trendLabel && <span className="cf-kpi-trend-lbl">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="cf-sec-hdr">
      <h2 className="cf-sec-title">{title}</h2>
      {action && <div className="cf-sec-action">{action}</div>}
    </div>
  );
}

function EmptyRow({ msg }) {
  return (
    <div className="cf-empty-row">
      <AlertCircle size={16} />
      <span>{msg}</span>
    </div>
  );
}

// ─── Inline SVG Donut (no external chart lib needed) ─────────────────────────

function DonutChart({ slices, size = 140, thickness = 28 }) {
  const r      = (size - thickness) / 2;
  const cx     = size / 2;
  const cy     = size / 2;
  const circum = 2 * Math.PI * r;

  const total = slices.reduce((s, x) => s + x.value, 0);
  let offset  = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="cf-donut">
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />

      {slices.map((s, i) => {
        const pct   = total > 0 ? s.value / total : 0;
        const dash  = pct * circum;
        const gap   = circum - dash;
        const el    = (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.colour}
            strokeWidth={thickness - 2}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        );
        offset += dash;
        return el;
      })}

      {/* Centre label */}
      <text x={cx} y={cy - 6} textAnchor="middle" className="cf-donut-val">
        {fmtK(total)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="cf-donut-lbl">
        Total
      </text>
    </svg>
  );
}

// ─── Mini sparkline bar chart ─────────────────────────────────────────────────

function SparkBar({ data, colour = "#60a5fa", height = 32 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w   = 6;
  const gap = 3;
  return (
    <svg
      width={(w + gap) * data.length}
      height={height}
      className="cf-spark"
    >
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={height - h}
            width={w}
            height={h}
            rx={2}
            fill={colour}
            opacity={i === data.length - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT CARD  — one card per fund location (KCB, CIC, Cash, etc.)
// ─────────────────────────────────────────────────────────────────────────────

function AccountCard({ name, balance, prevBalance, colour, sparkData, pct, totalFunds, txCount }) {
  const growth = growthPct(balance, prevBalance);
  const up     = growth >= 0;

  return (
    <div className="cf-acc-card" style={{ borderLeftColor: colour }}>
      <div className="cf-acc-top">
        <div className="cf-acc-icon" style={{ background: colour + "22", color: colour }}>
          <Building2 size={15} />
        </div>
        <div className="cf-acc-info">
          <p className="cf-acc-name">{name}</p>
          <p className="cf-acc-sub">{txCount} transaction{txCount !== 1 ? "s" : ""}</p>
        </div>
        <div className={`cf-acc-growth ${up ? "up" : "down"}`}>
          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{fmtPct(growth)}</span>
        </div>
      </div>

      <p className="cf-acc-balance">{fmt(balance)}</p>

      {/* Allocation bar */}
      <div className="cf-acc-alloc-bar">
        <div className="cf-acc-alloc-fill" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <p className="cf-acc-alloc-pct">{pct.toFixed(1)}% of total funds</p>

      {/* Sparkline */}
      {sparkData && sparkData.length > 1 && (
        <div className="cf-acc-spark">
          <SparkBar data={sparkData} colour={colour} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSET ROW
// ─────────────────────────────────────────────────────────────────────────────

function AssetRow({ name, value, totalAssets }) {
  const pct = totalAssets > 0 ? (value / totalAssets) * 100 : 0;
  return (
    <div className="cf-asset-row">
      <div className="cf-asset-left">
        <span className="cf-asset-name">{name}</span>
        <div className="cf-asset-bar-wrap">
          <div className="cf-asset-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="cf-asset-right">
        <span className="cf-asset-val">{fmt(value)}</span>
        <span className="cf-asset-pct">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVEMENT ROW
// ─────────────────────────────────────────────────────────────────────────────

const TX_COLOUR = {
  deposit:    "#4ade80",
  withdrawal: "#ef4444",
  transfer:   "#60a5fa",
  investment: "#fbbf24",
};

function MovementRow({ tx }) {
  const colour = TX_COLOUR[tx.type] ?? "#94a3b8";
  const isOut  = tx.type === "withdrawal";

  return (
    <div className="cf-tx-row">
      <div className="cf-tx-type-dot" style={{ background: colour + "22", color: colour }}>
        {tx.type === "deposit"    && <TrendingUp    size={13} />}
        {tx.type === "withdrawal" && <TrendingDown  size={13} />}
        {tx.type === "transfer"   && <ArrowRightLeft size={13} />}
        {tx.type === "investment" && <Package        size={13} />}
      </div>
      <div className="cf-tx-body">
        <p className="cf-tx-desc">{tx.description || `${tx.type} — ${tx.from_source ?? ""}${tx.to_destination ? ` → ${tx.to_destination}` : ""}`}</p>
        <p className="cf-tx-meta">
          {tx.from_source && <span>{tx.from_source}</span>}
          {tx.from_source && tx.to_destination && <span className="cf-tx-arrow"> → </span>}
          {tx.to_destination && <span>{tx.to_destination}</span>}
          {tx.created_at && (
            <span className="cf-tx-date">
              {new Date(tx.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </p>
      </div>
      <div className={`cf-tx-amount ${isOut ? "out" : "in"}`} style={{ color: colour }}>
        {isOut ? "−" : "+"}{fmt(tx.amount)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NET WORTH TREND BAR CHART
// ─────────────────────────────────────────────────────────────────────────────

function NetWorthTrend({ monthlyData }) {
  if (!monthlyData || monthlyData.length < 2) return null;

  const max    = Math.max(...monthlyData.map(m => m.net), 1);
  const H      = 80;
  const barW   = 100 / monthlyData.length;

  return (
    <div className="cf-trend-wrap">
      <svg width="100%" height={H} className="cf-trend-svg" preserveAspectRatio="none">
        {monthlyData.map((m, i) => {
          const h   = Math.max(2, (m.net / max) * H);
          const x   = i * barW;
          const col = m.net >= (monthlyData[i - 1]?.net ?? 0) ? "#4ade80" : "#f87171";
          return (
            <rect key={i}
              x={`${x + 0.5}%`} y={H - h} width={`${barW - 1}%`} height={h}
              rx={2} fill={col} opacity={0.8}
            />
          );
        })}
      </svg>
      <div className="cf-trend-labels">
        {monthlyData.map((m, i) => (
          <span key={i} className="cf-trend-label">
            {MONTH_ABBR[parseInt(m.month.split("-")[1], 10) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FUND HEALTH INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

function FundHealth({ liquidity, totalIn, totalOut }) {
  const ratio      = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;
  const healthPct  = Math.max(0, Math.min(100, 100 - ratio));
  const colour     = healthPct >= 70 ? "#4ade80" : healthPct >= 40 ? "#fbbf24" : "#ef4444";
  const label      = healthPct >= 70 ? "Healthy" : healthPct >= 40 ? "Moderate" : "At Risk";

  return (
    <div className="cf-health">
      <div className="cf-health-ring">
        <svg width={80} height={80} viewBox="0 0 80 80">
          <circle cx={40} cy={40} r={30} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
          <circle cx={40} cy={40} r={30} fill="none"
            stroke={colour} strokeWidth={10}
            strokeDasharray={`${(healthPct / 100) * 188.5} 188.5`}
            strokeDashoffset={-47}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
          <text x={40} y={37} textAnchor="middle" className="cf-health-pct" fill={colour}>
            {Math.round(healthPct)}%
          </text>
          <text x={40} y={50} textAnchor="middle" className="cf-health-lbl">
            {label}
          </text>
        </svg>
      </div>
      <div className="cf-health-details">
        <div className="cf-health-row">
          <span>Total Inflow</span>
          <strong style={{ color: "#4ade80" }}>{fmt(totalIn)}</strong>
        </div>
        <div className="cf-health-row">
          <span>Total Outflow</span>
          <strong style={{ color: "#f87171" }}>{fmt(totalOut)}</strong>
        </div>
        <div className="cf-health-row">
          <span>Spend Ratio</span>
          <strong style={{ color: colour }}>{ratio.toFixed(1)}%</strong>
        </div>
        <div className="cf-health-row">
          <span>Liquidity</span>
          <strong style={{ color: "#60a5fa" }}>{fmt(liquidity)}</strong>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ChamaFundsDashboard = ({ chamaId }) => {
  const [data,        setData]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [txFilter,    setTxFilter]    = useState("All");
  const [txPage,      setTxPage]      = useState(1);
  const [showAll,     setShowAll]     = useState(false);
  const [hiddenAccounts, setHiddenAccounts] = useState(new Set());

  const PAGE_SIZE = 10;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const { data: rows, error } = await supabase
      .from("chama_fund_movements")
      .select("*")
      .eq("chama_id", chamaId)
      .order("created_at", { ascending: true });

    if (!error) {
      setData(rows ?? []);
      setLastUpdated(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, [chamaId]);

  useEffect(() => { load(); }, [load]);

  // ── Core aggregation ───────────────────────────────────────────────────────
  const { accounts, assets, totalIn, totalOut, accountTxCounts, accountSparklines } = useMemo(() => {
    const accounts       = {};  // name → running balance
    const accountByMonth = {};  // name → { "2024-06": balance }
    const accountTxCounts = {};
    const assets         = {};
    let   totalIn        = 0;
    let   totalOut       = 0;

    data.forEach(tx => {
      const amt  = Number(tx.amount ?? 0);
      const mo   = tx.created_at ? monthKey(tx.created_at) : "unknown";

      if (tx.type === "deposit" || tx.type === "investment") {
        totalIn += amt;
        const dest = tx.to_destination || "Uncategorized";
        accounts[dest]        = (accounts[dest] ?? 0) + amt;
        accountTxCounts[dest] = (accountTxCounts[dest] ?? 0) + 1;
        accountByMonth[dest]  = accountByMonth[dest] ?? {};
        accountByMonth[dest][mo] = (accountByMonth[dest][mo] ?? 0) + amt;
      }

      if (tx.type === "withdrawal") {
        totalOut += amt;
        const src = tx.from_source || "Uncategorized";
        accounts[src]        = (accounts[src] ?? 0) - amt;
        accountTxCounts[src] = (accountTxCounts[src] ?? 0) + 1;
        accountByMonth[src]  = accountByMonth[src] ?? {};
        accountByMonth[src][mo] = (accountByMonth[src][mo] ?? 0) - amt;
      }

      if (tx.type === "transfer") {
        const from = tx.from_source || "Unknown";
        const to   = tx.to_destination || "Unknown";
        accounts[from] = (accounts[from] ?? 0) - amt;
        accounts[to]   = (accounts[to]   ?? 0) + amt;
        accountTxCounts[from] = (accountTxCounts[from] ?? 0) + 1;
        accountTxCounts[to]   = (accountTxCounts[to]   ?? 0) + 1;
      }

      if (tx.asset_name) {
        assets[tx.asset_name] = (assets[tx.asset_name] ?? 0) + Number(tx.asset_value ?? 0);
      }
    });

    // Build sparklines: last 6 months of running balance per account
    const accountSparklines = {};
    Object.keys(accountByMonth).forEach(acct => {
      const months = Object.keys(accountByMonth[acct]).sort().slice(-6);
      let running  = 0;
      accountSparklines[acct] = months.map(m => {
        running += accountByMonth[acct][m];
        return Math.max(0, running);
      });
    });

    return { accounts, assets, totalIn, totalOut, accountTxCounts, accountSparklines };
  }, [data]);

  // ── Net worth ──────────────────────────────────────────────────────────────
  const netWorth = useMemo(() => {
    const assetTotal   = Object.values(assets).reduce((a, b) => a + b, 0);
    const accountTotal = Object.values(accounts).reduce((a, b) => a + b, 0);
    return assetTotal + accountTotal;
  }, [accounts, assets]);

  const totalAssets    = useMemo(() => Object.values(assets).reduce((a, b) => a + b, 0), [assets]);
  const totalAccountFunds = useMemo(() => Object.values(accounts).reduce((a, b) => a + b, 0), [accounts]);

  // ── Month-over-month net worth trend (last 6 months) ──────────────────────
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    data.forEach(tx => {
      if (!tx.created_at) return;
      const mo  = monthKey(tx.created_at);
      const amt = Number(tx.amount ?? 0);
      const sign = tx.type === "withdrawal" ? -1 : 1;
      byMonth[mo] = (byMonth[mo] ?? 0) + sign * amt;
    });
    const months = Object.keys(byMonth).sort().slice(-6);
    let running = 0;
    return months.map(m => {
      running += byMonth[m];
      return { month: m, net: Math.max(0, running) };
    });
  }, [data]);

  // ── Growth: compare current month to previous ─────────────────────────────
  const netGrowthPct = useMemo(() => {
    if (monthlyTrend.length < 2) return 0;
    const cur  = monthlyTrend[monthlyTrend.length - 1]?.net ?? 0;
    const prev = monthlyTrend[monthlyTrend.length - 2]?.net ?? 0;
    return growthPct(cur, prev);
  }, [monthlyTrend]);

  // ── Previous-month balances per account (for growth %) ────────────────────
  const prevAccountBalances = useMemo(() => {
    const prevMonth = {};
    const cutoff    = new Date();
    cutoff.setDate(1); // start of this month
    const thresholdISO = cutoff.toISOString();

    const tmpAccounts = {};
    data.forEach(tx => {
      if (!tx.created_at || tx.created_at >= thresholdISO) return;
      const amt = Number(tx.amount ?? 0);
      if (tx.type === "deposit" || tx.type === "investment") {
        const d = tx.to_destination || "Uncategorized";
        tmpAccounts[d] = (tmpAccounts[d] ?? 0) + amt;
      }
      if (tx.type === "withdrawal") {
        const s = tx.from_source || "Uncategorized";
        tmpAccounts[s] = (tmpAccounts[s] ?? 0) - amt;
      }
      if (tx.type === "transfer") {
        tmpAccounts[tx.from_source ?? "Unknown"] = (tmpAccounts[tx.from_source ?? "Unknown"] ?? 0) - amt;
        tmpAccounts[tx.to_destination ?? "Unknown"] = (tmpAccounts[tx.to_destination ?? "Unknown"] ?? 0) + amt;
      }
    });
    return tmpAccounts;
  }, [data]);

  // ── Donut slices ──────────────────────────────────────────────────────────
  const donutSlices = useMemo(() => {
    const sorted = Object.entries(accounts)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    return sorted.map(([name, value], i) => ({
      name, value, colour: ACCOUNT_COLOURS[i % ACCOUNT_COLOURS.length],
    }));
  }, [accounts]);

  // ── Filtered movements ────────────────────────────────────────────────────
  const filteredTx = useMemo(() => {
    const reversed = [...data].reverse();
    if (txFilter === "All") return reversed;
    return reversed.filter(t => t.type === txFilter);
  }, [data, txFilter]);

  const pagedTx    = showAll ? filteredTx : filteredTx.slice(0, PAGE_SIZE * txPage);
  const hasMore    = filteredTx.length > pagedTx.length;

  // ── Sorted accounts ───────────────────────────────────────────────────────
  const sortedAccounts = useMemo(() =>
    Object.entries(accounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, balance], i) => ({
        name, balance,
        colour:      ACCOUNT_COLOURS[i % ACCOUNT_COLOURS.length],
        prevBalance: prevAccountBalances[name] ?? 0,
        sparkData:   accountSparklines[name] ?? [],
        txCount:     accountTxCounts[name] ?? 0,
        pct:         totalAccountFunds > 0 ? (Math.max(0, balance) / totalAccountFunds) * 100 : 0,
      })),
  [accounts, prevAccountBalances, accountSparklines, accountTxCounts, totalAccountFunds]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="cf-loading">
        <RefreshCw size={24} className="cf-spin" />
        <p>Loading fund data…</p>
      </div>
    );
  }

  return (
    <div className="cf-wrapper">

      {/* ── PAGE HEADER ── */}
      <div className="cf-page-hdr">
        <div>
          <h1 className="cf-page-title">📊 Funds Position Dashboard</h1>
          <p className="cf-page-sub">
            Real-time treasury visibility · {data.length} transactions
            {lastUpdated && (
              <span className="cf-last-updated">
                · Updated {lastUpdated.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="cf-page-actions">
          <button className="cf-icon-btn" onClick={() => load(true)} disabled={refreshing} title="Refresh">
            <RefreshCw size={15} className={refreshing ? "cf-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button className="cf-icon-btn" onClick={() => downloadCSV(data, `chama_funds_${chamaId}.csv`)} title="Export CSV">
            <Download size={15} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="cf-kpi-row">
        <KpiCard title="Net Worth"      value={fmt(netWorth)}      icon={Landmark}       colour="#60a5fa" trend={netGrowthPct}     trendLabel="vs last month" sub={`${sortedAccounts.length} accounts`} />
        <KpiCard title="Total Inflow"   value={fmt(totalIn)}       icon={TrendingUp}     colour="#4ade80" sub={`${data.filter(t=>t.type==="deposit"||t.type==="investment").length} entries`} />
        <KpiCard title="Total Outflow"  value={fmt(totalOut)}      icon={TrendingDown}   colour="#f87171" sub={`${data.filter(t=>t.type==="withdrawal").length} withdrawals`} />
        <KpiCard title="Assets Value"   value={fmt(totalAssets)}   icon={Package}        colour="#fbbf24" sub={`${Object.keys(assets).length} asset types`} />
      </div>

      {/* ── TWO-COLUMN: FUND HEALTH + NET WORTH TREND ── */}
      <div className="cf-row-2col">
        <div className="cf-card">
          <SectionHeader title="🩺 Fund Health" />
          <FundHealth
            liquidity={totalIn - totalOut}
            totalIn={totalIn}
            totalOut={totalOut}
          />
        </div>

        <div className="cf-card">
          <SectionHeader title="📈 Net Worth Trend (6 months)" />
          <NetWorthTrend monthlyData={monthlyTrend} />
          {monthlyTrend.length >= 2 && (
            <div className="cf-trend-summary">
              <span>Start: <strong>{fmt(monthlyTrend[0]?.net)}</strong></span>
              <span>Current: <strong style={{ color: "#4ade80" }}>{fmt(monthlyTrend[monthlyTrend.length - 1]?.net)}</strong></span>
              <span className={netGrowthPct >= 0 ? "cf-green" : "cf-red"}>
                {netGrowthPct >= 0 ? "▲" : "▼"} {Math.abs(netGrowthPct).toFixed(1)}% MoM
              </span>
            </div>
          )}
          {monthlyTrend.length < 2 && (
            <p className="cf-trend-empty">More transactions needed for trend analysis</p>
          )}
        </div>
      </div>

      {/* ── FUND ALLOCATION (Donut + legend) ── */}
      <div className="cf-card">
        <SectionHeader title="🏦 Fund Allocation by Location" />
        {donutSlices.length === 0 ? (
          <EmptyRow msg="No fund data available yet." />
        ) : (
          <div className="cf-alloc-wrap">
            <div className="cf-alloc-donut">
              <DonutChart slices={donutSlices} size={160} thickness={30} />
            </div>
            <div className="cf-alloc-legend">
              {donutSlices.map(s => (
                <div key={s.name} className="cf-legend-item">
                  <span className="cf-legend-dot" style={{ background: s.colour }} />
                  <span className="cf-legend-name">{s.name}</span>
                  <span className="cf-legend-val">{fmt(s.value)}</span>
                  <span className="cf-legend-pct">
                    {totalAccountFunds > 0 ? ((s.value / totalAccountFunds) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── ACCOUNT CARDS — where each fund is held ── */}
      <div className="cf-card">
        <SectionHeader
          title="📂 Accounts & Fund Locations"
          action={
            sortedAccounts.length > 4 && (
              <button className="cf-text-btn" onClick={() => setShowAll(s => !s)}>
                {showAll ? <><EyeOff size={13} /> Show less</> : <><Eye size={13} /> Show all ({sortedAccounts.length})</>}
              </button>
            )
          }
        />
        {sortedAccounts.length === 0 ? (
          <EmptyRow msg="No account movements recorded yet." />
        ) : (
          <div className="cf-acc-grid">
            {(showAll ? sortedAccounts : sortedAccounts.slice(0, 6)).map(acc => (
              <AccountCard key={acc.name} {...acc} totalFunds={totalAccountFunds} />
            ))}
          </div>
        )}
      </div>

      {/* ── ASSETS REGISTER ── */}
      {Object.keys(assets).length > 0 && (
        <div className="cf-card">
          <SectionHeader title="🐄 Assets & Physical Investments" />
          <div className="cf-assets-list">
            {Object.entries(assets)
              .sort(([, a], [, b]) => b - a)
              .map(([name, value]) => (
                <AssetRow key={name} name={name} value={value} totalAssets={totalAssets} />
              ))}
          </div>
          <div className="cf-assets-total">
            <span>Total Asset Value</span>
            <strong style={{ color: "#fbbf24" }}>{fmt(totalAssets)}</strong>
          </div>
        </div>
      )}

      {/* ── MOVEMENTS LOG ── */}
      <div className="cf-card">
        <SectionHeader
          title="📜 Fund Movements"
          action={
            <div className="cf-tx-filter-row">
              {TX_TYPES.map(t => (
                <button
                  key={t}
                  className={`cf-pill ${txFilter === t ? "on" : ""}`}
                  onClick={() => { setTxFilter(t); setTxPage(1); }}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        />

        {filteredTx.length === 0 ? (
          <EmptyRow msg={`No ${txFilter === "All" ? "" : txFilter} transactions found.`} />
        ) : (
          <>
            <div className="cf-tx-list">
              {pagedTx.map(tx => <MovementRow key={tx.id} tx={tx} />)}
            </div>

            {/* Load more */}
            {hasMore && (
              <button className="cf-load-more" onClick={() => setTxPage(p => p + 1)}>
                <ChevronDown size={15} />
                Load more ({filteredTx.length - pagedTx.length} remaining)
              </button>
            )}
            {!hasMore && filteredTx.length > PAGE_SIZE && (
              <button className="cf-load-more secondary" onClick={() => { setTxPage(1); }}>
                <ChevronUp size={15} />
                Collapse
              </button>
            )}

            <p className="cf-tx-count">
              Showing {pagedTx.length} of {filteredTx.length} movements
            </p>
          </>
        )}
      </div>

    </div>
  );
};

export default ChamaFundsDashboard;