import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Sun, Moon, LayoutDashboard, Users, Landmark, FileText } from "lucide-react";
import "./Dashboard.css";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/members", label: "Members", icon: Users },
  { to: "/loans", label: "Loans", icon: Landmark },
  { to: "/statements", label: "Statements", icon: FileText },
];

export default function Layout() {
  const [dark, setDark] = useState(false);
  const location = useLocation();

  const toggleTheme = () => setDark((prev) => !prev);

  return (
    <div className={`admin-layout ${dark ? "dark" : ""}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark">U</span>
          <h2>Umova SACCO</h2>
        </div>

        <nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={isActive ? "active" : ""}>
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <button className="theme-toggle" onClick={toggleTheme}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          {dark ? "Light mode" : "Dark mode"}
        </button>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-title">
            {NAV_ITEMS.find((n) => location.pathname.startsWith(n.to))?.label || "Dashboard"}
          </div>
          <div className="user-chip">
            <div className="avatar">AM</div>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
