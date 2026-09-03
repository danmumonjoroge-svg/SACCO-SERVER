import React, { useEffect, useState } from "react";
import "./DashboardMain.css";
import {
  LayoutDashboard, Wallet, Landmark, LineChart, FileText, User,
  Menu, X, LogOut, ShieldCheck, Bell,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "home",      label: "Home",      icon: LayoutDashboard },
  { key: "savings",   label: "Savings",   icon: Wallet },
  { key: "loans",     label: "Loans",     icon: Landmark },
  { key: "shares",    label: "Shares",    icon: LineChart },
  { key: "statement", label: "Statement", icon: FileText },
  { key: "profile",   label: "Profile",   icon: User },
];

export default function DashboardLayout({
  children,
  setActivePage,
  activePage,
  member,                 // optional: { name, memberNo }
  unreadNotifications = 0,
  onLogout,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the mobile sidebar automatically whenever the active page changes
  useEffect(() => setSidebarOpen(false), [activePage]);

  // Close on Escape for keyboard users
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  const activeItem = NAV_ITEMS.find((i) => i.key === activePage);
  const initials = (member?.name || "M")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  return (
    <div className="dashboard-shell">

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside className={`sidebar sidebar--desktop ${sidebarOpen ? "sidebar--open" : ""}`}>

        <div className="sidebar__logo-strip">
          <div className="sidebar__brand">
            <div className="sidebar__logo-wrap">
              <ShieldCheck size={22} color="#4ade80" />
            </div>
            <div className="sidebar__brand-text">
              <span className="sidebar__brand-name">My SACCO</span>
              <span className="sidebar__brand-tagline">Member Portal</span>
            </div>
          </div>
          <button
            className="sidebar__close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {member && (
          <div className="sidebar__identity">
            <div className="sidebar__profile-card">
              <div className="sidebar__avatar">{initials}</div>
              <div className="sidebar__member-info">
                <div className="sidebar__member-name">{member.name || "Member Account"}</div>
                <div className="sidebar__member-no">{member.memberNo || "—"}</div>
              </div>
            </div>
          </div>
        )}

        <div className="sidebar__nav-container">
          <div className="sidebar__nav-section">
            <div className="sidebar__nav-section-label">Navigate</div>
            <ul className="sidebar__nav">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.key;
                return (
                  <li key={item.key}>
                    <a
                      href={`#${item.key}`}
                      className={`sidebar__nav-link ${isActive ? "sidebar__nav-link--active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={(e) => { e.preventDefault(); setActivePage(item.key); }}
                    >
                      <span className="sidebar__nav-left">
                        <Icon size={18} className="sidebar__nav-icon" />
                        <span className="sidebar__nav-label">{item.label}</span>
                      </span>
                      {item.key === "home" && unreadNotifications > 0 && (
                        <span className="sidebar__nav-badge">{unreadNotifications}</span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="sidebar__security-strip">
          <div className="sidebar__security-card">
            <div>
              <div className="sidebar__security-label">Security Environment</div>
              <div className="sidebar__security-status">
                <span className="sidebar__pulse-dot" />
                Session encrypted
              </div>
            </div>
            <ShieldCheck size={16} className="sidebar__security-icon" />
          </div>
        </div>

        {onLogout && (
          <div className="sidebar__footer">
            <button className="sidebar__logout-btn" onClick={handleLogout}>
              <LogOut size={15} className="logout-icon" />
              Logout
            </button>
          </div>
        )}
      </aside>

      {/* ── MAIN STAGE ──────────────────────────────────────────── */}
      <div className="stage">
        <header className="appbar">
          <div className="appbar__left">
            <button
              className="appbar__menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="appbar__title-group">
              <span className="appbar__page-title">{activeItem?.label || "Dashboard"}</span>
              {member?.name && (
                <span className="appbar__subtitle">
                  Welcome back, <strong>{member.name}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="appbar__right">
            <button className="notification-btn" aria-label="Notifications">
              <Bell size={18} />
              {unreadNotifications > 0 && (
                <span className="notification-btn__badge">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </button>
            <div className="appbar__date-panel">
              <span className="appbar__date-text">
                {new Date().toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span className="appbar__ssl-badge">
                <ShieldCheck size={10} /> Secure
              </span>
            </div>
          </div>
        </header>

        <main className="stage__viewport">
          <div className="page-enter">{children}</div>
        </main>
      </div>

    </div>
  );
}
