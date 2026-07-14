import React, { useState, useEffect } from "react";
import { ShieldCheck, Lock } from "lucide-react";
import "./PlatformAdminGate.css";

// -----------------------------------------------------------------------------
// PlatformAdminGate
// A deliberately simple gate — NOT a real auth system. This screen manages
// licensing across every chama on the platform, so it can't use
// hasRole()/ChamaContext (those are scoped to one already-selected,
// already-licensed chama — a chicken-and-egg problem for the very screen
// that turns a chama's license on in the first place).
//
// Protected by a single shared passphrase read from
// REACT_APP_PLATFORM_ADMIN_KEY. This is fine for "the one person who runs
// this ERP for all chamas" today, but it is NOT tenant-scoped, NOT
// per-person, and NOT auditable beyond what you add yourself. Before
// handing this screen to more than one trusted person, replace it with a
// real login (e.g. a `platform_admins` table + its own authenticate_*
// function, same bcrypt pattern as chama_users) rather than a shared key.
// -----------------------------------------------------------------------------

const SESSION_KEY = "platform_admin_unlocked";

export default function PlatformAdminGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "true") setUnlocked(true);
  }, []);

  const configuredKey = process.env.REACT_APP_PLATFORM_ADMIN_KEY;

  const submit = (e) => {
    e.preventDefault();
    if (!configuredKey) {
      setError("REACT_APP_PLATFORM_ADMIN_KEY isn't set in your .env — nothing to check against.");
      return;
    }
    if (input === configuredKey) {
      sessionStorage.setItem(SESSION_KEY, "true");
      setUnlocked(true);
    } else {
      setError("Incorrect key.");
    }
  };

  if (unlocked) return children;

  return (
    <div className="pag-wrapper">
      <div className="pag-card">
        <span className="pag-icon"><ShieldCheck size={22} /></span>
        <h1>Platform Admin</h1>
        <p>Manages chama licensing across the whole platform. Not tied to any chama login.</p>

        {error && <div className="pag-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="pag-input-group">
            <Lock size={14} />
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Admin key"
              autoFocus
            />
          </div>
          <button type="submit">Enter</button>
        </form>
      </div>
    </div>
  );
}
