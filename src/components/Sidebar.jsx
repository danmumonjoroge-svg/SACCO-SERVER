// src/App.js

import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./Context/AuthContext";

import AuthPage      from "./components/Auth/AuthPage";
import AdminLogin    from "./components/Auth/AdminLogin";
import SetPassword   from "./components/Auth/SetPassword";
import PublicSite    from "./Public/PublicSite";

import DashboardMain from "./components/Dashboard/DashboardMain";
import DashboardHome from "./components/Dashboard/DashboardHome";
import Profile       from "./components/Dashboard/Profile";
import Savings       from "./components/Dashboard/Savings";
import ShareCapital  from "./components/Dashboard/ShareCapital";
import Loans         from "./components/Dashboard/Loans";
import Statements    from "./components/Dashboard/Statements";

// ─────────────────────────────────────────────
// CHAMA ERP ADVANCED
// Fully self-contained: its own login (phone + password, multi-chama
// select, license gate) and its own dashboard, built entirely from
// src/chama-erp-advanced/. Nothing from the old chama module
// (ChamaRouter.js, ChamaDashboard.js, chamamembers.js, etc.) is imported
// anywhere in this file anymore — that folder can be deleted from disk.
// ─────────────────────────────────────────────
import { ChamaProvider }        from "./chama-erp-advanced/ChamaContext";
import AuthGate                 from "./chama-erp-advanced/auth/AuthGate";
import ChamaDashboardAdvanced   from "./chama-erp-advanced/ChamaDashboardAdvanced";
import PlatformAdminGate        from "./chama-erp-advanced/platform-admin/PlatformAdminGate";
import LicenseManager           from "./chama-erp-advanced/platform-admin/LicenseManager";

import AdminLayout            from "./Pages/Admin/AdminLayout";
import AdminDashboard         from "./Pages/Admin/Dashboard";
import AdminERPDashboard      from "./Pages/Admin/ERPDashboard";
import AdminMembers           from "./Pages/Admin/Members";
import AdminMemberStatements  from "./Pages/Admin/MemberStatements";
import AdminLoans             from "./Pages/Admin/Loans";
import AdminLoanApplication   from "./Pages/Admin/LoanApplication";
import AdminLoanApproval      from "./Pages/Admin/LoanApproval";
import AdminLoanDisbursement  from "./Pages/Admin/LoanDisbursement";
import AdminLoanRepayments    from "./Pages/Admin/LoanRepayments";
import AdminLoanSchedule      from "./Pages/Admin/LoanSchedule";
import AdminLoanPenalties     from "./Pages/Admin/LoanPenalties";
import AdminInterestDashboard from "./Pages/Admin/InterestDashboard";
import AdminTrialBalance      from "./Pages/Admin/TrialBalance";
import AdminIncomeStatement   from "./Pages/Admin/IncomeStatement";
import AdminBalanceSheet      from "./Pages/Admin/BalanceSheet";
import AdminReports           from "./Pages/Admin/Reports";
import AdminPayments          from "./Pages/Admin/Payments";
import AdminSettings          from "./Pages/Admin/Settings";
import AdminStoryDashboard    from "./Pages/Admin/StoryDashboard";

// ─────────────────────────────────────────────
// POS / INVENTORY (Universal Scanning Engine)
// Self-contained under src/pos-erp/, mirroring the chama-erp-advanced
// pattern: its own pages/hooks/services/scanning engine. It does NOT
// get its own login — it's staff-only, so it rides the existing
// StaffGuard/AdminLayout auth exactly like every other admin page below.
// ─────────────────────────────────────────────
import POSPage             from "./pos-erp/pages/POSPage";
import ProductsPage        from "./pos-erp/pages/ProductsPage";
import GoodsReceivingPage  from "./pos-erp/pages/GoodsReceivingPage";

const STAFF_ROLES = ["staff", "admin", "manager", "superadmin", "auditor", "teller"];

// ─────────────────────────────────────────────
// UI LOADER
// ─────────────────────────────────────────────
function Loader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-[420px] text-center border border-slate-100">
        <div className="w-16 h-16 border-4 border-emerald-800 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">UMOVA ERP SYSTEM</h2>
        <p className="text-slate-500 text-sm mt-2 font-medium">Verifying workspace integrity...</p>
      </div>
    </div>
  );
}

function UnassignedOnboarding() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-[500px] text-center border border-slate-100">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Account Profile Missing</h2>
        <p className="text-slate-500 text-sm mt-3 leading-relaxed">
          Your credentials are authenticated but your account UID is not linked
          to an active record in the <span className="font-bold text-slate-700">members</span> or{" "}
          <span className="font-bold text-slate-700">users</span> tables.
        </p>
        <button
          onClick={logout}
          className="mt-6 w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-2xl transition shadow-md"
        >
          Disconnect Session
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GUARDS
// ─────────────────────────────────────────────
function MemberGuard() {
  const { user, loading, role } = useAuth();

  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!role) return <Loader />;
  if (role === "unassigned") return <Navigate to="/unassigned-onboarding" replace />;
  if (STAFF_ROLES.includes(role)) return <Navigate to="/admin/dashboard" replace />;
  if (role !== "member") return <Navigate to="/login" replace />;

  return <Outlet />;
}

// ─────────────────────────────────────────────
// STAFF GUARD
// ─────────────────────────────────────────────
function StaffGuard() {
  const { user, loading, role } = useAuth();

  if (loading) return <Loader />;
  if (!user) return <Navigate to="/admin-login" replace />;
  if (!role) return <Loader />;
  if (role === "unassigned") return <Navigate to="/unassigned-onboarding" replace />;
  if (!STAFF_ROLES.includes(role)) return <Navigate to="/member/dashboard" replace />;

  return <Outlet />;
}

function PostLoginRedirect() {
  const { user, loading, role } = useAuth();

  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!role) return <Loader />;

  if (role === "unassigned") return <Navigate to="/unassigned-onboarding" replace />;
  if (role === "member") return <Navigate to="/member/dashboard" replace />;
  if (STAFF_ROLES.includes(role)) return <Navigate to="/admin/dashboard" replace />;

  return <Navigate to="/" replace />;
}

function AdminLoginRoute() {
  const { user, loading, role } = useAuth();

  if (loading) return <Loader />;

  if (user && role && STAFF_ROLES.includes(role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (user && role === "member") {
    return <Navigate to="/member/dashboard" replace />;
  }

  return <AdminLogin />;
}

function MemberLoginRoute() {
  const { user, loading, role } = useAuth();

  if (loading) return <Loader />;

  if (user && role === "member") {
    return <Navigate to="/member/dashboard" replace />;
  }
  if (user && role && STAFF_ROLES.includes(role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <AuthPage />;
}

// ─────────────────────────────────────────────
// ENGINE CORE
// ─────────────────────────────────────────────
function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicSite />} />
      <Route path="/unassigned-onboarding" element={<UnassignedOnboarding />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route path="/login" element={<MemberLoginRoute />} />
      <Route path="/admin-login" element={<AdminLoginRoute />} />

      {/*
        Chama ERP Advanced — self-contained: its own provider, its own
        login gate, its own dashboard. AuthGate handles phone+password
        login, multi-chama selection, and license checking on its own;
        ChamaDashboardAdvanced only ever renders once all three have
        passed. No route matching inside — it's a single-page sidebar
        dashboard, not a sub-router, so "/chama" is enough (no /*).
      */}
      <Route
        path="/chama"
        element={
          <ChamaProvider>
            <AuthGate>
              <ChamaDashboardAdvanced />
            </AuthGate>
          </ChamaProvider>
        }
      />

      {/*
        Platform-level chama licensing. Deliberately outside ChamaProvider/
        AuthGate — this is what turns a chama's license on in the first
        place, so it can't depend on a chama already being logged into.
        Gated by a single shared key (REACT_APP_PLATFORM_ADMIN_KEY), not a
        real login — see PlatformAdminGate.js for why, and what to replace
        it with before more than one person needs access.
      */}
      <Route
        path="/platform-admin"
        element={
          <PlatformAdminGate>
            <LicenseManager />
          </PlatformAdminGate>
        }
      />

      <Route path="/redirect" element={<PostLoginRedirect />} />

      <Route path="/member" element={<MemberGuard />}>
        <Route element={<DashboardMain />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardHome />} />
          <Route path="profile" element={<Profile />} />
          <Route path="savings" element={<Savings />} />
          <Route path="shares" element={<ShareCapital />} />
          <Route path="loans" element={<Loans />} />
          <Route path="statement" element={<Statements />} />
        </Route>
      </Route>

      <Route path="/admin" element={<StaffGuard />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="erp-dashboard" element={<AdminERPDashboard />} />
          <Route path="members" element={<AdminMembers />} />
          <Route path="member-statements" element={<AdminMemberStatements />} />
          <Route path="loans" element={<AdminLoans />} />
          <Route path="loan-application" element={<AdminLoanApplication />} />
          <Route path="loan-approval" element={<AdminLoanApproval />} />
          <Route path="loan-disbursement" element={<AdminLoanDisbursement />} />
          <Route path="loan-repayments" element={<AdminLoanRepayments />} />
          <Route path="loan-schedule" element={<AdminLoanSchedule />} />
          <Route path="loan-penalties" element={<AdminLoanPenalties />} />
          <Route path="interest-dashboard" element={<AdminInterestDashboard />} />
          <Route path="trial-balance" element={<AdminTrialBalance />} />
          <Route path="income-statement" element={<AdminIncomeStatement />} />
          <Route path="balance-sheet" element={<AdminBalanceSheet />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="stories" element={<AdminStoryDashboard />} />

          {/* POS / Inventory (Universal Scanning Engine) — staff-only,
              same StaffGuard/AdminLayout as everything else in this block.
              TODO: POSPage/GoodsReceivingPage expect businessId/branchId
              props — currently unset. Once AuthContext.js confirms how
              tenant/business/branch live on the logged-in user, either
              pull them from useAuth() inside each page, or read them
              here from route params (e.g. /admin/pos/:branchId). Left
              unset rather than guessed. */}
          <Route path="pos" element={<POSPage />} />
          <Route path="pos/products" element={<ProductsPage />} />
          <Route path="pos/goods-receiving" element={<GoodsReceivingPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;