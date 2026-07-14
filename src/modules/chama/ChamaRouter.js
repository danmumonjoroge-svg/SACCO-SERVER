import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import ChamaPublic from "./ChamaPublic";
import ChamaRegister from "./ChamaRegister";
import ChamaFind from "./ChamaFind";
import ChamaLogin from "./ChamaLogin";
import ChamaDashboard from "./ChamaDashboard";
import { useChama } from "./ChamaContext";

// ─────────────────────────────────────────────
// ADVANCED PROTECTED WRAPPER
// ─────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { chama, member, loading } = useChama();
  const location = useLocation();

  // 1. Show a loading screen while auth is verifying
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        <span className="ml-3">Authenticating session...</span>
      </div>
    );
  }

  // 2. Redirect to login if not authenticated, remembering where they were trying to go
  if (!chama || !member) {
    return <Navigate to="/chama/login" state={{ from: location }} replace />;
  }

  // 3. Clone the child (ChamaDashboard) to inject the member data automatically
  // This solves the 'undefined prop' issue by ensuring data is passed down
  return React.cloneElement(children, { user: member, chama });
}

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
export default function ChamaRouter() {
  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/" element={<ChamaPublic />} />
      <Route path="register" element={<ChamaRegister />} />
      <Route path="find" element={<ChamaFind />} />
      <Route path="login" element={<ChamaLogin />} />

      {/* PROTECTED ROUTES */}
      <Route
        path="home"
        element={
          <ProtectedRoute>
            <ChamaDashboard />
          </ProtectedRoute>
        }
      />

      {/* FALLBACK */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}