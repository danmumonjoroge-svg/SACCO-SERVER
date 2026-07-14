// modules/chama/welfare/WelfareOverview.js
// Member-facing welfare screen.
//
//   ✅ Loads welfare cases straight from `welfare_cases`, filtered by the same
//      visibility rules the officer dashboard enforces (module access,
//      per-case access, beneficiary handover) — Officer/Exec always see the
//      unfiltered list.
//   ✅ Members can contribute (pledge or payment) to any Active case they can
//      see. On submit, the new contribution is inserted, the contributor list
//      for that case reloads immediately, and `onContributed` bubbles up so
//      sibling tabs know to refresh too.
//   ✅ Contributor list per case respects is_visible / amount_visible exactly
//      like the officer's visibility modal — a masked row still proves someone
//      contributed without exposing the amount.
//   ✅ `refreshSignal` prop lets a parent force a reload even if this
//      component stays mounted across tab switches.

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

const EXEC_ROLES  = ['chair', 'treasurer', 'secretary'];
const isExecFn    = r => EXEC_ROLES.includes(r?.toLowerCase());
const isOfficerFn = r => r === 'welfare_officer';
const fullAccessFn = r => isOfficerFn(r) || isExecFn(r);

const EVENT_META = {
  Funeral:     { emoji: '🕊️', colour: '#818cf8' },
  Wedding:     { emoji: '💍', colour: '#4ade80' },
  Sickness:    { emoji: '🏥', colour: '#60a5fa' },
  Achievement: { emoji: '🏆', colour: '#fbbf24' },
  Other:       { emoji: '🤝', colour: '#a78bfa' },
};
const STATUS_COLOUR = { Active: '#4ade80', Disbursed: '#60a5fa', Closed: '#6b7280' };

function Spinner() { return <p className="wov-spinner">Loading…</p>; }

function EmptyState({ icon, title, sub }) {
  return (
    <div className="wov-empty">
      <span className="wov-empty-icon">{icon}</span>
      <p className="wov-empty-title">{title}</p>
      {sub && <p className="wov-empty-sub">{sub}</p>}
    </div>
  );
}

function ProgressBar({ collected = 0, target = 0, colour = '#d4a94f' }) {
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  return (
    <div className="wov-progress">
      <div className="wov-progress-track">
        <div className="wov-progress-fill" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <div className="wov-progress-stats">
        <span>KES {collected.toLocaleString()}</span>
        <span>{pct}% of KES {target.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CONTRIBUTE MODAL
// ─────────────────────────────────────────────────────────────────────────

function ContributeModal({ caseData, member, chamaId, onClose, onSubmitted }) {
  const [amount,     setAmount]     = useState('');
  const [isPledge,   setIsPledge]   = useState(false);
  const [txnCode,    setTxnCode]    = useState('');
  const [comment,    setComment]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const meta = EVENT_META[caseData.event_type] ?? EVENT_META.Other;

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount greater than 0.'); return; }
    if (!isPledge && !txnCode.trim()) { setError('Transaction code is required for a payment.'); return; }

    setSaving(true); setError('');
    try {
      const { data, error: err } = await supabase.from('welfare_contributions').insert({
        chama_id:         chamaId,
        case_id:          caseData.id,
        member_id:        member.id,
        amount:           amt,
        is_pledge:        isPledge,
        transaction_code: isPledge ? null : txnCode.trim(),
        comment:          comment.trim() || null,
        status:           'Pending',
        is_visible:       true,
        amount_visible:   true,
      }).select().single();
      if (err) throw err;
      onSubmitted(data);
    } catch (e) {
      setError(e.message ?? 'Failed to submit contribution.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wov-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wov-modal" role="dialog" aria-modal="true">
        <div className="wov-modal-hdr">
          <div>
            <h3 className="wov-modal-title">{meta.emoji} Contribute — {caseData.title}</h3>
            <p className="wov-modal-sub">Your contribution goes to the approval queue before it's counted.</p>
          </div>
          <button className="wov-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="wov-fg">
          <label className="wov-label">Type</label>
          <div className="wov-type-row">
            <button type="button" className={`wov-type-btn ${!isPledge ? 'sel' : ''}`} onClick={() => setIsPledge(false)}>
              💳 Payment (already sent)
            </button>
            <button type="button" className={`wov-type-btn ${isPledge ? 'sel' : ''}`} onClick={() => setIsPledge(true)}>
              🤝 Pledge (promise to pay)
            </button>
          </div>
        </div>

        <div className="wov-fg">
          <label className="wov-label">Amount (KES) <span className="wov-req">*</span></label>
          <input type="number" inputMode="decimal" min="1" className="wov-input"
            placeholder="e.g. 1000" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>

        {!isPledge && (
          <div className="wov-fg">
            <label className="wov-label">M-PESA Transaction Code <span className="wov-req">*</span></label>
            <input type="text" className="wov-input" placeholder="e.g. QFT7X8YZ1A"
              value={txnCode} onChange={e => setTxnCode(e.target.value.toUpperCase())} />
          </div>
        )}

        <div className="wov-fg">
          <label className="wov-label">Note <span className="wov-opt">(optional)</span></label>
          <textarea rows={2} className="wov-input wov-ta" placeholder="Anything you'd like to add…"
            value={comment} onChange={e => setComment(e.target.value)} />
        </div>

        {error && <div className="wov-error" role="alert">⚠ {error}</div>}

        <div className="wov-modal-actions">
          <button className="wov-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="wov-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '⏳ Submitting…' : `${meta.emoji} Submit ${isPledge ? 'Pledge' : 'Payment'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CONTRIBUTOR LIST  (per case, respecting visibility)
// ─────────────────────────────────────────────────────────────────────────

function ContributorList({ caseId, fullAccess, showAmounts, reloadKey }) {
  const [contribs, setContribs] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('welfare_contributions')
      .select('id,amount,is_pledge,status,is_visible,amount_visible,members(full_name)')
      .eq('case_id', caseId).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const list = fullAccess ? (data ?? []) : (data ?? []).filter(c => c.is_visible !== false);
        setContribs(list);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [caseId, fullAccess, reloadKey]);

  if (loading) return <p className="wov-mini-spinner">Loading contributors…</p>;
  if (contribs.length === 0) return <p className="wov-no-contrib">No contributions yet — be the first.</p>;

  return (
    <div className="wov-contrib-list">
      {contribs.map(c => {
        const amtVisible = fullAccess || (showAmounts && c.amount_visible !== false);
        return (
          <div key={c.id} className="wov-contrib-row">
            <span className="wov-contrib-name">{c.members?.full_name ?? 'Member'}</span>
            <span className={`wov-contrib-badge ${c.is_pledge ? 'pledge' : 'payment'}`}>
              {c.is_pledge ? 'Pledge' : 'Payment'}
            </span>
            <span className={`wov-contrib-status ${c.status.toLowerCase()}`}>{c.status}</span>
            <span className="wov-contrib-amt">
              {amtVisible ? `KES ${Number(c.amount).toLocaleString()}` : '🙈 hidden'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────

export default function WelfareOverview({ chamaId, member, role, refreshSignal, onContributed }) {
  const fullAccess = fullAccessFn(role);

  const [cases,       setCases]       = useState([]);
  const [myAccess,    setMyAccess]    = useState({ see_leaderboard: true, see_amounts: true, see_analytics: true, see_cases: true });
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('Active');
  const [expanded,    setExpanded]    = useState(null);   // caseId currently showing contributors
  const [contribModal,setContribModal]= useState(null);   // case object
  const [justAdded,   setJustAdded]   = useState(null);   // caseId flash after contribution
  const [localReload, setLocalReload] = useState(0);      // bumps ContributorList after a submit

  const load = useCallback(async () => {
    if (!chamaId) return;
    setLoading(true);

    const caseQuery = supabase.from('welfare_cases')
      .select('id,title,event_type,target_amount,total_collected,status,opened_at,description,beneficiary_id,is_visible_to_beneficiary')
      .eq('chama_id', chamaId).order('opened_at', { ascending: false });
    if (filter !== 'All') caseQuery.eq('status', filter);

    const restricted = (!fullAccess && member?.id) ? [
      supabase.from('welfare_member_access').select('*').eq('chama_id', chamaId).eq('member_id', member.id).maybeSingle(),
      supabase.from('welfare_case_visibility').select('case_id,can_see').eq('chama_id', chamaId).eq('member_id', member.id),
    ] : [];

    const [cR, aR, vR] = await Promise.all([caseQuery, ...restricted]);

    let list = cR.data ?? [];
    let access = { see_leaderboard: true, see_amounts: true, see_analytics: true, see_cases: true };

    if (!fullAccess) {
      if (aR?.data) access = { ...access, ...aR.data };
      const hidden = new Set((vR?.data ?? []).filter(r => r.can_see === false).map(r => r.case_id));
      list = list.filter(c => {
        if (hidden.has(c.id)) return false;
        if (c.beneficiary_id === member?.id && c.is_visible_to_beneficiary === false) return false;
        return true;
      });
    }

    setMyAccess(access);
    setCases(list);
    setLoading(false);
  }, [chamaId, filter, fullAccess, member?.id, refreshSignal]);

  useEffect(() => { load(); }, [load]);

  const handleSubmitted = (newRow) => {
    setContribModal(null);
    setLocalReload(n => n + 1);          // refresh the open contributor list right away
    setJustAdded(newRow.case_id);
    setExpanded(newRow.case_id);          // auto-expand so the person sees their own row
    setTimeout(() => setJustAdded(c => c === newRow.case_id ? null : c), 2000);
    onContributed?.();                    // let sibling tabs know something changed
  };

  if (!loading && !fullAccess && myAccess.see_cases === false) {
    return (
      <EmptyState icon="🔒" title="Welfare list access restricted"
        sub="The welfare officer has hidden this for your account. Contact them if you think this is a mistake." />
    );
  }

  const showAmounts = fullAccess || myAccess.see_amounts !== false;

  return (
    <div className="wov-wrap">
      <div className="wov-controls">
        <div className="wov-pill-row">
          {['All','Active','Disbursed','Closed'].map(f => (
            <button key={f} className={`wov-pill ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : cases.length === 0 ? (
        <EmptyState icon="💜" title="No welfare cases to show." sub="Check back once the welfare officer opens one." />
      ) : (
        <div className="wov-grid">
          {cases.map(c => {
            const meta = EVENT_META[c.event_type] ?? EVENT_META.Other;
            const isExpanded = expanded === c.id;
            return (
              <div key={c.id} className={`wov-card ${justAdded === c.id ? 'flash' : ''}`} style={{ borderLeftColor: meta.colour }}>
                <div className="wov-card-top">
                  <span className="wov-card-emoji">{meta.emoji}</span>
                  <div className="wov-card-info">
                    <p className="wov-card-title">{c.title}</p>
                    <p className="wov-card-meta">{c.event_type}</p>
                  </div>
                  <span className="wov-status-badge" style={{ color: STATUS_COLOUR[c.status], borderColor: STATUS_COLOUR[c.status] + '55' }}>
                    {c.status}
                  </span>
                </div>

                {c.description && <p className="wov-card-desc">{c.description}</p>}

                {showAmounts ? (
                  <ProgressBar collected={c.total_collected ?? 0} target={c.target_amount ?? 0} colour={meta.colour} />
                ) : (
                  <p className="wov-hidden-note">🔒 Amounts hidden by welfare officer</p>
                )}

                <div className="wov-card-actions">
                  <button className="wov-link-btn" onClick={() => setExpanded(isExpanded ? null : c.id)}>
                    {isExpanded ? '▲ Hide contributors' : '▼ Show contributors'}
                  </button>
                  {c.status === 'Active' && (
                    <button className="wov-contribute-btn" onClick={() => setContribModal(c)}>
                      🙏 Contribute
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="wov-expand">
                    <ContributorList
                      caseId={c.id}
                      fullAccess={fullAccess}
                      showAmounts={showAmounts}
                      reloadKey={localReload}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {contribModal && (
        <ContributeModal
          caseData={contribModal}
          member={member}
          chamaId={chamaId}
          onClose={() => setContribModal(null)}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}