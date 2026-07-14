import React from "react";
import { useChama } from "../ChamaContext";
import { Building2, ChevronRight, LogOut, ShieldAlert } from "lucide-react";
import "./ChamaSelector.css";

// -----------------------------------------------------------------------------
// ChamaSelector
// Step 2 — only reached when authenticate_user() + get_user_memberships()
// found more than one chama for this phone number. Shows each chama's
// license status inline so a suspended/expired one is visibly blocked
// before the member wastes a click on it.
// -----------------------------------------------------------------------------

function licenseTone(m) {
  if (m.license_status === "active" || m.license_status === "trial") {
    if (m.license_expiry && new Date(m.license_expiry) < new Date(new Date().toDateString())) return "expired";
    return "ok";
  }
  return "blocked";
}

export default function ChamaSelector() {
  const { user, memberships, chooseMembership, logout } = useChama();

  return (
    <div className="cse-wrapper">
      <div className="cse-card">
        <div className="cse-header">
          <div>
            <h1>Choose a chama</h1>
            <p>{user?.full_name || user?.phone_number} belongs to {memberships.length} chamas</p>
          </div>
          <button className="cse-logout" onClick={logout}><LogOut size={14} /> Log out</button>
        </div>

        <div className="cse-list">
          {memberships.map((m) => {
            const tone = licenseTone(m);
            const blocked = tone !== "ok";
            return (
              <button
                key={m.chama_id}
                className={`cse-item ${blocked ? "blocked" : ""}`}
                onClick={() => chooseMembership(m)}
                disabled={blocked}
              >
                <span className="cse-item-icon"><Building2 size={16} /></span>
                <span className="cse-item-body">
                  <strong>{m.chama_name}</strong>
                  <small>{m.role} · {m.chama_no}</small>
                </span>
                {blocked ? (
                  <span className="cse-item-blocked"><ShieldAlert size={13} /> {tone === "expired" ? "License expired" : "License " + m.license_status}</span>
                ) : (
                  <ChevronRight size={16} className="cse-item-arrow" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
