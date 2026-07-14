import React, { useState } from "react";
import { useChama } from "../ChamaContext";
import { User, Phone, Lock, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import "./RegisterAccount.css";

// -----------------------------------------------------------------------------
// RegisterAccount
// First-time phone+password setup. A secretary/official typically adds a
// person to chama_members first (name, phone, role) when they join the
// chama; this screen lets that person "claim" their login the first time
// they sign in, or register standalone if no chama has added them yet.
// -----------------------------------------------------------------------------

export default function RegisterAccount({ onBack }) {
  const { registerUser, authBusy, authError } = useChama();
  const [form, setForm] = useState({ full_name: "", phone: "", password: "", confirm: "" });
  const [localError, setLocalError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (form.password.length < 6) return setLocalError("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setLocalError("Passwords don't match.");
    try {
      await registerUser(form.phone, form.password, form.full_name);
    } catch {
      // authError from context already surfaces the server-side reason
    }
  };

  return (
    <div className="reg-wrapper">
      <div className="reg-card">
        <button className="reg-back" onClick={onBack}><ArrowLeft size={14} /> Back to login</button>

        <h1>Create your account</h1>
        <p className="reg-subtitle">If your chama has already added you as a member, use the same phone number — you'll be linked automatically once you log in with it.</p>

        {(localError || authError) && <div className="reg-error"><AlertCircle size={14} /> {localError || authError}</div>}

        <form onSubmit={submit}>
          <label>
            <span>Full name</span>
            <div className="reg-input-group">
              <User size={15} />
              <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
            </div>
          </label>

          <label>
            <span>Phone number</span>
            <div className="reg-input-group">
              <Phone size={15} />
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="07XX XXX XXX" required />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="reg-input-group">
              <Lock size={15} />
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
            </div>
          </label>

          <label>
            <span>Confirm password</span>
            <div className="reg-input-group">
              <Lock size={15} />
              <input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} required />
            </div>
          </label>

          <button type="submit" className="reg-submit" disabled={authBusy}>
            {authBusy ? <Loader2 size={16} className="spin" /> : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
