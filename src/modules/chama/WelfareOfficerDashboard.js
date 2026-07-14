// modules/chama/welfare/WelfareOfficerDashboard.js
// Props: { chamaId, member, role, refreshSignal, onCaseCreated }
//
// Features in this final version:
//   ✅ Open new welfare case (modal with event type picker + beneficiary search)
//   ✅ Newly created cases appear immediately in Overview — no ChamaContext
//      dependency anymore; chamaId/member come straight from ChamaWelfare, and
//      creating a case bumps both a local signal (this dashboard's own
//      Overview reloads instantly) and onCaseCreated (so the sibling
//      WelfareOverview tab picks it up too)
//   ✅ Close welfare event — officer can mark case Disbursed or Closed with notes
//      (closed cases are correctly dropped from the current filtered view)
//   ✅ Per-case, per-member visibility — officer picks exactly who sees each case
//   ✅ Per-contribution visibility — TWO independent switches per row:
//        • is_visible     — does the row appear at all?
//        • amount_visible — if it appears, is the KES figure shown, or just "Contributed"?
//      Lets the officer prove someone DID contribute without exposing the amount.
//   ✅ Module-level permissions (leaderboard, amounts, analytics, case list)
//   ✅ Visibility settings are ENFORCED for regular members in Overview
//   ✅ Chair / Treasurer / Secretary always have full, unrestricted, read-only visibility
//      — officer visibility settings never apply to Exec roles, and Exec members
//        are excluded from the visibility-toggle lists entirely (nothing to restrict)
//   ✅ Approval queue with approve / reject / row visibility / amount visibility
//   ✅ Beneficiary handover toggle
//   ✅ Exec read-only audit view
//   ✅ Fully responsive — phone (320px) → tablet → laptop → desktop
//
// MIGRATION REQUIRED for the amount-masking feature:
//   alter table welfare_contributions add column amount_visible boolean default true;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase }      from '../../supabaseClient';
import WelfareReportPDF  from './WelfareReportPDF';
import WelfareAnalytics  from './WelfareAnalytics';
import './Welfareofficerdashboard.css';

// ─── ROLE HELPERS ─────────────────────────────────────────────────────────────
const EXEC_ROLES  = ['chair', 'treasurer', 'secretary'];
const isOfficerFn = r => r === 'welfare_officer';
const isExecFn    = r => EXEC_ROLES.includes(r?.toLowerCase());
const canManageFn = r => isOfficerFn(r) || isExecFn(r);

// Officer manages the visibility rules; Exec (Chair/Treasurer/Secretary) audits everything.
// Neither role is ever subject to per-case or per-module visibility restrictions —
// those only ever apply to regular members. Use this helper anywhere data is
// filtered so the two stay in sync.
const hasFullAccessFn = r => canManageFn(r);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const EVENT_META = {
  Funeral:     { emoji: '🕊️', colour: '#818cf8', label: 'Funeral Support'  },
  Wedding:     { emoji: '💍', colour: '#4ade80', label: 'Wedding / Dowry'   },
  Sickness:    { emoji: '🏥', colour: '#60a5fa', label: 'Medical Support'   },
  Achievement: { emoji: '🏆', colour: '#fbbf24', label: 'Achievement'       },
  Other:       { emoji: '🤝', colour: '#a78bfa', label: 'Community Support' },
};
const STATUS_COLOUR = {
  Active:    '#4ade80',
  Disbursed: '#60a5fa',
  Closed:    '#6b7280',
};
const EVENT_TYPES = Object.keys(EVENT_META);

// ─────────────────────────────────────────────────────────────────────────────
// MICRO-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label, colour }) {
  return (
    <span className="wd-badge"
      style={{ background: colour + '22', color: colour, border: `1px solid ${colour}44` }}>
      {label}
    </span>
  );
}

function ProgressBar({ collected = 0, target = 0, colour = '#7c3aed' }) {
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  const c   = pct >= 100 ? '#4ade80' : pct >= 60 ? '#60a5fa' : colour;
  return (
    <div className="wd-progress-wrap">
      <div className="wd-progress-track">
        <div className="wd-progress-fill" style={{ width: `${pct}%`, background: c }} />
      </div>
      <div className="wd-progress-stats">
        <span>KES {collected.toLocaleString()} raised</span>
        <span>{pct}% of KES {target.toLocaleString()}</span>
      </div>
    </div>
  );
}

function Spinner({ text = 'Loading…' }) {
  return <p className="wd-spinner">{text}</p>;
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="wd-empty">
      <span className="wd-empty-icon">{icon}</span>
      <p className="wd-empty-title">{title}</p>
      {sub && <p className="wd-empty-sub">{sub}</p>}
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="wd-field-error" role="alert">⚠ {msg}</p>;
}

function ToggleSwitch({ on, onToggle, disabled, title: t }) {
  return (
    <button type="button"
      className={`wd-toggle ${on ? 'on' : 'off'}`}
      onClick={onToggle} disabled={disabled}
      aria-pressed={on} title={t}>
      <span className="wd-toggle-knob" />
    </button>
  );
}

// Escape-to-close hook
function useEscapeKey(fn) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') fn(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SHELL  (shared by all modals)
// ─────────────────────────────────────────────────────────────────────────────

function ModalShell({ title, sub, onClose, children, wide = false }) {
  useEscapeKey(onClose);
  return (
    <div className="wd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`wd-modal ${wide ? 'wd-modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="wd-modal-hdr">
          <div className="wd-modal-hdr-text">
            <h3 className="wd-modal-title">{title}</h3>
            {sub && <p className="wd-modal-sub">{sub}</p>}
          </div>
          <button className="wd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW EVENT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function NewEventModal({ chamaId, officerId, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', event_type: 'Funeral', description: '',
    target_amount: '', beneficiary_search: '',
  });
  const [members,     setMembers]     = useState([]);
  const [beneficiary, setBeneficiary] = useState(null);
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);
  const [serverErr,   setServerErr]   = useState('');
  const firstRef = useRef(null);

  useEffect(() => {
    if (!chamaId) return;
    supabase.from('members').select('id,full_name,phone,role')
      .eq('chama_id', chamaId).order('full_name')
      .then(({ data }) => setMembers(data ?? []));
    setTimeout(() => firstRef.current?.focus(), 80);
  }, [chamaId]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: '' }));
  };

  const filteredMembers = members.filter(m =>
    m.full_name?.toLowerCase().includes(form.beneficiary_search.toLowerCase()) ||
    m.phone?.includes(form.beneficiary_search)
  );

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Case title is required.';
    const amt = parseFloat(form.target_amount);
    if (!form.target_amount || isNaN(amt) || amt <= 0)
      e.target_amount = 'Enter a valid amount greater than 0.';
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true); setServerErr('');
    try {
      const { data, error } = await supabase.from('welfare_cases').insert({
        chama_id: chamaId, title: form.title.trim(),
        event_type: form.event_type,
        description: form.description.trim() || null,
        target_amount: parseFloat(form.target_amount),
        status: 'Active', opened_by: officerId,
        beneficiary_id: beneficiary?.id ?? null,
        is_visible_to_beneficiary: false,
      }).select().single();
      if (error) throw error;
      onCreated(data);
    } catch (err) {
      setServerErr(err.message ?? 'Failed to create case. Please try again.');
    } finally { setSaving(false); }
  };

  const meta = EVENT_META[form.event_type] ?? EVENT_META.Other;

  return (
    <ModalShell title="➕ Open New Welfare Case" sub="Members can contribute immediately after creation" onClose={onClose}>
      {/* Event type picker */}
      <div className="wd-fg">
        <label className="wd-label">Event Type <span className="wd-req">*</span></label>
        <div className="wd-event-grid">
          {EVENT_TYPES.map(et => {
            const m = EVENT_META[et];
            const sel = form.event_type === et;
            return (
              <button key={et} type="button"
                className={`wd-event-card ${sel ? 'sel' : ''}`}
                style={sel ? { borderColor: m.colour, background: m.colour + '18' } : {}}
                onClick={() => set('event_type', et)}>
                <span className="wd-event-emoji">{m.emoji}</span>
                <span className="wd-event-lbl" style={sel ? { color: m.colour } : {}}>{et}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="wd-fg">
        <label className="wd-label" htmlFor="nem-title">
          Case Title <span className="wd-req">*</span>
        </label>
        <input ref={firstRef} id="nem-title" type="text"
          className={`wd-input ${errors.title ? 'err' : ''}`}
          placeholder={`e.g. Support for ${meta.label}`}
          value={form.title} onChange={e => set('title', e.target.value)} />
        <FieldError msg={errors.title} />
      </div>

      <div className="wd-fg">
        <label className="wd-label" htmlFor="nem-desc">
          Description <span className="wd-opt">(optional)</span>
        </label>
        <textarea id="nem-desc" rows={3} className="wd-input wd-ta"
          placeholder="Provide context for members…"
          value={form.description} onChange={e => set('description', e.target.value)} />
      </div>

      <div className="wd-fg">
        <label className="wd-label" htmlFor="nem-amt">
          Target Amount (KES) <span className="wd-req">*</span>
        </label>
        <div className="wd-pfx-wrap">
          <span className="wd-pfx">KES</span>
          <input id="nem-amt" type="number" inputMode="decimal" min="1"
            className={`wd-input wd-pfx-input ${errors.target_amount ? 'err' : ''}`}
            placeholder="e.g. 50000"
            value={form.target_amount} onChange={e => set('target_amount', e.target.value)} />
        </div>
        <FieldError msg={errors.target_amount} />
      </div>

      <div className="wd-fg">
        <label className="wd-label">Beneficiary <span className="wd-opt">(optional)</span></label>
        {beneficiary ? (
          <div className="wd-bene-sel">
            <span className="wd-bene-name">{beneficiary.full_name}
              <span className="wd-bene-phone">{beneficiary.phone}</span>
            </span>
            <button className="wd-bene-clear" type="button" onClick={() => setBeneficiary(null)}>✕ Clear</button>
          </div>
        ) : (
          <>
            <input type="text" className="wd-input"
              placeholder="Search by name or phone…"
              value={form.beneficiary_search}
              onChange={e => set('beneficiary_search', e.target.value)} />
            {form.beneficiary_search.length >= 2 && (
              <div className="wd-mem-drop">
                {filteredMembers.length === 0
                  ? <p className="wd-mem-drop-empty">No members found</p>
                  : filteredMembers.slice(0, 6).map(m => (
                    <button key={m.id} type="button" className="wd-mem-drop-item"
                      onClick={() => { setBeneficiary(m); set('beneficiary_search', ''); }}>
                      <span className="wd-mem-name">{m.full_name}</span>
                      <span className="wd-mem-phone">{m.phone}</span>
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {serverErr && <div className="wd-server-err" role="alert">{serverErr}</div>}

      <div className="wd-modal-actions">
        <button className="wd-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="wd-btn-primary" onClick={handleSubmit} disabled={saving}
          style={{ background: `linear-gradient(135deg,${meta.colour}cc,${meta.colour})` }}>
          {saving ? '⏳ Creating…' : `${meta.emoji} Open Case`}
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOSE EVENT MODAL
// Officer closes or marks a welfare case as Disbursed/Closed
// ─────────────────────────────────────────────────────────────────────────────

function CloseEventModal({ caseData, officerId, onClose, onClosed }) {
  const [newStatus,   setNewStatus]   = useState('Disbursed');
  const [closingNote, setClosingNote] = useState('');
  const [confirm,     setConfirm]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [serverErr,   setServerErr]   = useState('');

  const meta = EVENT_META[caseData.event_type] ?? EVENT_META.Other;
  const pct  = caseData.target_amount > 0
    ? Math.min(100, Math.round((caseData.total_collected / caseData.target_amount) * 100))
    : 0;

  const handleClose = async () => {
    if (!confirm) { setConfirm(true); return; }
    setSaving(true); setServerErr('');
    try {
      const update = {
        status:      newStatus,
        closed_at:   newStatus === 'Closed'    ? new Date().toISOString() : null,
        disbursed_at: newStatus === 'Disbursed' ? new Date().toISOString() : null,
        closing_note: closingNote.trim() || null,
        closed_by:   officerId,
      };
      const { error } = await supabase.from('welfare_cases').update(update).eq('id', caseData.id);
      if (error) throw error;
      onClosed({ ...caseData, ...update });
    } catch (err) {
      setServerErr(err.message ?? 'Failed to close case.');
      setConfirm(false);
    } finally { setSaving(false); }
  };

  return (
    <ModalShell
      title={`🔒 Close Welfare Case`}
      sub="This stops new contributions. Existing records are preserved."
      onClose={onClose}>

      {/* Case summary */}
      <div className="wd-close-case-info" style={{ borderLeftColor: meta.colour }}>
        <p className="wd-close-case-emoji">{meta.emoji}</p>
        <div>
          <p className="wd-close-case-title">{caseData.title}</p>
          <p className="wd-close-case-meta">{caseData.event_type}</p>
        </div>
      </div>

      {/* Progress summary */}
      <div className="wd-close-progress">
        <ProgressBar collected={caseData.total_collected ?? 0} target={caseData.target_amount ?? 0} colour={meta.colour} />
        <div className="wd-close-stats">
          <span>Target: <strong>KES {(caseData.target_amount ?? 0).toLocaleString()}</strong></span>
          <span>Raised: <strong style={{ color: '#4ade80' }}>KES {(caseData.total_collected ?? 0).toLocaleString()}</strong></span>
          <span>Achievement: <strong style={{ color: meta.colour }}>{pct}%</strong></span>
        </div>
      </div>

      {/* New status choice */}
      <div className="wd-fg">
        <label className="wd-label">Close As</label>
        <div className="wd-close-status-row">
          {[
            { val: 'Disbursed', icon: '✅', desc: 'Funds were collected and disbursed to beneficiary' },
            { val: 'Closed',    icon: '🔒', desc: 'Case ended without full disbursement' },
          ].map(s => (
            <button key={s.val} type="button"
              className={`wd-close-status-card ${newStatus === s.val ? 'sel' : ''}`}
              style={newStatus === s.val ? { borderColor: STATUS_COLOUR[s.val], background: STATUS_COLOUR[s.val] + '18' } : {}}
              onClick={() => { setNewStatus(s.val); setConfirm(false); }}>
              <span className="wd-close-status-icon">{s.icon}</span>
              <span className="wd-close-status-label"
                style={newStatus === s.val ? { color: STATUS_COLOUR[s.val] } : {}}>{s.val}</span>
              <span className="wd-close-status-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Closing note */}
      <div className="wd-fg">
        <label className="wd-label" htmlFor="close-note">
          Closing Note <span className="wd-opt">(optional)</span>
        </label>
        <textarea id="close-note" rows={3} className="wd-input wd-ta"
          placeholder="e.g. Full amount disbursed to family on 14 June via M-PESA…"
          value={closingNote} onChange={e => setClosingNote(e.target.value)} />
      </div>

      {/* Confirmation warning */}
      {confirm && (
        <div className="wd-close-confirm-warn">
          ⚠ <strong>Are you sure?</strong> Marking this case as <em>{newStatus}</em> will stop all new contributions.
          This can be undone by re-opening the case if needed.
        </div>
      )}

      {serverErr && <div className="wd-server-err" role="alert">{serverErr}</div>}

      <div className="wd-modal-actions">
        <button className="wd-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        <button
          className={`wd-btn-close-case ${confirm ? 'confirm' : ''}`}
          onClick={handleClose} disabled={saving}>
          {saving ? '⏳ Closing…' : confirm ? '⚠ Confirm Close' : `🔒 Close as ${newStatus}`}
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE VISIBILITY MODAL
// Per-case: which members can see it, and — separately — whether each
// contribution row (and its amount) is visible.
// Chair / Treasurer / Secretary are intentionally excluded from these lists —
// their visibility can never be restricted, so there is nothing to toggle.
//
// NOTE: requires a migration:
//   alter table welfare_contributions add column amount_visible boolean default true;
// ─────────────────────────────────────────────────────────────────────────────

function CaseVisibilityModal({ caseId, caseTitle, eventType, chamaId, onClose }) {
  const [members,       setMembers]       = useState([]);
  const [caseAccess,    setCaseAccess]    = useState({});
  const [contribs,      setContribs]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(null);
  const [savedMember,   setSavedMember]   = useState(null);
  const [savedContrib,  setSavedContrib]  = useState(null);
  const [search,        setSearch]        = useState('');
  const [contribSearch, setContribSearch] = useState('');
  const [section,       setSection]       = useState('members');

  const meta = EVENT_META[eventType] ?? EVENT_META.Other;

  useEffect(() => {
    if (!chamaId || !caseId) return;
    Promise.all([
      supabase.from('members').select('id,full_name,phone,role').eq('chama_id', chamaId).order('full_name'),
      supabase.from('welfare_case_visibility').select('member_id,can_see').eq('case_id', caseId),
      supabase.from('welfare_contributions')
        .select('id,amount,is_pledge,status,is_visible,amount_visible,members(full_name)')
        .eq('case_id', caseId).order('created_at'),
    ]).then(([mR, aR, cR]) => {
      // Exec roles always have full access — they never appear in the toggle list.
      const list = (mR.data ?? []).filter(m => !isExecFn(m.role));
      setMembers(list);
      const map = {};
      list.forEach(m => { map[m.id] = true; });
      (aR.data ?? []).forEach(r => { if (r.member_id in map) map[r.member_id] = r.can_see; });
      setCaseAccess(map);
      setContribs(cR.data ?? []);
      setLoading(false);
    });
  }, [chamaId, caseId]);

  const toggleMember = async (memberId, cur) => {
    setSaving(memberId);
    const nv = !cur;
    setCaseAccess(p => ({ ...p, [memberId]: nv }));
    await supabase.from('welfare_case_visibility')
      .upsert({ case_id: caseId, chama_id: chamaId, member_id: memberId, can_see: nv },
        { onConflict: 'case_id,member_id' });
    setSaving(null); setSavedMember(memberId);
    setTimeout(() => setSavedMember(s => s === memberId ? null : s), 1400);
  };

  const setAllMembers = async val => {
    const map = {}; members.forEach(m => { map[m.id] = val; }); setCaseAccess(map);
    await supabase.from('welfare_case_visibility')
      .upsert(members.map(m => ({ case_id: caseId, chama_id: chamaId, member_id: m.id, can_see: val })),
        { onConflict: 'case_id,member_id' });
  };

  // ── Contribution-level toggles ──
  // is_visible: does the row appear at all?
  // amount_visible: if the row appears, is the KES figure shown, or just "Contributed"?
  const toggleContribVisible = async (cId, cur) => {
    setSaving('c' + cId);
    const nv = !cur;
    setContribs(p => p.map(c => c.id === cId ? { ...c, is_visible: nv } : c));
    await supabase.from('welfare_contributions').update({ is_visible: nv }).eq('id', cId);
    setSaving(null); setSavedContrib(cId);
    setTimeout(() => setSavedContrib(s => s === cId ? null : s), 1400);
  };

  const toggleContribAmount = async (cId, cur) => {
    setSaving('a' + cId);
    const nv = !cur;
    setContribs(p => p.map(c => c.id === cId ? { ...c, amount_visible: nv } : c));
    await supabase.from('welfare_contributions').update({ amount_visible: nv }).eq('id', cId);
    setSaving(null); setSavedContrib(cId);
    setTimeout(() => setSavedContrib(s => s === cId ? null : s), 1400);
  };

  const setAllContribs = async (field, val) => {
    setContribs(p => p.map(c => ({ ...c, [field]: val })));
    await supabase.from('welfare_contributions')
      .upsert(contribs.map(c => ({ id: c.id, [field]: val })), { onConflict: 'id' });
  };

  const filtered = members.filter(m =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    (m.role ?? '').toLowerCase().includes(search.toLowerCase()));

  const filteredContribs = contribs.filter(c =>
    (c.members?.full_name ?? '').toLowerCase().includes(contribSearch.toLowerCase()));

  const visibleCount   = members.filter(m => caseAccess[m.id] !== false).length;
  const hiddenCount    = members.length - visibleCount;
  const visContribs    = contribs.filter(c => c.is_visible !== false).length;
  const maskedAmounts  = contribs.filter(c => c.is_visible !== false && c.amount_visible === false).length;

  return (
    <ModalShell
      title={`${meta.emoji} Visibility — ${caseTitle}`}
      sub="Control exactly who sees this case, who contributed, and how much"
      onClose={onClose}
      wide>

      {/* Summary strip */}
      <div className="wd-vis-strip">
        <div className="wd-vis-strip-item">
          <span className="wd-vis-strip-val" style={{ color: '#4ade80' }}>{visibleCount}</span>
          <span className="wd-vis-strip-lbl">Can see case</span>
        </div>
        <div className="wd-vis-strip-div" />
        <div className="wd-vis-strip-item">
          <span className="wd-vis-strip-val" style={{ color: '#ef4444' }}>{hiddenCount}</span>
          <span className="wd-vis-strip-lbl">Hidden</span>
        </div>
        <div className="wd-vis-strip-div" />
        <div className="wd-vis-strip-item">
          <span className="wd-vis-strip-val" style={{ color: '#a78bfa' }}>
            {visContribs}/{contribs.length}
          </span>
          <span className="wd-vis-strip-lbl">Contributions visible</span>
        </div>
        <div className="wd-vis-strip-div" />
        <div className="wd-vis-strip-item">
          <span className="wd-vis-strip-val" style={{ color: '#facc15' }}>{maskedAmounts}</span>
          <span className="wd-vis-strip-lbl">Amounts hidden</span>
        </div>
      </div>

      {/* Section tabs */}
      <div className="wd-vis-tabs">
        <button className={`wd-vis-tab ${section === 'members' ? 'active' : ''}`}
          onClick={() => setSection('members')}>
          👥 Member Access ({members.length})
        </button>
        <button className={`wd-vis-tab ${section === 'contributions' ? 'active' : ''}`}
          onClick={() => setSection('contributions')}>
          💳 Contribution Rows ({contribs.length})
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ── MEMBER ACCESS ── */}
          {section === 'members' && (
            <div>
              <p className="wd-vis-hint">
                👑 Chair, Treasurer &amp; Secretary aren't listed here — they always have full,
                unrestricted visibility into every case and can't be hidden from.
              </p>

              <div className="wd-vis-bulk-row">
                <input type="text" className="wd-input wd-vis-search"
                  placeholder="🔍 Filter members…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                <div className="wd-vis-bulk-btns">
                  <button className="wd-qbtn grant" onClick={() => setAllMembers(true)}>✅ Show all</button>
                  <button className="wd-qbtn revoke" onClick={() => setAllMembers(false)}>🚫 Hide all</button>
                </div>
              </div>

              <p className="wd-vis-hint">
                Hidden members cannot see this case, contribute to it, or appear in its reports.
              </p>

              {filtered.length === 0 ? (
                <EmptyState icon="👥" title="No members found." />
              ) : (
                <div className="wd-vis-mem-list">
                  {filtered.map(m => {
                    const canSee    = caseAccess[m.id] !== false;
                    const busy      = saving === m.id;
                    const justSaved = savedMember === m.id;
                    return (
                      <div key={m.id} className={`wd-vis-mem-row ${!canSee ? 'hidden' : ''} ${justSaved ? 'flash' : ''}`}>
                        <div className="wd-avatar" style={{ opacity: canSee ? 1 : 0.45 }}>
                          {m.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="wd-vis-mem-info">
                          <p className="wd-vis-mem-name" style={canSee ? {} : { textDecoration: 'line-through', opacity: 0.5 }}>
                            {m.full_name}
                          </p>
                          <p className="wd-vis-mem-role">{m.role ?? 'Member'}</p>
                        </div>
                        <span className={`wd-vis-status ${canSee ? 'vis' : 'hid'}`}>
                          {canSee ? '👁 Visible' : '🙈 Hidden'}
                        </span>
                        {justSaved && <span className="wd-saved-flash">✓</span>}
                        <ToggleSwitch
                          on={canSee} disabled={busy}
                          onToggle={() => toggleMember(m.id, canSee)}
                          title={canSee ? `Hide from ${m.full_name}` : `Show to ${m.full_name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── CONTRIBUTION ROWS ── */}
          {section === 'contributions' && (
            <div>
              <p className="wd-vis-hint">
                Each contribution has two independent switches: whether the row appears at all,
                and — separately — whether the KES amount is shown. Hiding just the amount still
                lets members see that someone contributed, without exposing how much. Hidden rows
                are also excluded from the public leaderboard and PDF reports. The welfare officer,
                Chair, Treasurer &amp; Secretary always see every row and every amount, regardless
                of these settings.
              </p>

              <div className="wd-vis-bulk-row">
                <input type="text" className="wd-input wd-vis-search"
                  placeholder="🔍 Filter by contributor…"
                  value={contribSearch} onChange={e => setContribSearch(e.target.value)} />
                <div className="wd-vis-bulk-btns">
                  <button className="wd-qbtn grant" onClick={() => setAllContribs('is_visible', true)}>✅ Show all rows</button>
                  <button className="wd-qbtn revoke" onClick={() => setAllContribs('is_visible', false)}>🚫 Hide all rows</button>
                  <button className="wd-qbtn mask" onClick={() => setAllContribs('amount_visible', false)}>🙈 Hide all amounts</button>
                  <button className="wd-qbtn grant" onClick={() => setAllContribs('amount_visible', true)}>💰 Show all amounts</button>
                </div>
              </div>

              {filteredContribs.length === 0 ? (
                <EmptyState icon="💳" title="No contributions found." />
              ) : (
                <div className="wd-vis-mem-list">
                  {filteredContribs.map(c => {
                    const isVisible   = c.is_visible !== false;
                    const amtVisible  = c.amount_visible !== false;
                    const busyRow     = saving === 'c' + c.id;
                    const busyAmt     = saving === 'a' + c.id;
                    const justSaved   = savedContrib === c.id;
                    return (
                      <div key={c.id} className={`wd-vis-mem-row ${!isVisible ? 'hidden' : ''} ${justSaved ? 'flash' : ''}`}>
                        <div className="wd-avatar" style={{ opacity: isVisible ? 1 : 0.45 }}>
                          {c.members?.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="wd-vis-mem-info">
                          <p className="wd-vis-mem-name" style={isVisible ? {} : { textDecoration: 'line-through', opacity: 0.5 }}>
                            {c.members?.full_name ?? 'Unknown'}
                          </p>
                          <p className="wd-vis-mem-role">
                            {isVisible
                              ? (amtVisible
                                  ? `KES ${Number(c.amount).toLocaleString()}${c.is_pledge ? ' (pledge)' : ''}`
                                  : `Contributed${c.is_pledge ? ' (pledge)' : ''} — amount hidden`)
                              : 'Not shown to members'}
                          </p>
                        </div>
                        {justSaved && <span className="wd-saved-flash">✓</span>}
                        <div className="wd-vis-contrib-toggles">
                          <ToggleSwitch
                            on={isVisible} disabled={busyRow}
                            onToggle={() => toggleContribVisible(c.id, isVisible)}
                            title={isVisible ? 'Hide this row from members' : 'Show this row to members'}
                          />
                          <ToggleSwitch
                            on={amtVisible} disabled={busyAmt || !isVisible}
                            onToggle={() => toggleContribAmount(c.id, amtVisible)}
                            title={amtVisible ? 'Hide the amount, keep the row' : 'Show the amount'}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="wd-modal-actions">
        <button className="wd-btn-primary" onClick={onClose}
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>✓ Done</button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE ACCESS PANEL  (leaderboard / amounts / analytics / case list toggles)
// Chair / Treasurer / Secretary are excluded — their access can never be revoked.
// ─────────────────────────────────────────────────────────────────────────────

function ModuleAccessPanel({ chamaId }) {
  const [members, setMembers] = useState([]);
  const [access,  setAccess]  = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(null);
  const [saved,   setSaved]   = useState(null);
  const [search,  setSearch]  = useState('');

  const PERMS = [
    { key: 'see_leaderboard', icon: '🏅', label: 'Rankings'  },
    { key: 'see_amounts',     icon: '💰', label: 'Amounts'   },
    { key: 'see_analytics',   icon: '📊', label: 'Analytics' },
    { key: 'see_cases',       icon: '📋', label: 'Cases'     },
  ];

  useEffect(() => {
    if (!chamaId) return;
    Promise.all([
      supabase.from('members').select('id,full_name,phone,role').eq('chama_id', chamaId).order('full_name'),
      supabase.from('welfare_member_access').select('*').eq('chama_id', chamaId),
    ]).then(([mR, aR]) => {
      // Exec roles always have full access — nothing to toggle, so keep them out of the list.
      const list = (mR.data ?? []).filter(m => !isExecFn(m.role));
      setMembers(list);
      const map = {};
      list.forEach(m => { map[m.id] = { see_leaderboard: true, see_amounts: true, see_analytics: true, see_cases: true }; });
      (aR.data ?? []).forEach(r => {
        if (map[r.member_id]) map[r.member_id] = {
          see_leaderboard: r.see_leaderboard ?? true,
          see_amounts:     r.see_amounts     ?? true,
          see_analytics:   r.see_analytics   ?? true,
          see_cases:       r.see_cases       ?? true,
        };
      });
      setAccess(map); setLoading(false);
    });
  }, [chamaId]);

  const toggle = async (memberId, perm) => {
    const nv = !(access[memberId]?.[perm] ?? true);
    setAccess(p => ({ ...p, [memberId]: { ...p[memberId], [perm]: nv } }));
    setSaving(memberId);
    await supabase.from('welfare_member_access')
      .upsert({ member_id: memberId, chama_id: chamaId, [perm]: nv }, { onConflict: 'member_id,chama_id' });
    setSaving(null); setSaved(memberId);
    setTimeout(() => setSaved(s => s === memberId ? null : s), 1200);
  };

  const setAll = async (memberId, val) => {
    const all = { see_leaderboard: val, see_amounts: val, see_analytics: val, see_cases: val };
    setAccess(p => ({ ...p, [memberId]: all }));
    setSaving(memberId);
    await supabase.from('welfare_member_access')
      .upsert({ member_id: memberId, chama_id: chamaId, ...all }, { onConflict: 'member_id,chama_id' });
    setSaving(null); setSaved(memberId);
    setTimeout(() => setSaved(s => s === memberId ? null : s), 1200);
  };

  const filtered = members.filter(m =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    (m.role ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Bulk-apply grant/revoke-all to every member currently matching the search filter —
  // handy for "restrict everyone except X" style setup in one motion.
  const bulkSetFiltered = async val => {
    await Promise.all(filtered.map(m => setAll(m.id, val)));
  };

  if (loading) return <Spinner />;

  return (
    <div className="wd-access-panel">
      <div className="wd-access-intro">
        <div>
          <p className="wd-access-intro-ttl">Module-Level Permissions</p>
          <p className="wd-access-intro-txt">
            Control global welfare visibility per member.
            For per-case control, use the 👁 Access button on each case card.
          </p>
          <p className="wd-vis-hint">
            👑 Chair, Treasurer &amp; Secretary aren't listed here — their access can never be restricted.
          </p>
        </div>
        <input type="text" className="wd-input wd-access-search"
          placeholder="🔍 Filter members…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length > 0 && (
        <div className="wd-vis-bulk-btns" style={{ display: 'flex', gap: '8px', margin: '4px 0 16px' }}>
          <button className="wd-qbtn grant" onClick={() => bulkSetFiltered(true)}>
            ✅ Grant all ({filtered.length} shown)
          </button>
          <button className="wd-qbtn revoke" onClick={() => bulkSetFiltered(false)}>
            🚫 Revoke all ({filtered.length} shown)
          </button>
        </div>
      )}

      {/* Mobile cards / Desktop table */}
      {filtered.length === 0
        ? <EmptyState icon="👥" title="No members found." />
        : filtered.map(m => {
          const perms   = access[m.id] ?? {};
          const allOn   = PERMS.every(p => perms[p.key] !== false);
          const isSaved = saved === m.id;
          return (
            <div key={m.id} className={`wd-acc-card ${isSaved ? 'flash' : ''}`}>
              {/* Member row */}
              <div className="wd-acc-card-hdr">
                <div className="wd-avatar">{m.full_name?.[0]?.toUpperCase() ?? '?'}</div>
                <div className="wd-acc-card-info">
                  <p className="wd-acc-name">{m.full_name}</p>
                  <p className="wd-acc-role">{m.role ?? 'Member'}</p>
                </div>
                {isSaved && <span className="wd-saved-flash">✓ Saved</span>}
                {saving === m.id && <span className="wd-saving">…</span>}
                <button className={`wd-qbtn ${allOn ? 'revoke' : 'grant'}`}
                  onClick={() => setAll(m.id, !allOn)} disabled={saving === m.id}>
                  {allOn ? '🚫 Revoke all' : '✅ Grant all'}
                </button>
              </div>
              {/* Permission toggles */}
              <div className="wd-acc-card-perms">
                {PERMS.map(p => {
                  const on = perms[p.key] !== false;
                  return (
                    <div key={p.key} className="wd-acc-perm-item">
                      <span className="wd-acc-perm-lbl">{p.icon} {p.label}</span>
                      <ToggleSwitch on={on} disabled={saving === m.id}
                        onToggle={() => toggle(m.id, p.key)}
                        title={on ? `Hide ${p.label} from ${m.full_name}` : `Show ${p.label} to ${m.full_name}`} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// Visibility rules are actually enforced here for regular members:
//   • see_cases = false           → whole case list is locked
//   • per-case can_see = false    → that case is filtered out entirely
//   • is_visible_to_beneficiary   → hides a case from its own beneficiary until revealed
//   • see_amounts = false         → figures are masked, case cards still show
// Officer + Exec (Chair/Treasurer/Secretary) skip all of the above and always
// see the full, unfiltered list.
//
// refreshSignal: bumped by the root component whenever a new case is created
// (locally, and/or via the shared signal from ChamaWelfare). Bumping it
// forces `load` to re-run (it's in the dependency array) and also resets the
// status filter to 'Active' so a freshly created case is guaranteed to show
// up immediately, regardless of whatever filter tab was selected before.
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ chamaId, memberId, role, isOfficer, onOpenNewCase, refreshSignal }) {
  const fullAccess = hasFullAccessFn(role);
  const isPureExec = isExecFn(role) && !isOfficerFn(role);

  const [cases,        setCases]        = useState([]);
  const [kpi,          setKpi]          = useState({ active: 0, totalRaised: 0, pending: 0, members: 0 });
  const [filter,       setFilter]       = useState('Active');
  const [loading,      setLoading]      = useState(true);
  const [visModal,     setVisModal]     = useState(null);  // CaseVisibilityModal
  const [closeModal,   setCloseModal]   = useState(null);  // CloseEventModal
  const [myAccess,     setMyAccess]     = useState({ see_leaderboard: true, see_amounts: true, see_analytics: true, see_cases: true });

  // When a new case is created elsewhere, jump the filter to 'Active' so the
  // new case (always opened as Active) is visible on return.
  useEffect(() => {
    if (refreshSignal) setFilter('Active');
  }, [refreshSignal]);

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);

    const caseQuery = supabase.from('welfare_cases')
      .select('id,title,event_type,target_amount,total_collected,status,opened_at,description,beneficiary_id,is_visible_to_beneficiary,members!beneficiary_id(full_name)')
      .eq('chama_id', chamaId).order('opened_at', { ascending: false });
    if (filter !== 'All') caseQuery.eq('status', filter);

    const basePromises = [
      caseQuery,
      supabase.from('welfare_contributions').select('*', { count: 'exact', head: true }).eq('chama_id', chamaId).eq('status', 'Pending'),
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('chama_id', chamaId),
    ];

    // Only regular members are subject to visibility settings — skip these lookups
    // entirely for Officer/Exec so their view is always the untouched full list.
    const restrictedPromises = (!fullAccess && memberId) ? [
      supabase.from('welfare_member_access').select('*').eq('chama_id', chamaId).eq('member_id', memberId).maybeSingle(),
      supabase.from('welfare_case_visibility').select('case_id,can_see').eq('chama_id', chamaId).eq('member_id', memberId),
    ] : [];

    const results = await Promise.all([...basePromises, ...restrictedPromises]);
    const { data: cD } = results[0];
    const pC = results[1].count;
    const mC = results[2].count;
    const accessR = results[3];
    const visR    = results[4];

    let list = cD ?? [];
    let access = { see_leaderboard: true, see_amounts: true, see_analytics: true, see_cases: true };

    if (!fullAccess) {
      if (accessR?.data) access = { ...access, ...accessR.data };
      const hidden = new Set((visR?.data ?? []).filter(r => r.can_see === false).map(r => r.case_id));
      list = list.filter(c => {
        if (hidden.has(c.id)) return false;
        // A beneficiary can't see their own case until the officer triggers handover.
        if (c.beneficiary_id === memberId && c.is_visible_to_beneficiary === false) return false;
        return true;
      });
    }

    setMyAccess(access);
    setCases(list);
    setKpi({
      active:      list.filter(c => c.status === 'Active').length,
      totalRaised: list.reduce((s, c) => s + (c.total_collected ?? 0), 0),
      pending:     pC ?? 0,
      members:     mC ?? 0,
    });
    setLoading(false);
  }, [chamaId, filter, fullAccess, memberId, refreshSignal]);

  useEffect(() => { load(); }, [load]);

  const handleClosed = (updated) => {
    setCases(prev => {
      const next = prev.map(c => c.id === updated.id ? { ...c, ...updated } : c);
      // If we're on a specific status tab (not 'All'), a case that just moved to
      // a different status should disappear from view immediately rather than
      // sit there showing a stale status until the next reload.
      return filter === 'All' ? next : next.filter(c => c.status === filter);
    });
    setCloseModal(null);
  };

  // Whole module locked for this member — bail out before rendering anything else.
  if (!loading && !fullAccess && myAccess.see_cases === false) {
    return (
      <EmptyState icon="🔒" title="Case list access restricted"
        sub="The welfare officer has hidden the case list for your account. Contact them if you think this is a mistake." />
    );
  }

  const showAmounts = fullAccess || myAccess.see_amounts !== false;

  return (
    <div>
      {isPureExec && (
        <div className="wd-audit-banner">
          👑 <strong>Unrestricted View</strong> — as {role.charAt(0).toUpperCase() + role.slice(1)}, welfare officer
          visibility settings never apply to your account. You see every case, amount and contribution.
        </div>
      )}

      {/* KPI strip */}
      <div className="wd-kpi-row">
        {[
          { label: 'Active Cases',      val: kpi.active,                                show: true },
          { label: 'Total Raised',      val: `KES ${kpi.totalRaised.toLocaleString()}`, show: showAmounts, colour: '#60a5fa' },
          { label: 'Pending Approvals', val: kpi.pending,                               show: true, colour: '#fbbf24' },
          { label: 'Members',           val: kpi.members,                               show: true, colour: '#a78bfa' },
        ].filter(k => k.show).map((k, i) => (
          <div key={k.label} className="wd-kpi-card" style={{ borderColor: (k.colour ?? '#4ade80') + '44' }}>
            <p className="wd-kpi-label">{k.label}</p>
            <p className="wd-kpi-val" style={{ color: k.colour ?? '#4ade80' }}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="wd-ov-controls">
        <div className="wd-pill-row">
          {['All','Active','Disbursed','Closed'].map(f => (
            <button key={f} className={`wd-pill ${filter === f ? 'on' : ''}`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        {isOfficer && (
          <button className="wd-btn-new" onClick={onOpenNewCase}>➕ Open New Case</button>
        )}
      </div>

      {loading ? <Spinner /> : cases.length === 0 ? (
        <EmptyState icon="💜" title="No welfare cases found."
          sub={isOfficer ? "Click 'Open New Case' to get started." : "No cases at this time."} />
      ) : (
        <div className="wd-card-grid">
          {cases.map(c => {
            const meta = EVENT_META[c.event_type] ?? EVENT_META.Other;
            return (
              <div key={c.id} className="wd-case-card" style={{ borderLeftColor: meta.colour }}>
                {/* Card header */}
                <div className="wd-case-top">
                  <span className="wd-case-emoji">{meta.emoji}</span>
                  <div className="wd-case-info">
                    <p className="wd-case-title">{c.title}</p>
                    <p className="wd-case-meta">
                      {c.event_type}{c.members?.full_name ? ` · ${c.members.full_name}` : ''}
                    </p>
                  </div>
                  <Badge label={c.status} colour={STATUS_COLOUR[c.status] ?? '#6b7280'} />
                </div>

                {c.description && <p className="wd-case-desc">{c.description}</p>}
                {showAmounts ? (
                  <ProgressBar collected={c.total_collected ?? 0} target={c.target_amount ?? 0} colour={meta.colour} />
                ) : (
                  <p className="wd-case-meta" style={{ fontStyle: 'italic' }}>
                    🔒 Amounts hidden by welfare officer
                  </p>
                )}
                <p className="wd-case-date">
                  Opened {new Date(c.opened_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>

                {/* Officer action buttons */}
                {isOfficer && (
                  <div className="wd-case-actions">
                    <button className="wd-case-action-btn vis"
                      onClick={() => setVisModal({ caseId: c.id, caseTitle: c.title, eventType: c.event_type })}>
                      👁 Access
                    </button>
                    {c.status === 'Active' && (
                      <button className="wd-case-action-btn close"
                        onClick={() => setCloseModal(c)}>
                        🔒 Close
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {visModal && (
        <CaseVisibilityModal
          caseId={visModal.caseId}
          caseTitle={visModal.caseTitle}
          eventType={visModal.eventType}
          chamaId={chamaId}
          onClose={() => setVisModal(null)}
        />
      )}
      {closeModal && (
        <CloseEventModal
          caseData={closeModal}
          officerId={null}
          onClose={() => setCloseModal(null)}
          onClosed={handleClosed}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MY RECORDS TAB
// ─────────────────────────────────────────────────────────────────────────────

function MyRecordsTab({ memberId }) {
  const [contribs, setContribs] = useState([]);
  const [totals,   setTotals]   = useState({ pledged: 0, paid: 0, pending: 0 });
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!memberId) return;
    (async () => {
      const { data } = await supabase.from('welfare_contributions')
        .select('id,amount,is_pledge,transaction_code,comment,status,created_at,welfare_cases(title,event_type)')
        .eq('member_id', memberId).order('created_at', { ascending: false });
      const list = data ?? [];
      setContribs(list);
      setTotals({
        pledged: list.filter(d => d.is_pledge).reduce((s, d) => s + (d.amount ?? 0), 0),
        paid:    list.filter(d => !d.is_pledge && d.status === 'Approved').reduce((s, d) => s + (d.amount ?? 0), 0),
        pending: list.filter(d => d.status === 'Pending').reduce((s, d) => s + (d.amount ?? 0), 0),
      });
      setLoading(false);
    })();
  }, [memberId]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="wd-totals-row">
        {[
          { label: 'Pledged',           val: totals.pledged, colour: '#a78bfa' },
          { label: 'Paid & Approved',   val: totals.paid,    colour: '#4ade80' },
          { label: 'Awaiting Approval', val: totals.pending, colour: '#fbbf24' },
        ].map(t => (
          <div key={t.label} className="wd-total-card">
            <p className="wd-total-label">{t.label}</p>
            <p className="wd-total-val" style={{ color: t.colour }}>KES {t.val.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {contribs.length === 0
        ? <EmptyState icon="📋" title="No contributions yet." sub="Your contributions will appear here." />
        : (
          /* Responsive card list on mobile, table on desktop */
          <div className="wd-rec-list">
            {contribs.map(c => {
              const meta = EVENT_META[c.welfare_cases?.event_type] ?? EVENT_META.Other;
              return (
                <div key={c.id} className="wd-rec-card">
                  <div className="wd-rec-card-row">
                    <span className="wd-rec-case">{meta.emoji} {c.welfare_cases?.title ?? '—'}</span>
                    <span className="wd-tbl-val">KES {(c.amount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="wd-rec-card-row">
                    <span>
                      <Badge label={c.is_pledge ? 'Pledge' : 'Payment'} colour={c.is_pledge ? '#a78bfa' : '#4ade80'} />
                    </span>
                    <span>
                      <Badge label={c.status} colour={c.status === 'Approved' ? '#4ade80' : '#fbbf24'} />
                    </span>
                    <span className="wd-tbl-muted">
                      {new Date(c.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGEMENT TAB
// ─────────────────────────────────────────────────────────────────────────────

function ManagementTab({ role, memberId, chamaId }) {
  const isOfficer  = isOfficerFn(role);
  const isReadOnly = isExecFn(role) && !isOfficer;
  const [subTab, setSubTab] = useState('approvals');

  return (
    <div>
      {isReadOnly && (
        <div className="wd-audit-banner">
          🔍 <strong>Audit View</strong> — Read-only. Only the Welfare Officer can approve or change access.
          You still see every case and every contribution, including ones hidden from regular members.
        </div>
      )}
      <div className="wd-sub-tab-bar">
        <button className={`wd-sub-tab ${subTab === 'approvals' ? 'active' : ''}`}
          onClick={() => setSubTab('approvals')}>✅ Approvals</button>
        {isOfficer && (
          <button className={`wd-sub-tab ${subTab === 'access' ? 'active' : ''}`}
            onClick={() => setSubTab('access')}>🔐 Module Access</button>
        )}
      </div>
      {subTab === 'approvals' && <ApprovalsPanel memberId={memberId} chamaId={chamaId} isReadOnly={isReadOnly} isOfficer={isOfficer} />}
      {subTab === 'access' && isOfficer && <ModuleAccessPanel chamaId={chamaId} />}
    </div>
  );
}

function ApprovalsPanel({ memberId, chamaId, isReadOnly, isOfficer }) {
  const [cases,     setCases]     = useState([]);
  const [caseId,    setCaseId]    = useState('');
  const [contribs,  setContribs]  = useState([]);
  const [actioning, setActioning] = useState(null);
  const [loadingC,  setLoadingC]  = useState(false);

  useEffect(() => {
    if (!chamaId) return;
    supabase.from('welfare_cases')
      .select('id,title,event_type,status,is_visible_to_beneficiary')
      .eq('chama_id', chamaId).order('opened_at', { ascending: false })
      .then(({ data }) => setCases(data ?? []));
  }, [chamaId]);

  useEffect(() => {
    if (!caseId) { setContribs([]); return; }
    setLoadingC(true);
    supabase.from('welfare_contributions')
      .select('id,amount,is_pledge,transaction_code,comment,status,is_visible,amount_visible,created_at,members(full_name,phone)')
      .eq('case_id', caseId).order('created_at', { ascending: false })
      .then(({ data }) => { setContribs(data ?? []); setLoadingC(false); });
  }, [caseId]);

  const act = async (id, update) => {
    setActioning(id);
    await supabase.from('welfare_contributions').update(update).eq('id', id);
    setContribs(p => p.map(c => c.id === id ? { ...c, ...update } : c));
    setActioning(null);
  };

  const toggleHandover = async (cId, cur) => {
    await supabase.from('welfare_cases').update({ is_visible_to_beneficiary: !cur }).eq('id', cId);
    setCases(p => p.map(c => c.id === cId ? { ...c, is_visible_to_beneficiary: !cur } : c));
  };

  const activeCaseObj = cases.find(c => c.id === caseId);
  const pendingCount  = contribs.filter(c => c.status === 'Pending').length;

  return (
    <div>
      <div className="wd-fg">
        <label className="wd-label">Select Case</label>
        <select className="wd-input" value={caseId} onChange={e => setCaseId(e.target.value)}>
          <option value="">— Choose a welfare case —</option>
          {cases.map(c => (
            <option key={c.id} value={c.id}>
              {EVENT_META[c.event_type]?.emoji} {c.title} [{c.status}]
            </option>
          ))}
        </select>
      </div>

      {caseId && activeCaseObj && isOfficer && (
        <div className="wd-handover-card">
          <div>
            <p className="wd-handover-label">🔑 Beneficiary Handover</p>
            <p className="wd-handover-sub">
              {activeCaseObj.is_visible_to_beneficiary
                ? '✅ Beneficiary can see the full welfare record.'
                : '🔒 Hidden from beneficiary. Trigger when ready.'}
            </p>
          </div>
          <button
            className={`wd-handover-btn ${activeCaseObj.is_visible_to_beneficiary ? 'revoke' : 'trigger'}`}
            onClick={() => toggleHandover(caseId, activeCaseObj.is_visible_to_beneficiary)}>
            {activeCaseObj.is_visible_to_beneficiary ? 'Revoke Handover' : 'Trigger Handover'}
          </button>
        </div>
      )}

      {caseId && (
        <>
          <h4 className="wd-section-head">
            Approval Queue
            {pendingCount > 0 && <span className="wd-pending-badge">{pendingCount} pending</span>}
          </h4>

          {loadingC ? <Spinner /> : contribs.length === 0 ? (
            <EmptyState icon="📭" title="No contributions for this case yet." />
          ) : (
            /* Mobile: stacked cards. Desktop: table grid via CSS */
            <div className="wd-approvals-list">
              {contribs.map(c => (
                <div key={c.id} className={`wd-approval-card ${!c.is_visible ? 'hidden' : ''}`}>
                  <div className="wd-approval-top">
                    <span className="wd-tbl-bold">
                      {c.members?.full_name ?? '—'}
                      {!c.is_visible && <span className="wd-hidden-tag"> 🔕</span>}
                      {c.is_visible && c.amount_visible === false && <span className="wd-hidden-tag" title="Amount hidden from members"> 🙈</span>}
                    </span>
                    <Badge label={c.is_pledge ? 'Pledge' : 'Payment'} colour={c.is_pledge ? '#a78bfa' : '#4ade80'} />
                    <span className="wd-tbl-val">KES {(c.amount ?? 0).toLocaleString()}</span>
                    <Badge label={c.status}
                      colour={c.status === 'Approved' ? '#4ade80' : c.status === 'Rejected' ? '#ef4444' : '#fbbf24'} />
                  </div>
                  <div className="wd-approval-detail">
                    {c.transaction_code && (
                      <span className="wd-tbl-mono">{c.transaction_code}</span>
                    )}
                    {c.comment && (
                      <span className="wd-tbl-muted" title={c.comment}>
                        "{c.comment.length > 40 ? c.comment.slice(0, 40) + '…' : c.comment}"
                      </span>
                    )}
                    <span className="wd-tbl-muted">
                      {new Date(c.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  {!isReadOnly && (
                    <div className="wd-approval-actions">
                      {c.status === 'Pending' && (
                        <>
                          <button className="wd-approve-btn"
                            onClick={() => act(c.id, { status: 'Approved', approved_by: memberId, approved_at: new Date().toISOString() })}
                            disabled={actioning === c.id}>✓ Approve</button>
                          <button className="wd-reject-btn"
                            onClick={() => act(c.id, { status: 'Rejected' })}
                            disabled={actioning === c.id}>✕ Reject</button>
                        </>
                      )}
                      <button className="wd-vis-btn"
                        onClick={() => act(c.id, { is_visible: !c.is_visible })}
                        disabled={actioning === c.id}>
                        {c.is_visible ? '👁 Hide' : '🙈 Show'}
                      </button>
                      <button className="wd-vis-btn"
                        onClick={() => act(c.id, { amount_visible: c.amount_visible === false })}
                        disabled={actioning === c.id || !c.is_visible}
                        title={!c.is_visible ? 'Row is hidden — show it first' : undefined}>
                        {c.amount_visible === false ? '💰 Show amount' : '🙈 Hide amount'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS TAB
// ─────────────────────────────────────────────────────────────────────────────

function ReportsTab({ chamaId, chamaName }) {
  const [cases,    setCases]    = useState([]);
  const [caseId,   setCaseId]   = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!chamaId) return;
    supabase.from('welfare_cases')
      .select('id,title,event_type,status,total_collected,target_amount,opened_at')
      .eq('chama_id', chamaId).order('opened_at', { ascending: false })
      .then(({ data }) => { setCases(data ?? []); setLoading(false); });
  }, [chamaId]);

  const activeCase = cases.find(c => c.id === caseId);

  return (
    <div>
      <p className="wd-report-intro">
        Generate a formatted PDF welfare report. Tone auto-matches the event type —
        empathy for Funeral &amp; Sickness, celebration for Wedding &amp; Achievement.
      </p>
      <div className="wd-fg">
        <label className="wd-label">Select Case</label>
        {loading ? <Spinner text="Loading cases…" /> : (
          <select className="wd-input" value={caseId} onChange={e => setCaseId(e.target.value)}>
            <option value="">— Choose a case —</option>
            {cases.map(c => (
              <option key={c.id} value={c.id}>
                {EVENT_META[c.event_type]?.emoji ?? '🤝'} {c.title} [{c.status}]
              </option>
            ))}
          </select>
        )}
      </div>
      {activeCase && (
        <div className="wd-report-preview">
          {[
            ['Event Type', <Badge label={activeCase.event_type} colour={EVENT_META[activeCase.event_type]?.colour ?? '#a78bfa'} />],
            ['Status',     <Badge label={activeCase.status} colour={STATUS_COLOUR[activeCase.status] ?? '#6b7280'} />],
            ['Target',     `KES ${(activeCase.target_amount ?? 0).toLocaleString()}`],
            ['Raised',     `KES ${(activeCase.total_collected ?? 0).toLocaleString()}`],
            ['PDF Tone',   ['Funeral','Sickness'].includes(activeCase.event_type) ? '🕊️ Empathy' : ['Wedding','Achievement'].includes(activeCase.event_type) ? '🎉 Celebration' : '🤝 Community'],
          ].map(([label, val]) => (
            <div key={label} className="wd-rp-row">
              <span className="wd-rp-label">{label}</span>
              <span className="wd-rp-val">{val}</span>
            </div>
          ))}
        </div>
      )}
      {caseId && activeCase && (
        <WelfareReportPDF caseId={caseId} caseData={activeCase} chamaName={chamaName} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT COMPONENT
// Props come directly from ChamaWelfare (chamaId, member, role, refreshSignal,
// onCaseCreated) — there is no ChamaContext dependency here anymore, so this
// dashboard and WelfareOverview are guaranteed to be looking at the same
// chama/member and can never silently drift out of sync.
// ─────────────────────────────────────────────────────────────────────────────

const WelfareOfficerDashboard = ({ chamaId, member, role, refreshSignal: parentRefreshSignal, onCaseCreated }) => {
  const [activeTab, setActiveTab]       = useState('overview');
  const [newCaseOpen, setNewCaseOpen]   = useState(false);
  const [menuOpen, setMenuOpen]         = useState(false); // mobile nav drawer
  const [localRefresh, setLocalRefresh] = useState(0);     // this dashboard's own case-created signal

  // Combine parent's shared signal with the local one so OverviewTab reloads
  // whether the trigger came from here or from a sibling tab via ChamaWelfare.
  const refreshSignal = (parentRefreshSignal ?? 0) + localRefresh;

  const isOfficer   = isOfficerFn(role);
  const isExecutive = isExecFn(role);
  const canManage   = canManageFn(role);

  const TABS = [
    { id: 'overview',   label: 'Overview',   icon: '📋', show: true      },
    { id: 'records',    label: 'My Records', icon: '🙋', show: true      },
    { id: 'management', label: 'Management', icon: isExecutive && !isOfficer ? '🔍' : '⚙️', show: canManage },
    { id: 'analytics',  label: 'Analytics',  icon: '📊', show: canManage },
    { id: 'reports',    label: 'Reports',    icon: '📄', show: canManage },
  ].filter(t => t.show);

  useEffect(() => {
    if (!TABS.find(t => t.id === activeTab)) setActiveTab('overview');
  }, [role]); // eslint-disable-line

  const goTab = id => { setActiveTab(id); setMenuOpen(false); };

  // Fires once a new case is confirmed saved in the DB (see NewEventModal's
  // onCreated). Bumps the local signal (this dashboard's own Overview reloads
  // right away) and calls onCaseCreated so ChamaWelfare can bump its shared
  // signal too, for the sibling WelfareOverview tab.
  const handleCaseCreated = () => {
    setNewCaseOpen(false);
    setActiveTab('overview');
    setLocalRefresh(s => s + 1);
    onCaseCreated?.();
  };

  return (
    <div className="wd-wrapper">
      {/* ── Page header ── */}
      <div className="wd-page-hdr">
        <div className="wd-page-hdr-left">
          {/* Mobile hamburger */}
          <button className="wd-hamburger" onClick={() => setMenuOpen(m => !m)} aria-label="Menu">
            {menuOpen ? '✕' : '☰'}
          </button>
          <div>
            <h2 className="wd-page-title">💜 Welfare & Support</h2>
            <p className="wd-page-sub">
              {isOfficer   && <span className="wd-role-chip officer">Welfare Officer</span>}
              {isExecutive && !isOfficer && (
                <span className="wd-role-chip exec"
                  title="Unrestricted view — welfare officer visibility settings never apply to your role">
                  Executive
                </span>
              )}
            </p>
          </div>
        </div>
        {isOfficer && (
          <button className="wd-btn-new" onClick={() => setNewCaseOpen(true)}>
            ➕ <span className="wd-btn-new-label">Open New Case</span>
          </button>
        )}
      </div>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div className="wd-drawer">
          {TABS.map(t => (
            <button key={t.id}
              className={`wd-drawer-item ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => goTab(t.id)}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Desktop / tablet tab bar ── */}
      <nav className="wd-tab-bar" aria-label="Welfare sections">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={activeTab === t.id}
            className={`wd-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => goTab(t.id)}>
            <span className="wd-tab-icon">{t.icon}</span>
            <span className="wd-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Tab content ── */}
      <div className="wd-tab-content">
        {activeTab === 'overview'   && (
          <OverviewTab
            chamaId={chamaId} memberId={member?.id} role={role}
            isOfficer={isOfficer} onOpenNewCase={() => setNewCaseOpen(true)}
            refreshSignal={refreshSignal}
          />
        )}
        {activeTab === 'records'    && <MyRecordsTab  memberId={member?.id} />}
        {activeTab === 'management' && canManage && <ManagementTab role={role} memberId={member?.id} chamaId={chamaId} />}
        {activeTab === 'analytics'  && canManage && <WelfareAnalytics chamaId={chamaId} currentRole={role} />}
        {activeTab === 'reports'    && canManage && <ReportsTab chamaId={chamaId} chamaName={member?.chama_name} />}
      </div>

      {/* ── Modals ── */}
      {newCaseOpen && (
        <NewEventModal
          chamaId={chamaId} officerId={member?.id}
          onClose={() => setNewCaseOpen(false)}
          onCreated={handleCaseCreated}
        />
      )}
    </div>
  );
};

export default WelfareOfficerDashboard;