import React, { useEffect, useState } from "react";

const NAV_ITEMS = [
  { key: "home", label: "Home", icon: "🏠" },
  { key: "loans", label: "Loans", icon: "💰" },
  { key: "savings", label: "Savings", icon: "💵" },
  { key: "membership", label: "Membership", icon: "🧾" },
];

const PublicNavigation = ({ setPage, current, onLogin }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the active page changes elsewhere
  useEffect(() => setMenuOpen(false), [current]);

  const go = (page) => {
    setPage(page);
    setMenuOpen(false);
  };

  return (
    <div style={nav}>
      <div style={{ fontSize: 20, fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
        🏦 SACCO
      </div>

      {/* Desktop menu */}
      <div style={menu} className="public-nav-desktop">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            style={btn(current === item.key)}
            onClick={() => go(item.key)}
            aria-current={current === item.key ? "page" : undefined}
          >
            <span style={{ marginRight: 6 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <button style={loginBtn} onClick={onLogin}>
          Login
        </button>
      </div>

      {/* Mobile hamburger */}
      <button
        style={toggleBtn}
        className="public-nav-toggle"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle navigation menu"
        aria-expanded={menuOpen}
      >
        ☰
      </button>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={mobileMenu}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              style={mobileBtn(current === item.key)}
              onClick={() => go(item.key)}
              aria-current={current === item.key ? "page" : undefined}
            >
              <span style={{ marginRight: 8 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button style={{ ...loginBtn, width: "100%", marginLeft: 0, marginTop: 6 }} onClick={() => { setMenuOpen(false); onLogin(); }}>
            Login
          </button>
        </div>
      )}

      {/* Responsive behaviour without an external stylesheet */}
      <style>{`
        @media (max-width: 720px) {
          .public-nav-desktop { display: none !important; }
          .public-nav-toggle { display: inline-flex !important; }
        }
      `}</style>
    </div>
  );
};

export default PublicNavigation;

/* ================= styles ================= */

const nav = {
  position: "relative",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "15px 25px",
  background: "#0f172a",
  color: "white",
};

const menu = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const btn = (active) => ({
  padding: "8px 12px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  background: active ? "#2563eb" : "#1f2937",
  color: "white",
  fontWeight: active ? 700 : 500,
  transition: "background .2s ease, transform .15s ease",
});

const mobileBtn = (active) => ({
  ...btn(active),
  textAlign: "left",
  width: "100%",
});

const loginBtn = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "none",
  background: "#10b981",
  color: "white",
  cursor: "pointer",
  marginLeft: 10,
  fontWeight: 700,
};

const toggleBtn = {
  display: "none",
  padding: "6px 10px",
  borderRadius: 6,
  border: "none",
  background: "#1f2937",
  color: "white",
  fontSize: 18,
  cursor: "pointer",
};

const mobileMenu = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "#0f172a",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "12px 25px 18px",
  borderTop: "1px solid rgba(255,255,255,.08)",
  zIndex: 50,
};
