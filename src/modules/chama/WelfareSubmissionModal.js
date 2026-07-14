// modules/chama/welfare/WelfareSubmissionModal.js
// ─────────────────────────────────────────────────────────────────────────────
// DROP-IN REPLACEMENT — keeps your existing prop contract exactly:
//   { caseId, isOpen, onClose, onSubmit }
//
// What's new over the starter version:
//   ✅ Styled toggle (Pledge vs Actual Payment) with visual feedback
//   ✅ Character counter on comment (live, colour-coded at 30 / 10 remaining)
//   ✅ Field-level validation with inline error messages
//   ✅ Unique transaction-code check against Supabase before submit
//   ✅ Case summary card (title, event type, progress bar) fetched by caseId
//   ✅ Amount formatting hint (KES prefix)
//   ✅ M-PESA transaction code auto-uppercased + copy-paste friendly
//   ✅ Success confirmation screen before close
//   ✅ Loading / submitting states with disabled controls
//   ✅ Keyboard: Escape closes modal
//   ✅ Click-outside-to-close on the overlay
//   ✅ ARIA roles for screen readers
//   ✅ Dark theme consistent with rest of chama module
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../supabaseClient';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const COMMENT_MAX = 100;

const EVENT_META = {
  Funeral:     { emoji: '🕊️', colour: '#818cf8', label: 'Funeral Support'        },
  Wedding:     { emoji: '💍', colour: '#4ade80', label: 'Wedding / Dowry'         },
  Sickness:    { emoji: '🏥', colour: '#60a5fa', label: 'Medical Support'         },
  Achievement: { emoji: '🏆', colour: '#fbbf24', label: 'Achievement Recognition' },
  Other:       { emoji: '🤝', colour: '#a78bfa', label: 'Community Support'       },
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL INTERNAL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Toggle: Pledge / Actual Payment ──────────────────────────────────────────
function ContribTypeToggle({ value, onChange }) {
  return (
    <div style={toggleStyle.wrap} role="group" aria-label="Contribution type">
      {/* Pledge */}
      <button
        type="button"
        style={{
          ...toggleStyle.btn,
          ...(value === 'pledge' ? toggleStyle.pledgeActive : toggleStyle.inactive),
        }}
        onClick={() => onChange('pledge')}
        aria-pressed={value === 'pledge'}
      >
        <span style={toggleStyle.icon}>🤲</span>
        <span style={toggleStyle.textWrap}>
          <span style={toggleStyle.btnLabel}>Pledge</span>
          <span style={toggleStyle.btnSub}>I'll pay later</span>
        </span>
      </button>

      {/* Actual Payment */}
      <button
        type="button"
        style={{
          ...toggleStyle.btn,
          ...(value === 'actual' ? toggleStyle.actualActive : toggleStyle.inactive),
        }}
        onClick={() => onChange('actual')}
        aria-pressed={value === 'actual'}
      >
        <span style={toggleStyle.icon}>✅</span>
        <span style={toggleStyle.textWrap}>
          <span style={toggleStyle.btnLabel}>Actual Payment</span>
          <span style={toggleStyle.btnSub}>Already sent</span>
        </span>
      </button>
    </div>
  );
}

// ── Live character counter ────────────────────────────────────────────────────
function CharCounter({ current, max }) {
  const remaining = max - current;
  const colour =
    remaining <= 10 ? '#ef4444' :
    remaining <= 30 ? '#f59e0b' :
    '#64748b';
  return (
    <span style={{ fontSize: '0.72rem', color: colour, fontVariantNumeric: 'tabular-nums' }}>
      {current}/{max}
    </span>
  );
}

// ── Inline field error ────────────────────────────────────────────────────────
function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p role="alert" style={fieldErrorStyle}>
      ⚠ {msg}
    </p>
  );
}

// ── Case summary card ─────────────────────────────────────────────────────────
function CaseSummaryCard({ caseData }) {
  if (!caseData) return null;

  const { title, event_type, target_amount, total_collected } = caseData;
  const meta = EVENT_META[event_type] ?? EVENT_META.Other;
  const pct  = target_amount > 0
    ? Math.min(100, Math.round(((total_collected ?? 0) / target_amount) * 100))
    : 0;

  return (
    <div style={{ ...cardStyle.wrap, borderColor: meta.colour + '44' }}>
      <div style={cardStyle.top}>
        <span style={cardStyle.emoji}>{meta.emoji}</span>
        <div style={cardStyle.info}>
          <p style={cardStyle.title}>{title}</p>
          <span style={{ ...cardStyle.badge, background: meta.colour + '22', color: meta.colour }}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={cardStyle.barWrap}>
        <div
          style={{
            ...cardStyle.barFill,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${meta.colour}99, ${meta.colour})`,
          }}
        />
      </div>
      <div style={cardStyle.stats}>
        <span>KES {(total_collected ?? 0).toLocaleString()} raised</span>
        <span>{pct}% of KES {(target_amount ?? 0).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────
function SuccessScreen({ type, onClose }) {
  return (
    <div style={successStyle.wrap}>
      <div style={successStyle.iconWrap}>
        {type === 'pledge' ? '🤲' : '✅'}
      </div>
      <h3 style={successStyle.title}>
        {type === 'pledge' ? 'Pledge Recorded!' : 'Contribution Submitted!'}
      </h3>
      <p style={successStyle.body}>
        {type === 'pledge'
          ? 'Your pledge has been noted and is pending officer review. Remember to complete your payment.'
          : 'Your payment has been submitted. The welfare officer will verify and approve it shortly.'}
      </p>
      <p style={successStyle.sub}>Thank you for standing with your chama family. 💜</p>
      <button style={successStyle.btn} onClick={onClose}>Done</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const WelfareSubmissionModal = ({ caseId, isOpen, onClose, onSubmit }) => {

  // ── Form state ──────────────────────────────────────────────────────────────
  const [type, setType]                   = useState('actual');   // 'pledge' | 'actual'
  const [amount, setAmount]               = useState('');
  const [transactionCode, setTransactionCode] = useState('');
  const [comment, setComment]             = useState('');

  // ── UI state ────────────────────────────────────────────────────────────────
  const [caseData, setCaseData]           = useState(null);
  const [loadingCase, setLoadingCase]     = useState(false);
  const [errors, setErrors]               = useState({});
  const [submitting, setSubmitting]       = useState(false);
  const [serverError, setServerError]     = useState('');
  const [done, setDone]                   = useState(false);

  const firstFocusRef = useRef(null);

  // ── Reset when modal opens ──────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setType('actual');
      setAmount('');
      setTransactionCode('');
      setComment('');
      setErrors({});
      setServerError('');
      setDone(false);
      // Focus first control for keyboard users
      setTimeout(() => firstFocusRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // ── Fetch case summary when caseId changes ──────────────────────────────────
  useEffect(() => {
    if (!caseId || !isOpen) return;
    let cancelled = false;
    setLoadingCase(true);
    (async () => {
      const { data, error } = await supabase
        .from('welfare_cases')
        .select('id, title, event_type, target_amount, total_collected')
        .eq('id', caseId)
        .single();
      if (!cancelled && !error) setCaseData(data);
      if (!cancelled) setLoadingCase(false);
    })();
    return () => { cancelled = true; };
  }, [caseId, isOpen]);

  // ── Keyboard: Escape to close ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isOpen, onClose]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = useCallback(async () => {
    const e = {};

    // Amount
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      e.amount = 'Please enter a valid amount greater than 0.';
    }

    if (type === 'actual') {
      // Transaction code presence
      if (!transactionCode.trim()) {
        e.transactionCode = 'A transaction code is required for actual payments.';
      } else {
        // Uniqueness check — prevents duplicate M-PESA codes
        const { count, error: dbErr } = await supabase
          .from('welfare_contributions')
          .select('*', { count: 'exact', head: true })
          .eq('transaction_code', transactionCode.trim().toUpperCase());

        if (!dbErr && count > 0) {
          e.transactionCode =
            'This transaction code already exists. Check for a duplicate submission.';
        }
      }

      // Comment required for actual payments
      if (!comment.trim()) {
        e.comment = 'Please add a short comment describing your payment.';
      }
    }

    // Comment max length (applies to both types if filled)
    if (comment.length > COMMENT_MAX) {
      e.comment = `Comment cannot exceed ${COMMENT_MAX} characters.`;
    }

    return e;
  }, [amount, type, transactionCode, comment]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setErrors({});
    setSubmitting(true);

    try {
      const validationErrors = await validate();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setSubmitting(false);
        return;
      }

      // Build payload — matches welfare_contributions schema
      const payload = {
        caseId,
        type,
        amount:          parseFloat(amount),
        transactionCode: type === 'actual' ? transactionCode.trim().toUpperCase() : null,
        comment:         type === 'actual' ? comment.trim()                       : null,
        // Extra fields your onSubmit handler / Supabase insert can use:
        is_pledge:       type === 'pledge',
        status:          'Pending',
      };

      // Call parent handler — parent is responsible for the actual DB insert
      // (keeps this modal decoupled from direct Supabase writes if preferred)
      await onSubmit(payload);

      setDone(true);
    } catch (err) {
      setServerError(
        err?.message?.includes('unique') || err?.message?.includes('duplicate')
          ? 'That transaction code is already recorded. Please verify your M-PESA message.'
          : 'Something went wrong. Please try again or contact your welfare officer.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Early exits ─────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={s.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Welfare Contribution"
    >
      <div style={s.modal}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <h3 style={s.title}>💜 Welfare Contribution</h3>
            {caseData && !loadingCase && (
              <p style={s.subtitle}>{caseData.title}</p>
            )}
          </div>
          <button
            style={s.closeBtn}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Success screen ── */}
        {done ? (
          <SuccessScreen type={type} onClose={onClose} />
        ) : (
          <form onSubmit={handleSubmit} noValidate>

            {/* Case summary card */}
            {loadingCase ? (
              <p style={s.loadingText}>Loading case details…</p>
            ) : (
              <CaseSummaryCard caseData={caseData} />
            )}

            {/* ── Toggle ── */}
            <div style={s.section}>
              <label style={s.label}>Contribution Type</label>
              <ContribTypeToggle value={type} onChange={(v) => {
                setType(v);
                setErrors({});
                setServerError('');
              }} />
              <p style={s.hint}>
                {type === 'pledge'
                  ? '🤲 Pledge: records your commitment to pay. No transaction code needed yet.'
                  : '✅ Actual: confirms funds already sent. Requires your M-PESA code.'}
              </p>
            </div>

            {/* ── Amount ── */}
            <div style={s.section}>
              <label style={s.label} htmlFor="wsm-amount">
                Amount (KES) <span style={s.required}>*</span>
              </label>
              <div style={s.inputWrap}>
                <span style={s.inputPrefix}>KES</span>
                <input
                  ref={firstFocusRef}
                  id="wsm-amount"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    ...s.input,
                    paddingLeft: '52px',
                    ...(errors.amount ? s.inputErr : {}),
                  }}
                  disabled={submitting}
                  aria-invalid={!!errors.amount}
                  aria-describedby={errors.amount ? 'wsm-amount-err' : undefined}
                />
              </div>
              <FieldError msg={errors.amount} />
            </div>

            {/* ── Actual-payment fields ── */}
            {type === 'actual' && (
              <>
                {/* Transaction Code */}
                <div style={s.section}>
                  <label style={s.label} htmlFor="wsm-txn">
                    M-PESA / Transaction Code <span style={s.required}>*</span>
                  </label>
                  <input
                    id="wsm-txn"
                    type="text"
                    placeholder="e.g. QGH7K9X2LD"
                    value={transactionCode}
                    onChange={(e) => setTransactionCode(e.target.value.toUpperCase())}
                    style={{
                      ...s.input,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      fontFamily: 'monospace',
                      ...(errors.transactionCode ? s.inputErr : {}),
                    }}
                    disabled={submitting}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!errors.transactionCode}
                  />
                  <p style={s.hint}>Copy exactly from your M-PESA confirmation SMS.</p>
                  <FieldError msg={errors.transactionCode} />
                </div>

                {/* Comment */}
                <div style={s.section}>
                  <div style={s.labelRow}>
                    <label style={s.label} htmlFor="wsm-comment">
                      Comment <span style={s.required}>*</span>
                    </label>
                    <CharCounter current={comment.length} max={COMMENT_MAX} />
                  </div>
                  <textarea
                    id="wsm-comment"
                    rows={3}
                    maxLength={COMMENT_MAX}
                    placeholder="e.g. Sent via M-PESA to chama till on 14 June. Solidarity forever."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    style={{
                      ...s.input,
                      resize: 'vertical',
                      minHeight: '68px',
                      ...(errors.comment ? s.inputErr : {}),
                    }}
                    disabled={submitting}
                    aria-invalid={!!errors.comment}
                  />
                  <FieldError msg={errors.comment} />
                </div>
              </>
            )}

            {/* ── Server / global error ── */}
            {serverError && (
              <div style={s.serverError} role="alert">
                {serverError}
              </div>
            )}

            {/* ── Actions ── */}
            <div style={s.actions}>
              <button
                type="button"
                style={s.cancelBtn}
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  ...s.submitBtn,
                  opacity: submitting ? 0.65 : 1,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
                disabled={submitting}
              >
                {submitting
                  ? 'Submitting…'
                  : type === 'pledge'
                    ? '🤲 Submit Pledge'
                    : '✅ Submit Contribution'}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  );
};

export default WelfareSubmissionModal;

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    background: '#1e1b4b',               // deep indigo — welfare-specific
    border: '1px solid rgba(139,92,246,0.35)',
    borderRadius: '14px',
    width: '100%',
    maxWidth: '460px',
    maxHeight: '92vh',
    overflowY: 'auto',
    padding: '22px 24px 24px',
    color: '#e2e8f0',
    boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.15)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '18px',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: '700',
    color: '#fff',
    lineHeight: 1.3,
  },
  subtitle: {
    margin: '3px 0 0',
    fontSize: '0.75rem',
    color: '#a78bfa',
    lineHeight: 1.3,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#cbd5e1',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '0.78rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
  },
  section: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: '600',
    color: '#c4b5fd',
    marginBottom: '6px',
    lineHeight: 1.4,
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '6px',
  },
  required: {
    color: '#f87171',
    marginLeft: '2px',
  },
  inputWrap: {
    position: 'relative',
  },
  inputPrefix: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#7c3aed',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(139,92,246,0.3)',
    borderRadius: '7px',
    color: '#f1f5f9',
    fontSize: '0.88rem',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  },
  inputErr: {
    borderColor: '#ef4444',
    background: 'rgba(239,68,68,0.07)',
  },
  hint: {
    margin: '5px 0 0',
    fontSize: '0.72rem',
    color: '#6d28d9',
    lineHeight: 1.45,
  },
  serverError: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: '7px',
    padding: '10px 13px',
    fontSize: '0.8rem',
    color: '#fca5a5',
    marginBottom: '14px',
    lineHeight: 1.4,
  },
  loadingText: {
    fontSize: '0.8rem',
    color: '#6d28d9',
    marginBottom: '14px',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(139,92,246,0.15)',
  },
  cancelBtn: {
    padding: '10px 18px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '7px',
    color: '#94a3b8',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  submitBtn: {
    padding: '10px 22px',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    border: 'none',
    borderRadius: '7px',
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: '600',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
    boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
  },
};

const fieldErrorStyle = {
  margin: '5px 0 0',
  fontSize: '0.73rem',
  color: '#f87171',
  lineHeight: 1.4,
};

// ── Toggle styles ─────────────────────────────────────────────────────────────
const toggleStyle = {
  wrap: {
    display: 'flex',
    gap: '8px',
    padding: '5px',
    background: 'rgba(0,0,0,0.25)',
    borderRadius: '10px',
    border: '1px solid rgba(139,92,246,0.2)',
  },
  btn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 12px',
    border: 'none',
    borderRadius: '7px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s, transform 0.1s',
    fontFamily: 'inherit',
  },
  pledgeActive: {
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: '#fff',
    boxShadow: '0 3px 10px rgba(124,58,237,0.35)',
  },
  actualActive: {
    background: 'linear-gradient(135deg, #15803d, #16a34a)',
    color: '#fff',
    boxShadow: '0 3px 10px rgba(22,163,74,0.3)',
  },
  inactive: {
    background: 'transparent',
    color: '#64748b',
  },
  icon: {
    fontSize: '1.1rem',
    flexShrink: 0,
    lineHeight: 1,
  },
  textWrap: {
    display: 'flex',
    flexDirection: 'column',
  },
  btnLabel: {
    fontSize: '0.82rem',
    fontWeight: '600',
    lineHeight: 1.2,
  },
  btnSub: {
    fontSize: '0.66rem',
    opacity: 0.75,
    lineHeight: 1.2,
    marginTop: '1px',
  },
};

// ── Case card styles ──────────────────────────────────────────────────────────
const cardStyle = {
  wrap: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid',
    borderRadius: '9px',
    padding: '12px 14px',
    marginBottom: '16px',
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  emoji: {
    fontSize: '1.5rem',
    lineHeight: 1,
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: '0 0 4px',
    fontSize: '0.88rem',
    fontWeight: '600',
    color: '#f1f5f9',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '0.68rem',
    fontWeight: '600',
  },
  barWrap: {
    height: '5px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginBottom: '5px',
  },
  barFill: {
    height: '100%',
    borderRadius: '9999px',
    transition: 'width 0.5s ease',
  },
  stats: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.68rem',
    color: '#64748b',
  },
};

// ── Success screen styles ─────────────────────────────────────────────────────
const successStyle = {
  wrap: {
    textAlign: 'center',
    padding: '28px 12px 16px',
  },
  iconWrap: {
    fontSize: '3.2rem',
    lineHeight: 1,
    marginBottom: '14px',
    display: 'block',
  },
  title: {
    margin: '0 0 10px',
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#4ade80',
  },
  body: {
    margin: '0 0 8px',
    fontSize: '0.83rem',
    color: '#94a3b8',
    lineHeight: 1.55,
  },
  sub: {
    margin: '0 0 22px',
    fontSize: '0.78rem',
    color: '#7c3aed',
    lineHeight: 1.4,
  },
  btn: {
    padding: '10px 32px',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    border: 'none',
    borderRadius: '7px',
    color: '#fff',
    fontSize: '0.88rem',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};