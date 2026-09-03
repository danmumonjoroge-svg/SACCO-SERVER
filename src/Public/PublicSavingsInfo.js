import React, { useMemo, useState } from "react";

const ANNUAL_RATE = 0.08; // illustrative dividend/interest rate used for the estimate

function formatKES(n) {
  return `KES ${Math.round(n).toLocaleString()}`;
}

const PublicSavingsInfo = () => {
  const [monthly, setMonthly] = useState(2000);
  const [months, setMonths] = useState(24);

  // Simple compounding estimate: monthly contribution growing at a fixed annual rate
  const projected = useMemo(() => {
    const monthlyRate = ANNUAL_RATE / 12;
    let balance = 0;
    for (let i = 0; i < months; i++) {
      balance = (balance + monthly) * (1 + monthlyRate);
    }
    const contributed = monthly * months;
    return { balance, contributed, growth: balance - contributed };
  }, [monthly, months]);

  return (
    <div style={page}>

      <div style={heroBox}>
        <h1 style={{ margin: 0 }}>💰 Savings Products</h1>
        <p style={heroSub}>
          Savings form the foundation of every SACCO journey — the stronger your
          savings history, the better your loan terms and dividend potential.
        </p>
      </div>

      <div style={cardGrid}>
        <section style={box}>
          <h2 style={boxTitle}>About Savings</h2>
          <p>
            Savings form the foundation of SACCO financial growth. Consistent,
            disciplined contributions build both your balance and your standing
            as a member in good repayment order.
          </p>
        </section>

        <section style={box}>
          <h2 style={boxTitle}>Savings Rules</h2>
          <ul style={list}>
            <li>Minimum monthly contribution required</li>
            <li>Encouraged regular deposits</li>
            <li>Funds are used for lending pool</li>
          </ul>
        </section>

        <section style={box}>
          <h2 style={boxTitle}>Benefits</h2>
          <ul style={list}>
            <li>Loan qualification basis</li>
            <li>Dividend earnings</li>
            <li>Financial discipline</li>
          </ul>
        </section>
      </div>

      {/* ================= GROWTH ESTIMATOR ================= */}
      <section style={estimatorBox}>
        <h2 style={boxTitle}>Estimate Your Savings Growth</h2>
        <p style={{ color: "#475569", marginTop: 0 }}>
          A rough projection based on an illustrative {(ANNUAL_RATE * 100).toFixed(0)}% annual
          rate — actual dividends depend on SACCO performance.
        </p>

        <div style={estimatorGrid}>
          <label style={fieldLabel}>
            Monthly contribution
            <input
              type="range"
              min={500}
              max={20000}
              step={500}
              value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value))}
              style={slider}
            />
            <span style={fieldValue}>{formatKES(monthly)} / month</span>
          </label>

          <label style={fieldLabel}>
            Time horizon
            <input
              type="range"
              min={6}
              max={120}
              step={6}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              style={slider}
            />
            <span style={fieldValue}>{months} months (~{(months / 12).toFixed(1)} yrs)</span>
          </label>
        </div>

        <div style={resultGrid}>
          <div style={resultCard}>
            <span style={resultLabel}>Total contributed</span>
            <span style={resultValue}>{formatKES(projected.contributed)}</span>
          </div>
          <div style={{ ...resultCard, background: "#ecfdf5", borderColor: "#a7f3d0" }}>
            <span style={resultLabel}>Estimated growth</span>
            <span style={{ ...resultValue, color: "#059669" }}>{formatKES(projected.growth)}</span>
          </div>
          <div style={{ ...resultCard, background: "#0b5d3b", borderColor: "#0b5d3b" }}>
            <span style={{ ...resultLabel, color: "rgba(255,255,255,.75)" }}>Projected balance</span>
            <span style={{ ...resultValue, color: "white" }}>{formatKES(projected.balance)}</span>
          </div>
        </div>

        <p style={disclaimer}>
          This is an illustrative estimate, not a guarantee. Speak with a member
          services representative for a personalised savings plan.
        </p>
      </section>

    </div>
  );
};

const page = { padding: 30, maxWidth: 980, margin: "0 auto" };

const heroBox = {
  background: "linear-gradient(135deg,#0b5d3b,#0f7a4f)",
  color: "white",
  padding: "36px 28px",
  borderRadius: 16,
  marginBottom: 22,
};

const heroSub = { marginTop: 10, color: "rgba(255,255,255,.85)", maxWidth: 640 };

const cardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
  marginBottom: 24,
};

const box = {
  background: "#f3f4f6",
  padding: 20,
  borderRadius: 12,
};

const boxTitle = { marginTop: 0, color: "#0b5d3b" };

const list = { paddingLeft: 20, margin: 0, color: "#334155", lineHeight: 1.8 };

const estimatorBox = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 26,
  boxShadow: "0 6px 18px rgba(0,0,0,.05)",
};

const estimatorGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 22,
  margin: "18px 0 24px",
};

const fieldLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontWeight: 600,
  fontSize: 13.5,
  color: "#0b5d3b",
};

const slider = { width: "100%", accentColor: "#0b5d3b" };

const fieldValue = { fontWeight: 700, color: "#0f172a", fontSize: 15 };

const resultGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const resultCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "16px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const resultLabel = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, color: "#64748b" };

const resultValue = { fontSize: 20, fontWeight: 800, color: "#0f172a" };

const disclaimer = { fontSize: 12, color: "#94a3b8", marginTop: 18, marginBottom: 0 };

export default PublicSavingsInfo;
