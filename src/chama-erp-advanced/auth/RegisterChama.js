import React, { useState } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import { Building2, User, Phone, Lock, ArrowLeft, Loader2, AlertCircle, Sparkles } from "lucide-react";
import "./RegisterChama.css";

// -----------------------------------------------------------------------------
// RegisterChama
// Different from RegisterAccount.js — that links a login to a member
// someone else already added to an existing chama. This one forms a
// brand-new chama: the person filling this in becomes its first member,
// as chairperson, on a trial license (works immediately — see
// register_chama() in sql/004_register_chama.sql).
// -----------------------------------------------------------------------------

function suggestChamaNo() {
  return "CHM-" + Math.floor(100000 + Math.random() * 900000);
}

const emptyForm = {
  chama_name: "", chama_no: suggestChamaNo(),
  founder_name: "", founder_phone: "", password: "", confirm: "",
};

export default function RegisterChama({ onBack }) {
  const { loginWithPhone } = useChama();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.chama_name.trim()) return setError("Give your chama a name.");
    if (!form.chama_no.trim()) return setError("Give your chama a code.");
    if (!form.founder_name.trim()) return setError("Your name is required.");
    if (!form.founder_phone.trim()) return setError("Your phone number is required.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");

    setSubmitting(true);
    const { error: err } = await supabase.rpc("register_chama", {
      p_chama_name: form.chama_name,
      p_chama_no: form.chama_no,
      p_founder_name: form.founder_name,
      p_founder_phone: form.founder_phone,
      p_founder_password: form.password,
    });

    if (err) {
      setSubmitting(false);
      setError(err.message || "Could not create the chama.");
      return;
    }

    // Chama, founder membership, and login all exist now — go through the
    // normal login flow so licensing/session logic runs exactly once, in
    // exactly one place.
    await loginWithPhone(form.founder_phone, form.password);
    setSubmitting(false);
  };

  return (
    <div className="rgc-wrapper">
      <div className="rgc-card">
        <button className="rgc-back" onClick={onBack}><ArrowLeft size={14} /> Back to login</button>

        <div className="rgc-title-row">
          <span className="rgc-icon"><Sparkles size={18} /></span>
          <div>
            <h1>Start a new chama</h1>
            <p>You'll become its chairperson. Your chama starts on a free trial — no waiting on approval.</p>
          </div>
        </div>

        {error && <div className="rgc-error"><AlertCircle size={14} /> {error}</div>}

        <form onSubmit={submit}>
          <div className="rgc-section-label"><Building2 size={13} /> Chama details</div>
          <label>
            <span>Chama name</span>
            <input value={form.chama_name} onChange={(e) => update("chama_name", e.target.value)} placeholder="e.g. Upendo Investment Group" required />
          </label>
          <label>
            <span>Chama code</span>
            <input value={form.chama_no} onChange={(e) => update("chama_no", e.target.value)} required />
          </label>

          <div className="rgc-section-label"><User size={13} /> Your details (founder / chairperson)</div>
          <label>
            <span>Your name</span>
            <div className="rgc-input-group"><User size={14} /><input value={form.founder_name} onChange={(e) => update("founder_name", e.target.value)} required /></div>
          </label>
          <label>
            <span>Your phone number</span>
            <div className="rgc-input-group"><Phone size={14} /><input type="tel" value={form.founder_phone} onChange={(e) => update("founder_phone", e.target.value)} placeholder="07XX XXX XXX" required /></div>
          </label>
          <label>
            <span>Password</span>
            <div className="rgc-input-group"><Lock size={14} /><input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required /></div>
          </label>
          <label>
            <span>Confirm password</span>
            <div className="rgc-input-group"><Lock size={14} /><input type="password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} required /></div>
          </label>

          <button type="submit" className="rgc-submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : "Create my chama"}
          </button>
        </form>
      </div>
    </div>
  );
}
