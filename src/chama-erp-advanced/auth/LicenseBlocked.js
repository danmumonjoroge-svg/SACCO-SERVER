import React from "react";
import { useChama } from "../ChamaContext";
import { ShieldAlert, LogOut, ArrowLeft } from "lucide-react";
import "./LicenseBlocked.css";

// -----------------------------------------------------------------------------
// LicenseBlocked
// The final gate before a dashboard opens: "check chama license" in the
// flow diagram. Reached either straight after a single-membership login or
// after picking a chama from ChamaSelector.
// -----------------------------------------------------------------------------

export default function LicenseBlocked() {
  const { licenseError, memberships, backToChamaList, logout } = useChama();

  return (
    <div className="lcb-wrapper">
      <div className="lcb-card">
        <span className="lcb-icon"><ShieldAlert size={26} /></span>
        <h1>Access unavailable</h1>
        <p>{licenseError || "This chama's license is not currently active."}</p>

        <div className="lcb-actions">
          {memberships.length > 1 && (
            <button className="lcb-back" onClick={backToChamaList}><ArrowLeft size={14} /> Choose another chama</button>
          )}
          <button className="lcb-logout" onClick={logout}><LogOut size={14} /> Log out</button>
        </div>
      </div>
    </div>
  );
}
