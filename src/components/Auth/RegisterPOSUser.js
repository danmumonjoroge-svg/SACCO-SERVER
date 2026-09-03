// ============================================================================
// FILE: src/components/Auth/RegisterPOSUser.js
//
// Public self-registration for staff/POS access. Does NOT create a
// Supabase Auth user or a `users` row directly — it only inserts a row
// into `pos_registration_requests`. An admin must approve the request
// (see Pages/Admin/POSRegistrationRequests.js) before an account exists
// and login becomes possible. This keeps POS/staff access gated even
// though the form itself is public.
// ============================================================================

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "../../supabaseClient";

const ROLE_OPTIONS = [
  { value: "cashier", label: "Cashier" },
  { value: "staff", label: "General Staff" },
  { value: "teller", label: "Teller" },
];

export default function RegisterPOSUser() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    national_id: "",
    requested_role: "cashier",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Full name and email are required.");
      return;
    }

    setBusy(true);
    const { error: insertErr } = await supabase.from("pos_registration_requests").insert({
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      national_id: form.national_id.trim() || null,
      requested_role: form.requested_role,
      notes: form.notes.trim() || null,
    });
    setBusy(false);

    if (insertErr) {
      setError(
        insertErr.code === "23505"
          ? "A request with this email is already pending review."
          : "Could not submit your request. Please try again."
      );
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-black flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-[35px] overflow-hidden shadow-2xl p-10 text-center">
          <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-800">Request Submitted</h1>
          <p className="text-slate-500 mt-3 leading-relaxed">
            An admin will review your request for{" "}
            <strong>{ROLE_OPTIONS.find((r) => r.value === form.requested_role)?.label}</strong> access.
            You'll get an email to set your password once it's approved.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-6 w-full h-12 bg-green-800 hover:bg-green-700 text-white rounded-2xl font-bold"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-950 to-black flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-[35px] overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-green-800 to-emerald-700 p-8 text-white">
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 text-green-100 text-sm mb-4"
          >
            <ArrowLeft size={16} /> Back to login
          </button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
              <UserPlus size={30} />
            </div>
            <div>
              <h1 className="text-2xl font-black">Register for POS Access</h1>
              <p className="text-green-100 text-sm">Staff / cashier account request</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
              <AlertTriangle size={20} className="text-red-600 shrink-0" />
              <div className="text-red-700 text-sm">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="font-semibold text-sm block mb-2">Full Name</label>
              <input
                value={form.full_name}
                onChange={update("full_name")}
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 focus:border-green-700 focus:ring-4 focus:ring-green-100 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-sm block mb-2">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 focus:border-green-700 focus:ring-4 focus:ring-green-100 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-sm block mb-2">Phone Number</label>
              <input
                value={form.phone}
                onChange={update("phone")}
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 focus:border-green-700 focus:ring-4 focus:ring-green-100 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-sm block mb-2">National ID</label>
              <input
                value={form.national_id}
                onChange={update("national_id")}
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 focus:border-green-700 focus:ring-4 focus:ring-green-100 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-sm block mb-2">Position Requested</label>
              <select
                value={form.requested_role}
                onChange={update("requested_role")}
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 focus:border-green-700 focus:ring-4 focus:ring-green-100 outline-none"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-sm block mb-2">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={update("notes")}
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border border-slate-300 focus:border-green-700 focus:ring-4 focus:ring-green-100 outline-none"
              />
            </div>

            <button
              disabled={busy}
              className="w-full h-14 bg-green-800 hover:bg-green-700 disabled:opacity-60 text-white rounded-2xl font-bold flex items-center justify-center gap-3"
            >
              {busy ? (
                <>
                  <Loader2 size={20} className="animate-spin" /> Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
