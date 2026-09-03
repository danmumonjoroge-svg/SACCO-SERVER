// ============================================================================
// FILE: src/Pages/Admin/POSRegistrationRequests.js
//
// Lists pending pos_registration_requests and lets admin/superadmin/
// manager roles approve or reject them. Approval calls the
// approve-pos-registration Edge Function (service role) which creates
// the Supabase Auth user + `users` row and emails a set-password link —
// nothing here talks to the Auth admin API directly, since that key
// must never reach the browser.
// ============================================================================

import React, { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { supabase } from "../../supabaseClient";

export default function POSRegistrationRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("pos_registration_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (err) setError(err.message);
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id, action) => {
    setBusyId(id);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/approve-pos-registration`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ requestId: id, action }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-black text-slate-800 mb-1">POS Registration Requests</h1>
      <p className="text-slate-500 text-sm mb-6">Approve to create a staff account; reject to dismiss.</p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center text-slate-400">
          <Clock size={32} className="mx-auto mb-3" />
          No pending requests.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-3xl border border-slate-100 p-6 flex items-center justify-between gap-4"
            >
              <div>
                <div className="font-bold text-slate-800">
                  {r.full_name} <span className="text-slate-400 font-normal">— {r.requested_role}</span>
                </div>
                <div className="text-sm text-slate-500">
                  {r.email} {r.phone && `· ${r.phone}`}
                </div>
                {r.notes && <div className="text-sm text-slate-400 mt-1 italic">"{r.notes}"</div>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  disabled={busyId === r.id}
                  onClick={() => review(r.id, "approve")}
                  className="h-10 px-4 rounded-xl bg-green-700 hover:bg-green-800 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 size={16} /> Approve
                </button>
                <button
                  disabled={busyId === r.id}
                  onClick={() => review(r.id, "reject")}
                  className="h-10 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  <XCircle size={16} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
