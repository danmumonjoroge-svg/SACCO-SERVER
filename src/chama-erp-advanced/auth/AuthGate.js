import React, { useState } from "react";
import { useChama } from "../ChamaContext";
import LoginPhone from "./LoginPhone";
import RegisterAccount from "./RegisterAccount";
import RegisterChama from "./RegisterChama";
import ChamaSelector from "./ChamaSelector";
import LicenseBlocked from "./LicenseBlocked";
import { Loader2 } from "lucide-react";
import "./AuthGate.css";

// -----------------------------------------------------------------------------
// AuthGate
// Wrap your dashboard/router with this instead of rendering it directly:
//
//   <ChamaProvider>
//     <AuthGate>
//       <ChamaRouter />   // or ChamaDashboard, whatever your app root uses
//     </AuthGate>
//   </ChamaProvider>
//
// AuthGate renders the right screen for the current authStage and only
// ever renders `children` once authStage === "authenticated" — i.e. a
// real phone+password session exists, the chama has been resolved
// (auto-picked if there's only one, chosen from a list otherwise), and its
// license is valid.
// -----------------------------------------------------------------------------

export default function AuthGate({ children }) {
  const { authStage } = useChama();
  const [screen, setScreen] = useState("login"); // login | register_account | register_chama

  if (authStage === "checking") {
    return (
      <div className="ag-splash">
        <Loader2 size={26} className="spin" />
      </div>
    );
  }

  if (authStage === "phone") {
    if (screen === "register_account") return <RegisterAccount onBack={() => setScreen("login")} />;
    if (screen === "register_chama") return <RegisterChama onBack={() => setScreen("login")} />;
    return (
      <LoginPhone
        onRegisterClick={() => setScreen("register_account")}
        onNewChamaClick={() => setScreen("register_chama")}
      />
    );
  }

  if (authStage === "select_chama") {
    return <ChamaSelector />;
  }

  if (authStage === "blocked") {
    return <LicenseBlocked />;
  }

  // authStage === "authenticated"
  return children;
}
