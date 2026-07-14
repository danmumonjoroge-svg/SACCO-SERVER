import React, { useState, useEffect, useMemo, Suspense } from "react";
import { supabase } from "../../supabaseClient";
import {
  Users,
  Wallet,
  CreditCard,
  Landmark,
  UserCheck,
  Send,
  Repeat,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Coins,
} from "lucide-react";

/* ---------------- LAZY LOADED MODULES ---------------- */
// Ensure these paths match your actual folder structure exactly
const Members = React.lazy(() => import("./chamamembers"));
const Contributions = React.lazy(() => import("./ChamaContributions"));
const Loans = React.lazy(() => import("./ChamaLoansDashboard"));
const Welfare = React.lazy(() => import("./ChamaWelfare"));
const Funds = React.lazy(() => import("./ChamaFunds"));
const Officials = React.lazy(() => import("./ChamaOfficial"));
const SendModule = React.lazy(() => import("./ChamasendContributions"));

/* ---------------- THEME (kept in one place so every module can match it) ---------------- */
const THEME = {
  brand: "#0d5c3f",
  brandDark: "#0a3f2c",
  brandTint: "#e3f2ea",
  gold: "#c8922f",
  goldDark: "#a8781f",
};

/* ---------------- LOADING COMPONENT ---------------- */
const Loading = () => (
  <div className="flex flex-col items-center justify-center gap-3 p-16 text-[#4c6058]">
    <span className="h-8 w-8 rounded-full border-2 border-[#c8922f] border-t-transparent animate-spin" />
    <span className="text-sm animate-pulse">Loading module...</span>
  </div>
);

const ChamaDashboard = ({ user }) => {
  const [activeModule, setActiveModule] = useState("members");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    console.log("Dashboard Session for:", user?.name);
  }, [user]);

  const menu = useMemo(
    () => [
      { key: "members", label: "Members", icon: Users },
      { key: "contributions", label: "Contributions", icon: Wallet },
      { key: "loans", label: "Loans", icon: CreditCard },
      { key: "welfare", label: "Welfare", icon: Repeat },
      { key: "funds", label: "Funds", icon: Landmark },
      { key: "officials", label: "Officials", icon: UserCheck },
      { key: "send", label: "Send", icon: Send },
    ],
    []
  );

  const activeItem = menu.find((m) => m.key === activeModule);

  // close the mobile drawer whenever a module is picked
  const selectModule = (key) => {
    setActiveModule(key);
    setMobileOpen(false);
  };

  if (!user) {
    return <div className="p-10 text-red-500">Error: No session found.</div>;
  }

  const initials = (user.name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="h-screen overflow-hidden flex bg-[#f5faf6]">
      {/* MOBILE OVERLAY */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          flex flex-col
          bg-[#0a3f2c] text-white
          transition-all duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${collapsed ? "w-20" : "w-64"}
        `}
      >
        {/* LOGO / BRAND */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 bg-gradient-to-br from-[#e0ab4c] via-[#c8922f] to-[#a8781f] text-[#2a1c04] shadow">
              <Coins size={18} />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-[#f0c987] font-bold text-base tracking-wider truncate">
                  CHAMA ERP
                </h1>
              </div>
            )}
          </div>

          <button
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>

          <button
            className="lg:hidden flex items-center justify-center w-7 h-7 rounded text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* USER CARD */}
        {!collapsed && (
          <div className="px-4 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[#0d5c3f] text-sm font-bold text-white shrink-0">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] bg-[#c8922f]/20 text-[#f0c987] rounded uppercase tracking-widest">
                  {user.role}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* NAV (scrolls independently if the menu ever grows) */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {menu.map((item) => {
            const active = activeModule === item.key;
            return (
              <button
                key={item.key}
                onClick={() => selectModule(item.key)}
                title={collapsed ? item.label : undefined}
                className={`
                  relative flex items-center gap-3 w-full p-3 rounded-lg transition-all
                  ${collapsed ? "justify-center" : ""}
                  ${
                    active
                      ? "bg-[#0d5c3f] text-white shadow"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-gradient-to-b from-[#e0ab4c] to-[#a8781f]" />
                )}
                <item.icon size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* FOOTER */}
        {!collapsed && (
          <div className="p-4 border-t border-white/10 text-[11px] text-slate-400">
            Umova Chama Platform
          </div>
        )}
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* TOP BAR */}
        <header className="flex items-center gap-3 px-4 lg:px-8 py-4 border-b border-[#dbe8e0] bg-white shrink-0">
          <button
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-[#dbe8e0] text-[#0a3f2c]"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            {activeItem && (
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#e3f2ea] text-[#0d5c3f] shrink-0">
                <activeItem.icon size={16} />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-[#4c6058] uppercase tracking-wide">Chama ERP</p>
              <h2 className="text-base font-semibold text-[#14231d] truncate">
                {activeItem?.label}
              </h2>
            </div>
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="bg-white rounded-2xl shadow-sm border border-[#dbe8e0] min-h-[85vh] p-6">
            <Suspense fallback={<Loading />}>
              {activeModule === "members" && <Members chamaId={user.chama_id} member={user} />}
              {activeModule === "contributions" && (
                <Contributions chamaId={user.chama_id} member={user} />
              )}
              {activeModule === "loans" && <Loans chamaId={user.chama_id} member={user} />}
              {/* Welfare now receives the role prop for RBAC */}
              {activeModule === "welfare" && (
                <Welfare chamaId={user.chama_id} member={user} role={user.role} />
              )}
              {activeModule === "funds" && <Funds chamaId={user.chama_id} member={user} />}
              {activeModule === "officials" && (
                <Officials chamaId={user.chama_id} member={user} />
              )}
              {activeModule === "send" && <SendModule chamaId={user.chama_id} member={user} />}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ChamaDashboard;