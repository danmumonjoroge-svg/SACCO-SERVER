import { useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";

const SERVICES = [
  {
    icon: "💰",
    title: "Savings",
    text: "Flexible savings accounts that grow your deposits with competitive dividends every year.",
  },
  {
    icon: "🏦",
    title: "Loans",
    text: "Fast, fair credit for school fees, business, or emergencies — up to 3x your savings.",
  },
  {
    icon: "📈",
    title: "Growth",
    text: "Investment products designed to build long-term wealth for you and your family.",
  },
];

const STEPS = [
  { title: "Register", text: "Sign up online in minutes with your ID and phone number." },
  { title: "Save", text: "Start a savings plan with contributions that fit your budget." },
  { title: "Qualify", text: "Build a 2-month savings history to unlock loan eligibility." },
  { title: "Borrow", text: "Apply for a loan and get a decision within 48 hours." },
];

const STORIES = [
  {
    quote: "Umova helped me save consistently and get my first loan without any hassle.",
    name: "Jane D.",
    role: "Member since 2023",
  },
  {
    quote: "Professional, transparent, and reliable. My business loan was approved in two days.",
    name: "John M.",
    role: "Small business owner",
  },
  {
    quote: "The savings plan made it easy to finally afford my daughter's school fees.",
    name: "Grace W.",
    role: "Member since 2022",
  },
];

const FAQS = [
  {
    q: "Who can join Umova SACCO?",
    a: "Any Kenyan resident aged 18 or older with a valid national ID can become a member.",
  },
  {
    q: "How much can I borrow?",
    a: "Members can typically borrow up to 3 times their total savings balance, subject to guarantor and income requirements.",
  },
  {
    q: "How long does loan approval take?",
    a: "Most complete applications are reviewed and decisioned within 48 hours.",
  },
];

export default function Home() {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", amount: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSubmitted(false);
    setForm({ name: "", phone: "", amount: "" });
  };

  return (
    <div className="public-v12">
      {/* NAVBAR */}
      <header className="nav">
        <div className="brand">
          <span className="brand-mark">U</span>
          Umova SACCO
        </div>

        <nav className="nav-links">
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a href="#loans">Loans</a>
          <a href="#faq">FAQ</a>
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
        <span className="hero-eyebrow">Licensed SACCO · Member-owned</span>
        <h1>
          Build Wealth.<br />Secure Your Future.
        </h1>
        <p>
          Join Umova SACCO and take control of your financial journey — save
          consistently, borrow affordably, and grow with a community that
          invests in you.
        </p>

        <div className="hero-actions">
          <Link to="/signup" className="primary">
            Join Now
          </Link>
          <a href="#about" className="secondary">
            Learn More
          </a>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-number">12,400+</div>
            <div className="stat-label">Active members</div>
          </div>
          <div className="stat">
            <div className="stat-number">KES 2.1B</div>
            <div className="stat-label">Loans disbursed</div>
          </div>
          <div className="stat">
            <div className="stat-number">48 hrs</div>
            <div className="stat-label">Avg. loan decision</div>
          </div>
          <div className="stat">
            <div className="stat-number">9.5%</div>
            <div className="stat-label">Annual dividend*</div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="products">
        <h2>Our Services</h2>
        <p className="section-sub">
          Everything you need to save with purpose and borrow with confidence.
        </p>

        <div className="grid">
          {SERVICES.map((s) => (
            <div className="card" key={s.title}>
              <div className="card-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how">
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

      {/* ABOUT */}
      <section id="about" className="products">
        <h2>About Us</h2>
        <p className="section-sub">
          A member-owned financial cooperative built on trust and shared growth.
        </p>

        <div className="grid">
          <div className="card">
            <div className="card-icon">🤝</div>
            <h3>Who We Are</h3>
            <p>A member-owned SACCO empowering individuals financially since 2015.</p>
          </div>
          <div className="card">
            <div className="card-icon">🎯</div>
            <h3>Mission</h3>
            <p>Provide accessible savings and credit services to every member.</p>
          </div>
          <div className="card">
            <div className="card-icon">🔭</div>
            <h3>Vision</h3>
            <p>Be East Africa's most trusted community-owned financial partner.</p>
          </div>
        </div>
      </section>

      {/* LOANS / APPLY */}
      <section id="loans" className="apply">
        <div className="apply-wrap">
          <div>
            <h2 style={{ textAlign: "left" }}>Loan Qualification</h2>
            <p className="section-sub" style={{ margin: "8px 0 0", textAlign: "left" }}>
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

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              setShowModal(true);
            }}
          >
            <h2 style={{ textAlign: "left", fontSize: 20 }}>Check Your Eligibility</h2>
            <input
              type="text"
              placeholder="Full name"
              value={form.name}
              name="name"
              onChange={handleChange}
              required
            />
            <input
              type="tel"
              placeholder="Phone number"
              value={form.phone}
              name="phone"
              onChange={handleChange}
              required
            />
            <input
              type="number"
              placeholder="Desired loan amount (KES)"
              value={form.amount}
              name="amount"
              onChange={handleChange}
              required
            />
            <button type="submit">Start Application</button>
          </form>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="stories">
        <h2>What Our Members Say</h2>
        <p className="section-sub">Real stories from the Umova SACCO community.</p>

        <div className="story-scroll">
          {STORIES.map((s) => (
            <div className="story-card" key={s.name}>
              <div className="stars">★★★★★</div>
              <p className="quote">"{s.quote}"</p>
              <div className="who">
                {s.name}
                <span>{s.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="faq">
        <h2>Frequently Asked Questions</h2>
        {FAQS.map((f) => (
          <details className="faq-item" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {/* CTA */}
      <section className="cta">
        <h2>Start Your Financial Journey Today</h2>
        <Link to="/signup" className="primary">
          Join Now
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
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#loans">Loans</a>
          </div>
          <div>
            <h4>Support</h4>
            <a href="#faq">FAQ</a>
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

      {/* LOAN APPLICATION MODAL */}
      {showModal && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal} aria-label="Close">
              ✕
            </button>

            {!submitted ? (
              <>
                <h3>Confirm Your Application</h3>
                <p className="modal-sub">
                  We'll review your details and contact you within 48 hours.
                </p>
                <form className="form" onSubmit={handleSubmit}>
                  <input value={form.name} readOnly />
                  <input value={form.phone} readOnly />
                  <input value={`KES ${form.amount || 0}`} readOnly />
                  <button type="submit">Submit Application</button>
                </form>
              </>
            ) : (
              <>
                <h3>Application Received 🎉</h3>
                <p className="modal-sub">
                  Thanks, {form.name || "there"}! A loan officer will reach out on{" "}
                  {form.phone || "your phone"} shortly.
                </p>
                <button
                  className="btn-solid"
                  style={{ width: "100%", padding: "12px", borderRadius: 10 }}
                  onClick={closeModal}
                >
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
