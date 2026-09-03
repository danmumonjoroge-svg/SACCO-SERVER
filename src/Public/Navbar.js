import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Public.css";

const LINKS = [
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Loans", href: "#loans" },
];

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const isLoginActive = location.pathname === "/login";

  return (
    <div className="navbar" style={{ ...styles.bar, ...(scrolled ? styles.barScrolled : {}) }}>

      <div style={styles.logo} onClick={() => navigate("/")}>
        💚 Umova SACCO
      </div>

      {/* Desktop links */}
      <div className="nav-links" style={styles.linksDesktop}>
        {LINKS.map((link) => (
          <a key={link.label} href={link.href} style={styles.link}>
            {link.label}
          </a>
        ))}
        <span
          style={{ ...styles.link, ...styles.loginLink, ...(isLoginActive ? styles.loginActive : {}) }}
          onClick={() => navigate("/login")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") navigate("/login"); }}
        >
          Login
        </span>
      </div>

      {/* Mobile hamburger */}
      <button
        style={styles.toggle}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle navigation menu"
        aria-expanded={menuOpen}
      >
        <span style={{ ...styles.bar1, ...(menuOpen ? styles.bar1Open : {}) }} />
        <span style={{ ...styles.bar2, ...(menuOpen ? styles.bar2Open : {}) }} />
        <span style={{ ...styles.bar3, ...(menuOpen ? styles.bar3Open : {}) }} />
      </button>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={styles.mobileMenu}>
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={styles.mobileLink}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <button
            style={styles.mobileLoginBtn}
            onClick={() => { setMenuOpen(false); navigate("/login"); }}
          >
            Login
          </button>
        </div>
      )}
    </div>
  );
};

const styles = {
  bar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 24px",
    background: "linear-gradient(90deg, #0b5d3b, #0f7a4f)",
    color: "white",
    transition: "box-shadow .25s ease, padding .25s ease",
  },
  barScrolled: { boxShadow: "0 6px 20px rgba(0,0,0,0.18)", padding: "10px 24px" },
  logo: { fontWeight: 700, fontSize: 18, cursor: "pointer" },
  linksDesktop: { display: "flex", gap: 22, alignItems: "center" },
  link: { color: "white", opacity: 0.9, fontWeight: 600, cursor: "pointer", textDecoration: "none", fontSize: 14.5 },
  loginLink: { padding: "8px 18px", borderRadius: 999, background: "rgba(255,255,255,.14)" },
  loginActive: { background: "white", color: "#0b5d3b" },
  toggle: {
    display: "none",
    flexDirection: "column",
    justifyContent: "center",
    gap: 5,
    width: 34,
    height: 34,
    borderRadius: 8,
    border: "none",
    background: "rgba(255,255,255,.14)",
    cursor: "pointer",
  },
  bar1: { display: "block", width: 18, height: 2, background: "white", margin: "0 auto", borderRadius: 2, transition: "transform .25s ease" },
  bar2: { display: "block", width: 18, height: 2, background: "white", margin: "0 auto", borderRadius: 2, transition: "opacity .2s ease" },
  bar3: { display: "block", width: 18, height: 2, background: "white", margin: "0 auto", borderRadius: 2, transition: "transform .25s ease" },
  bar1Open: { transform: "translateY(7px) rotate(45deg)" },
  bar2Open: { opacity: 0 },
  bar3Open: { transform: "translateY(-7px) rotate(-45deg)" },
  mobileMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "#0b5d3b",
    padding: "14px 24px 20px",
  },
  mobileLink: { color: "white", textDecoration: "none", fontWeight: 600, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.14)" },
  mobileLoginBtn: {
    marginTop: 8,
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "#10b981",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
};

// Show the hamburger below 768px — media query isn't available in inline styles,
// so this small stylesheet injection keeps the component self-contained.
if (typeof document !== "undefined" && !document.getElementById("navbar-responsive-style")) {
  const style = document.createElement("style");
  style.id = "navbar-responsive-style";
  style.textContent = `
    @media (max-width: 768px) {
      .navbar > div:nth-child(2) { display: none !important; }
      .navbar > button { display: flex !important; }
    }
  `;
  document.head.appendChild(style);
}

export default Navbar;
