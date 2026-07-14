import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import {
  PlusCircle, Eye, EyeOff, X, Loader2, CheckCircle, XCircle, Lock, Users, FolderClosed, AlertCircle,
} from "lucide-react";
import "./WelfareCaseDesk.css";

// -----------------------------------------------------------------------------
// WelfareCaseDesk
// Welfare-officer-only (chairperson/treasurer/secretary get full read access
// via isOfficialViewer, but only the welfare officer or admin can open/edit/
// close a case — matches "official have full rights to see the welfare").
//
// Uses the new canonical welfare_case_participants table: one row per
// (case, member) carrying BOTH visibility (can_see) and the individually
// expected contribution amount for that member — set together, in one place,
// exactly as requested.
// -----------------------------------------------------------------------------

const EVENT_TYPES = [
  { value: "funeral", label: "Funeral" },
  { value: "sickness", label: "Sickness" },
  { value: "wedding", label: "Wedding" },
  { value: "achievement", label: "Achievement" },
  { value: "other", label: "Other" },
];

function formatKES(v) { return `KES ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

const emptyCaseForm = { title: "", event_type: "other", beneficiary_member_id: "", description: "", expected_amount: "", amount_visible_to_members: true, is_visible_to_beneficiary: true };

export default function WelfareCaseDesk({ chamaId: chamaIdProp }) {
  const { chama, member, hasRole } = useChama();
  const chamaId = chamaIdProp || chama?.id;
  const canManage = hasRole(["welfare_officer", "admin"]);
  const canView = canManage || hasRole(["chairperson", "treasurer", "secretary"]); // officials have full read rights

  const [cases, setCases] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyCaseForm);
  const [participants, setParticipants] = useState([]); // [{member_id, can_see, expected_contribution}]
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [activeCase, setActiveCase] = useState(null);
  const [caseContribs, setCaseContribs] = useState([]);
  const [caseParticipants, setCaseParticipants] = useState([]);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    const [casesRes, membersRes] = await Promise.all([
      supabase.from("welfare_cases").select("*").eq("chama_id", chamaId).order("opened_at", { ascending: false }),
      supabase.from("chama_members").select("id,name").eq("chama_id", chamaId).eq("status", "active"),
    ]);
    setCases(casesRes.data || []);
    setMembers(membersRes.data || []);
    setLoading(false);
  }, [chamaId]);

  useEffect(() => { load(); }, [load]);

  const toggleParticipant = (memberId) => {
    setParticipants((p) => {
      const exists = p.find((x) => x.member_id === memberId);
      if (exists) return p.filter((x) => x.member_id !== memberId);
      return [...p, { member_id: memberId, can_see: true, expected_contribution: "" }];
    });
  };
  const updateParticipant = (memberId, field, value) =>
    setParticipants((p) => p.map((x) => (x.member_id === memberId ? { ...x, [field]: value } : x)));

  const selectAllParticipants = () =>
    setParticipants(members.map((m) => ({ member_id: m.id, can_see: true, expected_contribution: "" })));

  const openCase = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError("Give the case a title.");
    if (participants.length === 0) return setError("Choose at least one member who should see this case.");

    setSubmitting(true);
    const { data: created, error: err } = await supabase.from("welfare_cases").insert([{
      chama_id: chamaId,
      title: form.title,
      event_type: form.event_type,
      beneficiary_member_id: form.beneficiary_member_id || null,
      beneficiary_name: members.find((m) => m.id === form.beneficiary_member_id)?.name || null,
      description: form.description || null,
      expected_amount: Number(form.expected_amount) || 0,
      amount_visible_to_members: form.amount_visible_to_members,
      is_visible_to_beneficiary: form.is_visible_to_beneficiary,
      opened_by: member.id,
      status: "open",
    }]).select().single();

    if (err) { setSubmitting(false); return setError(err.message); }

    const rows = participants.map((p) => ({
      case_id: created.id,
      member_id: p.member_id,
      can_see: p.can_see,
      expected_contribution: Number(p.expected_contribution) || 0,
      added_by: member.id,
    }));
    const { error: partErr } = await supabase.from("welfare_case_participants").insert(rows);

    setSubmitting(false);
    if (partErr) return setError(partErr.message);

    setToast("Case opened.");
    setTimeout(() => setToast(null), 3000);
    setForm(emptyCaseForm);
    setParticipants([]);
    setFormOpen(false);
    load();
  };

  const openCaseDetail = async (c) => {
    setActiveCase(c);
    const [contribRes, partRes] = await Promise.all([
      supabase.from("welfare_contributions").select("*").eq("case_id", c.id).order("created_at", { ascending: false }),
      supabase.from("welfare_case_participants").select("*, chama_members(name)").eq("case_id", c.id),
    ]);
    setCaseContribs(contribRes.data || []);
    setCaseParticipants(partRes.data || []);
  };

  const approveContribution = async (contribId) => {
    await supabase.from("welfare_contributions").update({ status: "Approved", approved_by: member.id, approved_at: new Date().toISOString() }).eq("id", contribId);
    openCaseDetail(activeCase);
  };
  const rejectContribution = async (contribId) => {
    await supabase.from("welfare_contributions").update({ status: "Rejected" }).eq("id", contribId);
    openCaseDetail(activeCase);
  };

  const closeCase = async () => {
    await supabase.from("welfare_cases").update({ status: "closed", closed_by: member.id, closed_at: new Date().toISOString() }).eq("id", activeCase.id);
    setActiveCase(null);
    load();
  };

  const totalRaised = useMemo(() => caseContribs.filter((c) => c.status === "Approved").reduce((s, c) => s + Number(c.amount), 0), [caseContribs]);

  if (!canView) {
    return (
      <div className="wcd-locked">
        <Lock size={18} />
        <p>Welfare case management is restricted to the welfare officer and chama officials.</p>
      </div>
    );
  }

  return (
    <div className="wcd-page">
      <div className="wcd-header">
        <div>
          <h2>Welfare Cases</h2>
          <p>{canManage ? "Open a case, choose who can see it, and set what each person is expected to give." : "Read-only view — officials can see every case."}</p>
        </div>
        {canManage && (
          <button className="wcd-new-btn" onClick={() => setFormOpen((v) => !v)}>
            <PlusCircle size={16} /> New case
          </button>
        )}
      </div>

      {formOpen && (
        <form className="wcd-form" onSubmit={openCase}>
          {error && <div className="wcd-error"><AlertCircle size={14} /> {error}</div>}

          <div className="wcd-form-grid">
            <label>
              Title
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Support for the Otieno family" required />
            </label>
            <label>
              Event type
              <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              Beneficiary (optional)
              <select value={form.beneficiary_member_id} onChange={(e) => setForm((f) => ({ ...f, beneficiary_member_id: e.target.value }))}>
                <option value="">Not a member / not specified</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label>
              Overall target amount
              <input type="number" min="0" value={form.expected_amount} onChange={(e) => setForm((f) => ({ ...f, expected_amount: e.target.value }))} />
            </label>
            <label className="wcd-span-2">
              Description
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <label className="wcd-checkbox">
              <input type="checkbox" checked={form.amount_visible_to_members} onChange={(e) => setForm((f) => ({ ...f, amount_visible_to_members: e.target.checked }))} />
              Show contribution amounts to members with access
            </label>
            <label className="wcd-checkbox">
              <input type="checkbox" checked={form.is_visible_to_beneficiary} onChange={(e) => setForm((f) => ({ ...f, is_visible_to_beneficiary: e.target.checked }))} />
              Visible to the beneficiary
            </label>
          </div>

          <div className="wcd-participants">
            <div className="wcd-participants-head">
              <h4><Users size={14} /> Who can see this case, and what's expected of them</h4>
              <button type="button" onClick={selectAllParticipants}>Add all members</button>
            </div>
            <div className="wcd-participant-list">
              {members.map((m) => {
                const p = participants.find((x) => x.member_id === m.id);
                return (
                  <div className={`wcd-participant-row ${p ? "selected" : ""}`} key={m.id}>
                    <label className="wcd-participant-toggle">
                      <input type="checkbox" checked={!!p} onChange={() => toggleParticipant(m.id)} />
                      {m.name}
                    </label>
                    {p && (
                      <input
                        type="number" min="0" placeholder="Expected amount" value={p.expected_contribution}
                        onChange={(e) => updateParticipant(m.id, "expected_contribution", e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="wcd-form-actions">
            <button type="button" className="wcd-cancel" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" className="wcd-submit" disabled={submitting}>
              {submitting ? <Loader2 size={15} className="spin" /> : "Open case"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="wcd-loading"><Loader2 size={20} className="spin" /></div>
      ) : cases.length === 0 ? (
        <div className="wcd-empty"><FolderClosed size={22} /><p>No welfare cases yet.</p></div>
      ) : (
        <div className="wcd-grid">
          {cases.map((c) => (
            <div className={`wcd-card ${c.status}`} key={c.id} onClick={() => openCaseDetail(c)}>
              <div className="wcd-card-top">
                <h3>{c.title}</h3>
                <span className={`wcd-status ${c.status}`}>{c.status}</span>
              </div>
              <p className="wcd-type">{c.event_type} {c.beneficiary_name ? `· ${c.beneficiary_name}` : ""}</p>
              {c.amount_visible_to_members ? (
                <p className="wcd-target">Target: {formatKES(c.expected_amount)}</p>
              ) : (
                <p className="wcd-target hidden"><EyeOff size={12} /> Amount hidden from members</p>
              )}
            </div>
          ))}
        </div>
      )}

      {activeCase && (
        <div className="wcd-modal-overlay" onClick={() => setActiveCase(null)}>
          <div className="wcd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wcd-modal-head">
              <div>
                <h3>{activeCase.title}</h3>
                <p>{activeCase.event_type} {activeCase.beneficiary_name ? `· ${activeCase.beneficiary_name}` : ""}</p>
              </div>
              <button onClick={() => setActiveCase(null)}><X size={18} /></button>
            </div>

            <div className="wcd-modal-summary">
              <div><span>Raised</span><strong>{formatKES(totalRaised)}</strong></div>
              <div><span>Target</span><strong>{formatKES(activeCase.expected_amount)}</strong></div>
              <div><span>Participants</span><strong>{caseParticipants.length}</strong></div>
            </div>

            <h4>Contributions</h4>
            {caseContribs.length === 0 ? (
              <p className="wcd-empty-inline">No contributions recorded yet.</p>
            ) : (
              <div className="wcd-contrib-list">
                {caseContribs.map((cc) => (
                  <div className="wcd-contrib-row" key={cc.id}>
                    <span>{cc.amount_visible ? formatKES(cc.amount) : "Amount hidden"}</span>
                    <span className={`wcd-contrib-status ${cc.status.toLowerCase()}`}>{cc.status}</span>
                    {canManage && cc.status === "Pending" && (
                      <div className="wcd-contrib-actions">
                        <button onClick={() => approveContribution(cc.id)}><CheckCircle size={13} /></button>
                        <button onClick={() => rejectContribution(cc.id)}><XCircle size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canManage && activeCase.status === "open" && (
              <button className="wcd-close-case-btn" onClick={closeCase}>
                <FolderClosed size={15} /> Close case
              </button>
            )}
          </div>
        </div>
      )}

      {toast && <div className="wcd-toast">{toast}</div>}
    </div>
  );
}
