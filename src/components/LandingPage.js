import React, { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../asset/logo/umovalogo.png";
import "./LandingPage.css";

const FEATURES = [
  { icon: "💰", title: "Savings", text: "Grow your wealth securely with structured savings plans." },
  { icon: "🏦", title: "Loans", text: "Fast, affordable loans based on your savings history." },
  { icon: "📊", title: "Statements", text: "Real-time financial statements and audit-ready reports." },
  { icon: "🔐", title: "Secure Banking", text: "Enterprise-grade security and member data protection." },
];

const STEPS = [
  { title: "Register", text: "Sign up online in minutes with your ID and phone number." },
  { title: "Save", text: "Start a savings plan with contributions that fit your budget." },
  { title: "Qualify", text: "Build a 2-month savings history to unlock loan eligibility." },
  { title: "Borrow", text: "Apply for a loan and get a decision within 48 hours." },
];

const TESTIMONIALS = [
  { quote: "Umova helped me save consistently and get my first loan without any hassle.", name: "Jane D.", role: "Member since 2023" },
  { quote: "Professional, transparent, and reliable. My business loan was approved in two days.", name: "John M.", role: "Small business owner" },
  { quote: "The savings plan made it easy to finally afford my daughter's school fees.", name: "Grace W.", role: "Member since 2022" },
];

const FAQS = [
  { q: "Who can join Umova SACCO?", a: "Any Kenyan resident aged 18 or older with a valid national ID can become a member." },
  { q: "How much can I borrow?", a: "Members can typically borrow up to 3 times their total savings balance, subject to guarantor and income requirements." },
  { q: "How long does loan approval take?", a: "Most complete applications are reviewed and decisioned within 48 hours." },
];

function LandingPage() {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", amount: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const openModal = (e) => {
    e.preventDefault();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSubmitted(false);
    setForm({ name: "", phone: "", amount: "" });
  };

  return (
    <div className="landing-container">

      {/* ================= NAVBAR ================= */}
      <header className="landing-header">

        <div className="brand">
          <img src={logo} alt="Umova SACCO logo" className="logo" />
          <div>
            <h1>UMOVA SACCO</h1>
            <p>Smart Banking for Members</p>
          </div>
        </div>

        <nav className="nav-links-inline">
          <a href="#features">Services</a>
          <a href="#about">About</a>
          <a href="#loans">Loans</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="nav-actions">
          <Link to="/login">
            <button className="btn login-btn">Login</button>
          </Link>

          <Link to="/signup">
            <button className="btn signup-btn">Join Now</button>
          </Link>
        </div>

      </header>

      {/* ================= HERO ================= */}
      <section className="hero-section">
        <span className="hero-eyebrow">Licensed SACCO · Member-owned</span>
        <div className="hero-content">
          <h2>Secure. Smart. Member First Banking.</h2>

          <p>
            Manage savings, loans, and investments with a modern core banking system
            built for financial growth.
          </p>

          <div className="hero-buttons">
            <Link to="/login">
              <button className="btn primary">Access Account</button>
            </Link>

            <Link to="/signup">
              <button className="btn secondary">Become a Member</button>
            </Link>
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section className="sacco-info">

        <div className="card">
          <h3>Total Members</h3>
          <p>1,250+</p>
        </div>

        <div className="card">
          <h3>Total Assets</h3>
          <p>KES 120M+</p>
        </div>

        <div className="card">
          <h3>Loan Limit</h3>
          <p>3x Savings</p>
        </div>

        <div className="card">
          <h3>Active Savings</h3>
          <p>KES 80M+</p>
        </div>

      </section>

      {/* ================= ABOUT ================= */}
      <section id="about" className="about-section">
        <h2>About UMOVA SACCO</h2>

        <p>
          We are a member-driven financial institution offering secure savings,
          affordable credit, and long-term wealth-building opportunities.
          Our system is built with modern core banking architecture.
        </p>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="features">

        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <h3>{f.icon} {f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}

      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="how-section">
        <h2>How It Works</h2>
        <p className="section-sub">From sign-up to your first loan, in four simple steps.</p>

        <div className="steps">
          {STEPS.map((step, i) => (
            <div className="step" key={step.title}>
              <div className="step-number">{i + 1}</div>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= LOANS / APPLY ================= */}
      <section id="loans" className="loans-section">
        <div className="loans-wrap">
          <div>
            <h2>Loan Qualification</h2>
            <p className="section-sub" style={{ margin: "8px 0 0" }}>
              Meet these simple requirements to unlock a loan.
            </p>
            <ul>
              <li><span className="tick">✔</span> Loan amount up to 3x your savings</li>
              <li><span className="tick">✔</span> Minimum 2 months of active saving</li>
              <li><span className="tick">✔</span> Good repayment history</li>
              <li><span className="tick">✔</span> Proof of income</li>
              <li><span className="tick">✔</span> Two guarantors required</li>
            </ul>
          </div>

          <form className="apply-form" onSubmit={openModal}>
            <h3>Check Your Eligibility</h3>
            <input
              type="text"
              name="name"
              placeholder="Full name"
              value={form.name}
              onChange={handleChange}
              required
            />
            <input
              type="tel"
              name="phone"
              placeholder="Phone number"
              value={form.phone}
              onChange={handleChange}
              required
            />
            <input
              type="number"
              name="amount"
              placeholder="Desired loan amount (KES)"
              value={form.amount}
              onChange={handleChange}
              required
            />
            <button className="btn primary" type="submit">Start Application</button>
          </form>
        </div>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <section className="testimonials-section">
        <h2>What Our Members Say</h2>
        <p className="section-sub">Real stories from the Umova SACCO community.</p>

        <div className="testimonial-scroll">
          {TESTIMONIALS.map((t) => (
            <div className="testimonial-card" key={t.name}>
              <div className="stars">★★★★★</div>
              <p className="quote">"{t.quote}"</p>
              <div className="who">
                {t.name}
                <span>{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" className="faq-section">
        <h2>Frequently Asked Questions</h2>
        {FAQS.map((f) => (
          <details className="faq-item" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {/* ================= CTA ================= */}
      <section className="cta-section">
        <h2>Start Your Financial Journey Today</h2>

        <div className="cta-buttons">
          <Link to="/login">
            <button className="btn primary">Login</button>
          </Link>

          <Link to="/signup">
            <button className="btn signup-btn">Create Account</button>
          </Link>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="footer">
        <p>© {new Date().getFullYear()} UMOVA SACCO. All rights reserved.</p>
        <p>Empowering members through financial freedom.</p>
      </footer>

      {/* ================= LOAN APPLICATION MODAL ================= */}
      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} aria-label="Close">✕</button>

            {!submitted ? (
              <>
                <h3>Confirm Your Application</h3>
                <p className="modal-sub">We'll review your details and contact you within 48 hours.</p>
                <form className="apply-form" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                  <input value={form.name} readOnly />
                  <input value={form.phone} readOnly />
                  <input value={`KES ${form.amount || 0}`} readOnly />
                  <button className="btn primary" type="submit">Submit Application</button>
                </form>
              </>
            ) : (
              <>
                <h3>Application Received 🎉</h3>
                <p className="modal-sub">
                  Thanks, {form.name || "there"}! A loan officer will reach out on{" "}
                  {form.phone || "your phone"} shortly.
                </p>
                <button className="btn signup-btn" style={{ width: "100%" }} onClick={closeModal}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default LandingPage;
