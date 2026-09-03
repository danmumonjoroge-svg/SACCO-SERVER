import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PublicHome.css";

// ================= COUNT-UP HOOK =================
function useCountUp(target, active, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return value;
}

const KPIS = [
  { label: "Active members", value: 1240, suffix: "+" },
  { label: "Loans disbursed", value: 3800000, suffix: "+", prefix: "KES " },
  { label: "Avg. dividend yield", value: 11, suffix: "%" },
  { label: "Years of trust", value: 9, suffix: "" },
];

const FEATURES = [
  { icon: "💰", title: "Savings", body: "Grow your wealth through disciplined, flexible savings plans built around your goals." },
  { icon: "🏦", title: "Loans", body: "Affordable, transparent credit for personal needs, emergencies, and business growth." },
  { icon: "📊", title: "Shares", body: "Own part of the SACCO, earn periodic dividends, and share in collective growth." },
];

const PublicHome = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kpiActive, setKpiActive] = useState(false);
  const kpiRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = kpiRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setKpiActive(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div>

      {/* NAV */}
      <nav className={`nav-bar ${scrolled ? "nav-bar--scrolled" : ""}`}>
        <div className="brand" onClick={() => navigate("/")}>🌿 Umova SACCO</div>

        <div className="nav-links nav-links--desktop">
          <a href="#features">Products</a>
          <a href="#kpis">Impact</a>
          <button className="nav-btn" onClick={() => navigate("/login")}>Login</button>
        </div>

        <button
          className={`nav-toggle ${menuOpen ? "nav-toggle--open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span></span><span></span><span></span>
        </button>
      </nav>

      <div className={`nav-mobile ${menuOpen ? "nav-mobile--open" : ""}`}>
        <a href="#features" onClick={() => setMenuOpen(false)}>Products</a>
        <a href="#kpis" onClick={() => setMenuOpen(false)}>Impact</a>
        <button className="nav-btn nav-btn--full" onClick={() => { setMenuOpen(false); navigate("/login"); }}>Login</button>
      </div>

      {/* HERO */}
      <div style={hero}>
        <h1>Build Your Financial Future With Us</h1>
        <p>
          Save. Borrow. Grow. A member-driven SACCO designed to empower
          your financial journey.
        </p>
        <div style={heroActions}>
          <button style={heroPrimaryBtn} onClick={() => navigate("/apply")}>Become a Member</button>
          <a href="#features" style={heroSecondaryBtn}>See Products</a>
        </div>
      </div>

      {/* KPI DASHBOARD */}
      <div id="kpis" className="kpi-section" ref={kpiRef}>
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} active={kpiActive} />
        ))}
      </div>

      {/* FEATURES */}
      <div id="features" style={grid}>
        {FEATURES.map((f) => (
          <div style={card} key={f.title} className="feature-card">
            <h3>{f.icon} {f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div style={footer}>
        © {new Date().getFullYear()} Umova SACCO. All rights reserved.
      </div>

    </div>
  );
};

function KpiCard({ kpi, active }) {
  const value = useCountUp(kpi.value, active);
  return (
    <div className="kpi-card">
      <div className="kpi-value">{kpi.prefix || ""}{value.toLocaleString()}{kpi.suffix}</div>
      <div className="kpi-label">{kpi.label}</div>
    </div>
  );
}

const hero = {
  textAlign: "center",
  padding: "90px 20px",
  background: "linear-gradient(135deg,#0f172a,#1e3a8a)",
  color: "white",
};

const heroActions = {
  display: "flex",
  gap: 12,
  justifyContent: "center",
  marginTop: 26,
  flexWrap: "wrap",
};

const heroPrimaryBtn = {
  padding: "12px 26px",
  borderRadius: 999,
  border: "none",
  background: "#10b981",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const heroSecondaryBtn = {
  padding: "12px 26px",
  borderRadius: 999,
  border: "1.5px solid rgba(255,255,255,.35)",
  color: "white",
  fontWeight: 700,
  textDecoration: "none",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
  gap: 20,
  padding: 30,
};

const card = {
  background: "white",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
};

const footer = {
  textAlign: "center",
  padding: 20,
  background: "#0f172a",
  color: "white",
};

export default PublicHome;
