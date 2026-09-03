import { Link } from "react-router-dom";
import "./LandingPage.css";

const VALUES = [
  { icon: "🛡️", title: "Integrity", text: "We do what's right for our members, even when no one is watching." },
  { icon: "🔍", title: "Transparency", text: "Clear terms, honest communication, and no hidden fees — ever." },
  { icon: "👥", title: "Member Focus", text: "Every product and decision starts with what's best for our members." },
  { icon: "📊", title: "Accountability", text: "We hold ourselves to the same standards we expect from our members." },
];

const MILESTONES = [
  { year: "2015", text: "Umova SACCO founded by 40 members with a shared savings goal." },
  { year: "2018", text: "Crossed 1,000 members and launched our first loan products." },
  { year: "2022", text: "Reached KES 1B in cumulative loans disbursed to members." },
  { year: "2026", text: "12,400+ members strong, with digital savings and loans nationwide." },
];

export default function About() {
  return (
    <div className="public-v12">
      {/* NAVBAR */}
      <header className="nav">
        <div className="brand">
          <span className="brand-mark">U</span>
          Umova SACCO
        </div>

        <nav className="nav-links">
          <Link to="/">Home</Link>
          <a href="#values">Our Values</a>
          <a href="#story">Our Story</a>
          <Link to="/login" className="btn-ghost">
            Login
          </Link>
          <Link to="/signup" className="btn-solid">
            Sign Up
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="hero">
        <span className="hero-eyebrow">Est. 2015 · Member-owned</span>
        <h1>About Umova SACCO</h1>
        <p>
          We're a community of members who believe financial security should
          be built together — through disciplined saving, fair credit, and
          shared growth.
        </p>
      </section>

      {/* MISSION / VISION */}
      <section className="products">
        <h2>Our Purpose</h2>
        <p className="section-sub">What drives everything we do, every day.</p>

        <div className="grid">
          <div className="card">
            <div className="card-icon">🎯</div>
            <h3>Mission</h3>
            <p>To empower members financially through savings and affordable credit.</p>
          </div>
          <div className="card">
            <div className="card-icon">🔭</div>
            <h3>Vision</h3>
            <p>To be a leading SACCO in financial inclusion and member prosperity.</p>
          </div>
          <div className="card">
            <div className="card-icon">🤝</div>
            <h3>Promise</h3>
            <p>Fair terms, fast decisions, and a team that treats your goals as our own.</p>
          </div>
        </div>
      </section>

      {/* CORE VALUES */}
      <section id="values" className="how">
        <h2>Core Values</h2>
        <p className="section-sub">The principles that guide every decision we make.</p>

        <div className="steps">
          {VALUES.map((v) => (
            <div className="step" key={v.title}>
              <div className="step-number" style={{ background: "transparent", fontSize: 22 }}>
                {v.icon}
              </div>
              <h4>{v.title}</h4>
              <p>{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* OUR STORY / TIMELINE */}
      <section id="story" className="products">
        <h2>Our Story</h2>
        <p className="section-sub">From 40 founding members to a nationwide community.</p>

        <div className="grid">
          {MILESTONES.map((m) => (
            <div className="card" key={m.year}>
              <div className="card-icon" style={{ background: "transparent", color: "#0f5132", fontWeight: 800 }}>
                {m.year}
              </div>
              <p style={{ padding: "0 18px 20px" }}>{m.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <h2>Ready to join the Umova family?</h2>
        <Link to="/signup" className="primary">
          Become a Member
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <h4>Umova SACCO</h4>
            <p>Empowering members financially through savings and affordable credit since 2015.</p>
          </div>
          <div>
            <h4>Quick Links</h4>
            <Link to="/">Home</Link>
            <a href="#values">Our Values</a>
            <a href="#story">Our Story</a>
          </div>
          <div>
            <h4>Support</h4>
            <Link to="/login">Login</Link>
            <Link to="/signup">Sign Up</Link>
          </div>
          <div>
            <h4>Contact</h4>
            <p>hello@umovasacco.co.ke</p>
            <p>+254 700 000 000</p>
            <p>Nairobi, Kenya</p>
          </div>
        </div>
        <div className="footer-bottom">© 2026 Umova SACCO. All rights reserved.</div>
      </footer>
    </div>
  );
}
