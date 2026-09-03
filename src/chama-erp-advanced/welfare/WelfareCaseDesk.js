import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { useChama } from "../ChamaContext";
import {
  PlusCircle, Eye, EyeOff, X, Loader2, CheckCircle, XCircle, Lock, Users, FolderClosed,
  AlertCircle, HandCoins, Clock3, ShieldAlert,
} from "lucide-react";
import {
  formatKES, CONTRIBUTION_SOURCES, PAYMENT_METHODS, contributorDisplayName,
  outstandingAmount, pledgeStatusLabel, logAudit,
} from "./welfareFormat";
import "./WelfareCaseDesk.css";

// -----------------------------------------------------------------------------
// WelfareCaseDesk
// Welfare-officer-only (chairperson/treasurer/secretary get full read access
// via isOfficialViewer, but only the welfare officer or admin can open/edit/
// close a case — matches "official have full rights to see the welfare").
//
// Uses the canonical welfare_case_participants table: one row per
// (case, member) carrying BOTH visibility (can_see) and the individually
// expected contribution amount for that member.
//
// UPGRADE (this pass):
//  - Contributions can now actually be recorded here (previously this file
//    only approved/rejected rows that nothing ever created).
//  - Contributions support four sources: member / external individual /
//    organization / anonymous (see welfareFormat.CONTRIBUTION_SOURCES).
//  - Pledges: a contribution can be logged as pledged now, received later,
//    tracked as partial, with an outstanding balance.
//  - Visibility is now several independent toggles (names, ranking,
//    external, anonymous) instead of one amount flag. NOTE: these flags
//    only control what THIS admin-only screen would pass down to a
//    member-facing view — see migrations.sql for the server-side
//    enforcement (view + RLS) needed so hiding isn't UI-only.
//  - Closing a case now warns about unresolved pledges/pending
//    contributions instead of just a generic confirm.
//  - Key actions write to the shared audit log (best-effort).
// -----------------------------------------------------------------------------

const EVENT_TYPES = [
  { value: "funeral", label: "Funeral" },
  { value: "sickness", label: "Sickness" },
  { value: "wedding", label: "Wedding" },
  { value: "achievement", label: "Achievement" },
  { value: "other", label: "Other" },
];

const emptyCaseForm = {
  title: "", event_type: "other", beneficiary_member_id: "", description: "", expected_amount: "",
  amount_visible_to_members: true, is_visible_to_beneficiary: true,
  show_contributor_names: true, show_contributor_ranking: false,
  show_anonymous_contributors: true, show_external_contributors: true,
  allow_anonymous_contributions: true, allow_external_contributions: true,
};

const emptyContribForm = {
  source_type: "member", member_id: "", contributor_name: "", contributor_contact: "",
  amount: "", payment_method: "cash", reference: "", is_pledge: false, expected_payment_date: "",
};

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

  const [contribFormOpen, setContribFormOpen] = useState(false);
  const [contribForm, setContribForm] = useState(emptyContribForm);
  const [contribSubmitting, setContribSubmitting] = useState(false);
  const [contribError, setContribError] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);
    const [casesRes, membersRes] = await Promise.all([
      supabase.from("welfare_cases").select("*").eq("chama_id", chamaId).order("opened_at", { ascending: false }),
      supabase.from("chama_members").select("id,name").eq("chama_id", chamaId).eq("status", "active"),
    ]);
    if (casesRes.error || membersRes.error) {
      setError((casesRes.error || membersRes.error).message);
    }
    setCases(casesRes.data || []);
    setMembers(membersRes.data || []);
    setLoading(false);
  }, [chamaId]);

  useEffect(() => { load(); }, [load]);

  const memberName = useCallback((id) => members.find((m) => m.id === id)?.name || "Unknown member", [members]);

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
    if (!member?.id) return setError("Your member profile hasn't loaded yet — please wait a moment and try again.");

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
      show_contributor_names: form.show_contributor_names,
      show_contributor_ranking: form.show_contributor_ranking,
      show_anonymous_contributors: form.show_anonymous_contributors,
      show_external_contributors: form.show_external_contributors,
      allow_anonymous_contributions: form.allow_anonymous_contributions,
      allow_external_contributions: form.allow_external_contributions,
      campaign_status: "open",
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

    if (partErr) {
      // Roll back the case so we don't leave an orphaned case with nobody
      // able to see it — better to fail cleanly than half-create it.
      await supabase.from("welfare_cases").delete().eq("id", created.id);
      setSubmitting(false);
      return setError(`Couldn't save participants, case was not created: ${partErr.message}`);
    }

    await logAudit({
      chamaId, actorMemberId: member.id, module: "welfare_case", action: "case_opened",
      entityId: created.id, newValue: { title: created.title, expected_amount: created.expected_amount },
    });

    setSubmitting(false);
    showToast("Case opened.");
    setForm(emptyCaseForm);
    setParticipants([]);
    setFormOpen(false);
    load();
  };

  const openCaseDetail = async (c) => {
    setActiveCase(c);
    setContribFormOpen(false);
    setContribForm(emptyContribForm);
    setContribError(null);
    const [contribRes, partRes] = await Promise.all([
      supabase.from("welfare_contributions").select("*").eq("case_id", c.id).order("created_at", { ascending: false }),
      supabase.from("welfare_case_participants").select("*, chama_members(name)").eq("case_id", c.id),
    ]);
    setCaseContribs(contribRes.data || []);
    setCaseParticipants(partRes.data || []);
  };

  const refreshActiveCase = async () => {
    const [contribRes, casesRes] = await Promise.all([
      supabase.from("welfare_contributions").select("*").eq("case_id", activeCase.id).order("created_at", { ascending: false }),
      supabase.from("welfare_cases").select("*").eq("chama_id", chamaId).order("opened_at", { ascending: false }),
    ]);
    setCaseContribs(contribRes.data || []);
    setCases(casesRes.data || []);
    setActiveCase((prev) => casesRes.data?.find((c) => c.id === prev.id) || prev);
  };

  // ---------------------------------------------------------------------------
  // Contribution recording — the path that was previously missing entirely.
  // Handles all four sources and the pledge/received distinction.
  // ---------------------------------------------------------------------------
  const recordContribution = async (e) => {
    e.preventDefault();
    setContribError(null);

    if (contribForm.source_type === "member" && !contribForm.member_id) {
      return setContribError("Choose which member this contribution is from.");
    }
    if ((contribForm.source_type === "external" || contribForm.source_type === "organization") && !contribForm.contributor_name.trim()) {
      return setContribError(`Enter the ${contribForm.source_type === "external" ? "contributor's" : "organization's"} name.`);
    }
    if (contribForm.source_type === "anonymous" && !activeCase.allow_anonymous_contributions) {
      return setContribError("This case doesn't allow anonymous contributions.");
    }
    if (contribForm.source_type === "external" && !activeCase.allow_external_contributions) {
      return setContribError("This case doesn't allow external contributions.");
    }
    const amount = Number(contribForm.amount);
    if (!amount || amount <= 0) return setContribError("Enter a contribution amount greater than zero.");
    if (activeCase.campaign_status === "closed" || activeCase.status === "closed") {
      return setContribError("This case is closed — reopen it before adding new contributions.");
    }

    setContribSubmitting(true);
    const payload = {
      chama_id: chamaId,
      case_id: activeCase.id,
      source_type: contribForm.source_type,
      member_id: contribForm.source_type === "member" ? contribForm.member_id : null,
      contributor_name: contribForm.source_type === "member" || contribForm.source_type === "anonymous"
        ? null : contribForm.contributor_name.trim(),
      contributor_contact: contribForm.contributor_contact.trim() || null,
      amount,
      payment_method: contribForm.payment_method,
      reference: contribForm.reference.trim() || null,
      is_pledge: contribForm.is_pledge,
      pledged_amount: contribForm.is_pledge ? amount : null,
      amount_received: contribForm.is_pledge ? 0 : amount,
      expected_payment_date: contribForm.is_pledge ? (contribForm.expected_payment_date || null) : null,
      status: "Pending",
      received_by: member.id,
    };

    const { data: created, error: err } = await supabase.from("welfare_contributions").insert([payload]).select().single();
    if (err) { setContribSubmitting(false); return setContribError(err.message); }

    await logAudit({
      chamaId, actorMemberId: member.id, module: "welfare_case", action: "contribution_recorded",
      entityId: activeCase.id, newValue: { contribution_id: created.id, amount, source_type: contribForm.source_type, is_pledge: contribForm.is_pledge },
    });

    setContribSubmitting(false);
    setContribForm(emptyContribForm);
    setContribFormOpen(false);
    showToast(contribForm.is_pledge ? "Pledge recorded." : "Contribution recorded — pending approval.");
    refreshActiveCase();
  };

  /** Log a payment received against an already-pledged contribution. */
  const receivePledgePayment = async (contribution) => {
    const remaining = outstandingAmount(contribution);
    const input = window.prompt(`Amount received now (outstanding: ${formatKES(remaining)})`, remaining);
    if (input === null) return;
    const amount = Number(input);
    if (!amount || amount <= 0 || amount > remaining) {
      return showToast("Enter a valid amount up to the outstanding balance.");
    }
    const newReceived = Number(contribution.amount_received || 0) + amount;
    const { error: err } = await supabase.from("welfare_contributions")
      .update({ amount_received: newReceived })
      .eq("id", contribution.id);
    if (err) return showToast(`Couldn't record payment: ${err.message}`);
    await logAudit({
      chamaId, actorMemberId: member.id, module: "welfare_case", action: "pledge_payment_received",
      entityId: contribution.id, previousValue: { amount_received: contribution.amount_received }, newValue: { amount_received: newReceived },
    });
    showToast("Pledge payment recorded.");
    refreshActiveCase();
  };

  const approveContribution = async (contribId) => {
    const { error: err } = await supabase.from("welfare_contributions").update({ status: "Approved", approved_by: member.id, approved_at: new Date().toISOString() }).eq("id", contribId);
    if (err) return showToast(`Couldn't approve: ${err.message}`);
    await logAudit({ chamaId, actorMemberId: member.id, module: "welfare_case", action: "contribution_approved", entityId: contribId });
    refreshActiveCase();
  };
  const rejectContribution = async (contribId) => {
    const reason = window.prompt("Reason for rejecting this contribution (shown in the audit log):") || null;
    const { error: err } = await supabase.from("welfare_contributions").update({ status: "Rejected", rejection_reason: reason }).eq("id", contribId);
    if (err) return showToast(`Couldn't reject: ${err.message}`);
    await logAudit({ chamaId, actorMemberId: member.id, module: "welfare_case", action: "contribution_rejected", entityId: contribId, reason });
    refreshActiveCase();
  };

  const outstandingPledgeTotal = useMemo(
    () => caseContribs.filter((c) => c.is_pledge).reduce((s, c) => s + outstandingAmount(c), 0),
    [caseContribs]
  );
  const pendingCount = useMemo(() => caseContribs.filter((c) => c.status === "Pending").length, [caseContribs]);

  const closeCase = async () => {
    const warnings = [];
    if (pendingCount > 0) warnings.push(`${pendingCount} contribution(s) still pending approval`);
    if (outstandingPledgeTotal > 0) warnings.push(`${formatKES(outstandingPledgeTotal)} in outstanding pledges`);
    const warningText = warnings.length ? `\n\nUnresolved: ${warnings.join(", ")}. Closing will not delete this data, but new contributions will be blocked.` : "";
    if (!window.confirm(`Close "${activeCase.title}"? Members will no longer be able to add contributions to it.${warningText}`)) return;

    const { error: err } = await supabase.from("welfare_cases").update({
      status: "closed", campaign_status: "closed", closed_by: member.id, closed_at: new Date().toISOString(),
    }).eq("id", activeCase.id);
    if (err) return showToast(`Couldn't close case: ${err.message}`);
    await logAudit({
      chamaId, actorMemberId: member.id, module: "welfare_case", action: "case_closed", entityId: activeCase.id,
      newValue: { pending_at_close: pendingCount, outstanding_pledges_at_close: outstandingPledgeTotal },
    });
    setActiveCase(null);
    showToast("Case closed.");
    load();
  };

  const totalRaised = useMemo(
    () => caseContribs.filter((c) => c.status === "Approved").reduce((s, c) => s + Number(c.is_pledge ? c.amount_received : c.amount), 0),
    [caseContribs]
  );

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

      {error && !formOpen && <div className="wcd-error"><AlertCircle size={14} /> {error}</div>}

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
          </div>

          <div className="wcd-visibility">
            <h4><ShieldAlert size={14} /> Contribution visibility &amp; sources</h4>
            <div className="wcd-visibility-grid">
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.amount_visible_to_members} onChange={(e) => setForm((f) => ({ ...f, amount_visible_to_members: e.target.checked }))} />
                Show contribution amounts to members with access
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.show_contributor_names} onChange={(e) => setForm((f) => ({ ...f, show_contributor_names: e.target.checked }))} />
                Show contributor names
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.show_contributor_ranking} onChange={(e) => setForm((f) => ({ ...f, show_contributor_ranking: e.target.checked }))} />
                Show a contributor leaderboard/ranking
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.is_visible_to_beneficiary} onChange={(e) => setForm((f) => ({ ...f, is_visible_to_beneficiary: e.target.checked }))} />
                Visible to the beneficiary
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.allow_anonymous_contributions} onChange={(e) => setForm((f) => ({ ...f, allow_anonymous_contributions: e.target.checked }))} />
                Allow anonymous contributions
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.show_anonymous_contributors} onChange={(e) => setForm((f) => ({ ...f, show_anonymous_contributors: e.target.checked }))} />
                Show anonymous entries in lists (as "Anonymous")
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.allow_external_contributions} onChange={(e) => setForm((f) => ({ ...f, allow_external_contributions: e.target.checked }))} />
                Allow external / organization contributions
              </label>
              <label className="wcd-checkbox">
                <input type="checkbox" checked={form.show_external_contributors} onChange={(e) => setForm((f) => ({ ...f, show_external_contributors: e.target.checked }))} />
                Show external/organization contributor identity
              </label>
            </div>
            <p className="wcd-visibility-note">
              These settings drive what a member-facing view is allowed to show. This admin desk always shows
              everything to officials — enforcement for members happens server-side (see migrations.sql).
            </p>
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
                <span className={`wcd-status ${c.status}`}>{c.campaign_status || c.status}</span>
              </div>
              <p className="wcd-type">{c.event_type} {c.beneficiary_name ? `· ${c.beneficiary_name}` : ""}</p>
              {/* This desk is officials-only (see the canView gate above), so the
                  target amount is always shown here — amount_visible_to_members
                  only controls what regular members see elsewhere. */}
              <p className="wcd-target">Target: {formatKES(c.expected_amount)}</p>
              {!c.amount_visible_to_members && (
                <p className="wcd-target hidden"><EyeOff size={12} /> Hidden from members</p>
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

            {outstandingPledgeTotal > 0 && (
              <div className="wcd-pledge-banner">
                <Clock3 size={14} /> {formatKES(outstandingPledgeTotal)} outstanding across unfulfilled pledges
              </div>
            )}

            <div className="wcd-contrib-head">
              <h4>Contributions</h4>
              {canManage && activeCase.status !== "closed" && (
                <button type="button" className="wcd-add-contrib-btn" onClick={() => setContribFormOpen((v) => !v)}>
                  <HandCoins size={14} /> Record contribution
                </button>
              )}
            </div>

            {contribFormOpen && (
              <form className="wcd-contrib-form" onSubmit={recordContribution}>
                {contribError && <div className="wcd-error"><AlertCircle size={14} /> {contribError}</div>}
                <div className="wcd-contrib-form-grid">
                  <label>
                    Source
                    <select value={contribForm.source_type} onChange={(e) => setContribForm((f) => ({ ...f, source_type: e.target.value }))}>
                      {CONTRIBUTION_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  {contribForm.source_type === "member" ? (
                    <label>
                      Member
                      <select value={contribForm.member_id} onChange={(e) => setContribForm((f) => ({ ...f, member_id: e.target.value }))}>
                        <option value="">Choose member</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                  ) : contribForm.source_type !== "anonymous" ? (
                    <label>
                      {contribForm.source_type === "organization" ? "Organization name" : "Contributor name"}
                      <input value={contribForm.contributor_name} onChange={(e) => setContribForm((f) => ({ ...f, contributor_name: e.target.value }))} />
                    </label>
                  ) : (
                    <div className="wcd-anon-note">No identity is recorded for anonymous contributions.</div>
                  )}
                  {contribForm.source_type !== "anonymous" && contribForm.source_type !== "member" && (
                    <label>
                      Contact (optional)
                      <input value={contribForm.contributor_contact} onChange={(e) => setContribForm((f) => ({ ...f, contributor_contact: e.target.value }))} />
                    </label>
                  )}
                  <label>
                    Amount (KES)
                    <input type="number" min="1" value={contribForm.amount} onChange={(e) => setContribForm((f) => ({ ...f, amount: e.target.value }))} required />
                  </label>
                  <label>
                    Payment method
                    <select value={contribForm.payment_method} onChange={(e) => setContribForm((f) => ({ ...f, payment_method: e.target.value }))}>
                      {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Reference (optional)
                    <input value={contribForm.reference} onChange={(e) => setContribForm((f) => ({ ...f, reference: e.target.value }))} placeholder="M-Pesa code, cheque no., etc." />
                  </label>
                  <label className="wcd-checkbox">
                    <input type="checkbox" checked={contribForm.is_pledge} onChange={(e) => setContribForm((f) => ({ ...f, is_pledge: e.target.checked }))} />
                    This is a pledge, not money received yet
                  </label>
                  {contribForm.is_pledge && (
                    <label>
                      Expected payment date
                      <input type="date" value={contribForm.expected_payment_date} onChange={(e) => setContribForm((f) => ({ ...f, expected_payment_date: e.target.value }))} />
                    </label>
                  )}
                </div>
                <div className="wcd-form-actions">
                  <button type="button" className="wcd-cancel" onClick={() => setContribFormOpen(false)}>Cancel</button>
                  <button type="submit" className="wcd-submit" disabled={contribSubmitting}>
                    {contribSubmitting ? <Loader2 size={15} className="spin" /> : "Save"}
                  </button>
                </div>
              </form>
            )}

            {caseContribs.length === 0 ? (
              <p className="wcd-empty-inline">No contributions recorded yet.</p>
            ) : (
              <div className="wcd-contrib-list">
                {caseContribs.map((cc) => {
                  const pledgeLabel = pledgeStatusLabel(cc);
                  return (
                    <div className="wcd-contrib-row" key={cc.id}>
                      <div className="wcd-contrib-info">
                        <span className="wcd-contrib-name">{contributorDisplayName(cc, memberName)}</span>
                        <span className="wcd-contrib-amount">
                          {cc.amount_visible === false ? "Amount hidden" : formatKES(cc.amount)}
                          {pledgeLabel && <em className="wcd-pledge-tag">{pledgeLabel}</em>}
                        </span>
                      </div>
                      <span className={`wcd-contrib-status ${cc.status.toLowerCase()}`}>{cc.status}</span>
                      {canManage && cc.is_pledge && outstandingAmount(cc) > 0 && (
                        <button className="wcd-receive-btn" onClick={() => receivePledgePayment(cc)} title="Record a payment against this pledge">
                          <HandCoins size={13} />
                        </button>
                      )}
                      {canManage && cc.status === "Pending" && (
                        <div className="wcd-contrib-actions">
                          <button onClick={() => approveContribution(cc.id)}><CheckCircle size={13} /></button>
                          <button onClick={() => rejectContribution(cc.id)}><XCircle size={13} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
