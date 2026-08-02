import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../../asset/logo/umovalogo.png";
import "./LoanApplicationAdmin.css";

// ═════════════════════════════════════════════════════════════════════════
// SUB-LEDGER ACCOUNT CODES
// ═════════════════════════════════════════════════════════════════════════
const LOAN_ACCOUNT     = 1011;
const SAVINGS_ACCOUNT  = 1018;
const INTEREST_ACCOUNT = 1020;

// ═════════════════════════════════════════════════════════════════════════
// LOAN / APPLICATION ID ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────────
// Every loan application receives an Application ID the moment it is
// created (APP2026000001). A Loan ID (LN2026000001) is issued only once the
// application is approved and converted into a live loan account — this
// keeps "Loan Application" and "Loan Account" as two distinct records, as
// required by requirement #4, and gives every future module (repayment,
// interest charging, penalties, insurance, restructure, write-off,
// statements, GL) a single stable key: loan_id.
//
// NOTE ON CONCURRENCY: ID generation here is derived client-side from the
// applications already loaded in this session (best-effort, consistent with
// the rest of this file's architecture, which has no RPC/Postgres sequence
// available to it). For true multi-admin concurrency safety, replace
// generateLoanId/generateApplicationId with a Postgres sequence or an RPC
// function (e.g. `select nextval('loan_id_seq')`) exposed via Supabase.
// ═════════════════════════════════════════════════════════════════════════
const CURRENT_YEAR = new Date().getFullYear();

const nextSequence = (existingIds, prefix, padLength) => {
  const maxSeq = (existingIds || [])
    .filter((id) => typeof id === "string" && id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `${prefix}${String(maxSeq + 1).padStart(padLength, "0")}`;
};

const generateApplicationId = (existingApplicationIds) =>
  nextSequence(existingApplicationIds, `APP${CURRENT_YEAR}`, 5);

const generateLoanId = (existingLoanIds) =>
  nextSequence(existingLoanIds, `LN${CURRENT_YEAR}`, 6);

// 1. Safe Date Parser Helper
const parseValidDate = (dateVal) => {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ═════════════════════════════════════════════════════════════════════════
// LOAN STATUS WORKFLOW — full banking lifecycle
// ═════════════════════════════════════════════════════════════════════════
const LOAN_STATUS_FLOW = [
  { key: "draft",                  label: "Draft" },
  { key: "pending",                label: "Pending" },
  { key: "credit_analysis",        label: "Credit Analysis" },
  { key: "awaiting_documents",     label: "Awaiting Documents" },
  { key: "awaiting_guarantor",     label: "Awaiting Guarantor" },
  { key: "awaiting_security",      label: "Awaiting Security" },
  { key: "pending_approval",       label: "Pending Approval" },
  { key: "approved",               label: "Approved" },
  { key: "ready_for_disbursement", label: "Ready for Disbursement" },
  { key: "disbursed",              label: "Disbursed" },
  { key: "active",                 label: "Active" },
  { key: "completed",              label: "Completed" },
  { key: "closed",                 label: "Closed" },
];

// Statuses a loan can be diverted into from anywhere in the main flow.
const LOAN_STATUS_EXCEPTIONS = [
  { key: "rejected",       label: "Rejected" },
  { key: "cancelled",      label: "Cancelled" },
  { key: "withdrawn",      label: "Withdrawn" },
  { key: "restructured",   label: "Restructured" },
  { key: "refinanced",     label: "Refinanced" },
  { key: "written_off",    label: "Written Off" },
  { key: "legal_recovery", label: "Legal Recovery" },
  { key: "auction",        label: "Auction" },
  { key: "frozen",         label: "Frozen" },
];

const ALL_LOAN_STATUSES = [...LOAN_STATUS_FLOW, ...LOAN_STATUS_EXCEPTIONS];
const STATUS_LABELS = ALL_LOAN_STATUSES.reduce((acc, s) => ({ ...acc, [s.key]: s.label }), {});
const statusLabel = (key) => STATUS_LABELS[key] || (key ? key.replace(/_/g, " ") : "—");

const ACTIVE_LOAN_STATUSES = ["approved", "ready_for_disbursement", "disbursed", "active"];
const CLOSED_LOAN_STATUSES = ["completed", "closed", "written_off"];
const TERMINATED_STATUSES  = ["rejected", "cancelled", "withdrawn"];

// Statuses an admin can hand-advance a loan through from the approvals queue,
// in addition to the one-click Approve/Reject actions kept for continuity.
const MANUAL_ADVANCE_STATUSES = [
  "pending", "credit_analysis", "awaiting_documents", "awaiting_guarantor",
  "awaiting_security", "pending_approval",
];

// ═════════════════════════════════════════════════════════════════════════
// APPROVAL LEVELS — routed by loan amount
// ═════════════════════════════════════════════════════════════════════════
const APPROVAL_LEVELS = [
  { ceiling: 50_000,      level: "Credit Officer" },
  { ceiling: 250_000,     level: "Branch Manager" },
  { ceiling: 1_000_000,   level: "Credit Committee" },
  { ceiling: 5_000_000,   level: "CEO" },
  { ceiling: Infinity,    level: "Board" },
];
const getApprovalLevel = (amount) =>
  (APPROVAL_LEVELS.find((l) => Number(amount || 0) <= l.ceiling) || APPROVAL_LEVELS[APPROVAL_LEVELS.length - 1]).level;

// ═════════════════════════════════════════════════════════════════════════
// DOCUMENT CHECKLIST
// ═════════════════════════════════════════════════════════════════════════
const DOCUMENT_CHECKLIST_ITEMS = [
  { key: "national_id",          label: "National ID" },
  { key: "kra_pin",              label: "KRA PIN Certificate" },
  { key: "payslip",              label: "Payslip" },
  { key: "bank_statement",       label: "Bank Statement" },
  { key: "passport_photo",       label: "Passport Photo" },
  { key: "utility_bill",         label: "Utility Bill" },
  { key: "guarantor_documents",  label: "Guarantor Documents",  conditional: (f) => f.security_type === "Guarantor" },
  { key: "collateral_documents", label: "Collateral Documents", conditional: (f) => ["Logbook", "Title Deed", "Shares", "Business Assets", "Fixed Assets"].includes(f.security_type) },
  { key: "business_licence",     label: "Business Licence",     conditional: (f) => f.loan_type === "Business Loan" },
];

// ═════════════════════════════════════════════════════════════════════════
// COLLATERAL TYPES
// ═════════════════════════════════════════════════════════════════════════
const COLLATERAL_TYPES = ["Deposits", "Guarantor", "Logbook", "Title Deed", "Shares", "Business Assets", "Fixed Assets"];
const COLLATERAL_REQUIRES_VALUATION = ["Logbook", "Title Deed", "Business Assets", "Fixed Assets"];

// ═════════════════════════════════════════════════════════════════════════
// CONFIGURABLE LOAN CHARGES (requirement #13)
// Shown as an additive, editable breakdown. This does NOT alter the
// existing, already-validated interest / insurance / transaction-charge
// calculation used by the compliance engine below — it is a separate,
// configurable schedule an admin can tune per policy.
// ═════════════════════════════════════════════════════════════════════════
const DEFAULT_LOAN_CHARGES = {
  processing_fee:       { label: "Processing Fee",              type: "percentage_of_principal", value: 1  },
  legal_fee:            { label: "Legal Fee",                   type: "flat",                     value: 0  },
  valuation_fee:        { label: "Valuation Fee",                type: "flat",                     value: 0  },
  stamp_duty:           { label: "Stamp Duty",                   type: "flat",                     value: 0  },
  excise_duty:          { label: "Excise Duty (on interest)",    type: "percentage_of_interest",   value: 20 },
  sms_fee:              { label: "SMS Fee",                      type: "flat",                     value: 10 },
  ledger_fee:           { label: "Ledger / Management Fee",      type: "flat",                     value: 0  },
  commission:           { label: "Commission",                   type: "flat",                     value: 0  },
  early_settlement_fee: { label: "Early Settlement Fee",         type: "percentage_of_principal", value: 2  },
  late_payment_fee:     { label: "Late Payment Fee (per instalment)", type: "flat",               value: 500 },
};

const computeChargeAmount = (charge, principal, totalInterest) => {
  switch (charge.type) {
    case "percentage_of_principal": return (Number(principal || 0) * charge.value) / 100;
    case "percentage_of_interest":  return (Number(totalInterest || 0) * charge.value) / 100;
    case "flat":
    default:                        return Number(charge.value || 0);
  }
};

// ═════════════════════════════════════════════════════════════════════════
// REFINANCE POLICY (enterprise-grade, configurable thresholds)
// ═════════════════════════════════════════════════════════════════════════
const REFINANCE_MAX_OUTSTANDING_PCT = 50;
const REFINANCE_MAX_DAYS_SINCE_REPAYMENT = 30;
const REFINANCE_MIN_CREDIT_SCORE = 65;
const REFINANCE_MANAGER_APPROVAL_THRESHOLD = 250_000; // above this, manager sign-off required even if all checks pass

// ═════════════════════════════════════════════════════════════════════════
// TRANSACTION CHARGE SCHEDULE
// ═════════════════════════════════════════════════════════════════════════
const calcTxCharge = (amount) => {
  const a = Number(amount || 0);
  if (a <= 0)      return 0;
  if (a <= 500)    return 10;
  if (a <= 1000)   return 15;
  if (a <= 5000)   return 25;
  if (a <= 10000)  return 35;
  return 100;
};

// ═════════════════════════════════════════════════════════════════════════
// REDUCING BALANCE AMORTISATION
// ═════════════════════════════════════════════════════════════════════════
const buildSchedule = (principal, annualRatePct, months, insRatePct) => {
  if (months <= 0 || principal <= 0) {
    return { schedule: [], monthlyInstalment: 0, totalInterest: 0, totalInsurance: 0, totalRepayable: principal };
  }

  const r = annualRatePct / 100;
  const insPerMonth = (principal * (insRatePct / 100)) / months;

  let monthlyPrincipalAndInterest;
  if (r === 0) {
    monthlyPrincipalAndInterest = principal / months;
  } else {
    monthlyPrincipalAndInterest = (principal * r) / (1 - Math.pow(1 + r, -months));
  }

  const monthlyInstalment = monthlyPrincipalAndInterest + insPerMonth;
  let balance = principal;
  let totalInterestSum = 0;
  const schedule = [];

  for (let m = 1; m <= months; m++) {
    const interestThisMonth = r > 0 ? balance * r : 0;
    const principalThisMonth = monthlyPrincipalAndInterest - interestThisMonth;
    balance = Math.max(0, balance - principalThisMonth);
    totalInterestSum += interestThisMonth;
    schedule.push({
      month: m,
      principal: Math.round(principalThisMonth),
      interest: Math.round(interestThisMonth),
      insurance: Math.round(insPerMonth),
      total: Math.round(monthlyInstalment),
      balance: Math.round(balance),
    });
  }

  const totalInsurance = insPerMonth * months;
  const totalRepayable = principal + totalInterestSum + totalInsurance;

  return { schedule, monthlyInstalment, totalInterest: totalInterestSum, totalInsurance, totalRepayable };
};

// ═════════════════════════════════════════════════════════════════════════
// LOAN PRODUCT DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════
const buildProducts = (savings, multiplier) => ({
  "Instant Loan":       { rate: 10, insRate: 0, maxDuration: 3,  minMonths: 0, maxAmount: Math.min(10000, savings), reqSecurity: false },
  "Salary Advance":     { rate: 10, insRate: 0, maxDuration: 3,  minMonths: 0, maxAmount: 30000,                   reqSecurity: false },
  "Emergency Loan":     { rate: 3,  insRate: 0, maxDuration: 12, minMonths: 1, maxAmount: savings,                 reqSecurity: false },
  "Development Loan":   { rate: 3,  insRate: 2, maxDuration: 36, minMonths: 3, maxAmount: savings * multiplier,    reqSecurity: true  },
  "Business Loan":      { rate: 4,  insRate: 2, maxDuration: 24, minMonths: 3, maxAmount: savings * multiplier,    reqSecurity: true  },
  "School Fees Loan":   { rate: 3,  insRate: 1, maxDuration: 12, minMonths: 3, maxAmount: savings * multiplier,    reqSecurity: false },
  "Asset Finance Loan": { rate: 5,  insRate: 2, maxDuration: 48, minMonths: 6, maxAmount: savings * multiplier,    reqSecurity: true  },
});

// ═════════════════════════════════════════════════════════════════════════
// AUDIT TRAIL — non-blocking. Writes to an `audit_log` table if present;
// silently skips (with a console warning) if the table does not yet exist,
// so it can never break the primary workflow while the schema migration
// referenced below is pending.
//
// Suggested migration:
//   create table audit_log (
//     id bigint generated always as identity primary key,
//     user_email text, action text, before_state jsonb, after_state jsonb,
//     approval_level text, browser text, ip_address text,
//     occurred_at timestamptz default now()
//   );
// IP address cannot be read reliably from the browser; capture it in a
// server-side Edge Function / Postgres trigger if it's required for audit.
// ═════════════════════════════════════════════════════════════════════════
const logAuditTrail = async ({ action, before = null, after = null, approvalLevel = null }) => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert([{
      user_email: userData?.user?.email || "system",
      action,
      before_state: before ? JSON.stringify(before) : null,
      after_state: after ? JSON.stringify(after) : null,
      approval_level: approvalLevel,
      browser: typeof navigator !== "undefined" ? navigator.userAgent : null,
      occurred_at: new Date().toISOString(),
    }]);
  } catch (err) {
    console.warn("Audit log skipped (table may not exist yet):", err.message);
  }
};

// ═════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS — queues to a `notifications_queue` table for an external
// dispatcher (SMS gateway / email service / WhatsApp Business API) to pick
// up and send. Non-blocking for the same reason as the audit trail.
//
// Suggested migration:
//   create table notifications_queue (
//     id bigint generated always as identity primary key,
//     recipient_type text, member_no text, channel text, template text,
//     payload jsonb, status text default 'queued', created_at timestamptz default now()
//   );
// ═════════════════════════════════════════════════════════════════════════
const NOTIFICATION_CHANNELS = ["sms", "email", "whatsapp", "in_app"];

const queueNotification = async ({ recipientType, memberNo, channel, template, payload }) => {
  try {
    await supabase.from("notifications_queue").insert([{
      recipient_type: recipientType,
      member_no: memberNo,
      channel,
      template,
      payload,
      status: "queued",
      created_at: new Date().toISOString(),
    }]);
  } catch (err) {
    console.warn(`Notification (${channel} → ${recipientType}) not queued:`, err.message);
  }
};

const notifyAllChannels = (recipientType, memberNo, template, payload) =>
  Promise.all(NOTIFICATION_CHANNELS.map((channel) => queueNotification({ recipientType, memberNo, channel, template, payload })));

// ═════════════════════════════════════════════════════════════════════════
// LIGHTWEIGHT INLINE STYLES for new enterprise sections. Kept separate from
// LoanApplicationAdmin.css (which is left untouched) so nothing about the
// existing look-and-feel is disturbed; these blend in using the same
// spacing / radius / colour language already used by the .compliance and
// .memberSnapshot blocks in the stylesheet.
// ═════════════════════════════════════════════════════════════════════════
const S = {
  card: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginTop: 14, background: "#fff" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px dashed #eef2f7" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px" },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 18px" },
  checklistRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13 },
  badge: (ok) => ({
    display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
    background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#15803d" : "#b91c1c",
  }),
  pill: { display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: "#eef2ff", color: "#4338ca", marginLeft: 6 },
  dashboardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 },
  dashTile: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" },
  dashLabel: { fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase" },
  dashValue: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 2 },
  stepperWrap: { display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" },
  step: (state) => ({
    fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
    background: state === "done" ? "#15803d" : state === "current" ? "#2563eb" : "#e2e8f0",
    color: state === "pending" ? "#475569" : "#fff",
  }),
  smallInput: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12.5 },
  linkBtn: { background: "none", border: "none", color: "#2563eb", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 },
};

export default function LoanApplicationAdmin() {
  // ═══════════════════════════════════════════════════════════════════════
  // STATE — existing state preserved verbatim, enterprise state appended
  // ═══════════════════════════════════════════════════════════════════════
  const [members, setMembers]   = useState([]);
  const [member, setMember]     = useState(null);
  const [memberNo, setMemberNo] = useState("");
  const [ledger, setLedger]     = useState([]);
  const [allMembers, setAllMembers] = useState([]);

  const [applications, setApplications] = useState([]);
  const [loadingMember, setLoadingMember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState([]);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const [form, setForm] = useState({
    loan_type: "", amount: "", duration: "", net_income: "",
    purpose: "", security_type: "", security_value: "",
    guarantor_1_no: "", guarantor_2_no: "",
    // Enterprise collateral detail fields (requirement #10)
    security_market_value: "", security_forced_sale_value: "",
    security_insured: false, security_valuation_date: "", security_expiry_date: "",
  });

  // Document checklist state (requirement #11)
  const [docChecklist, setDocChecklist] = useState({});

  // Guarantor assessment state (requirement #9)
  const [guarantor1Assessment, setGuarantor1Assessment] = useState(null);
  const [guarantor2Assessment, setGuarantor2Assessment] = useState(null);
  const [assessingGuarantors, setAssessingGuarantors] = useState(false);

  // Configurable charges panel (requirement #13)
  const [chargesConfig, setChargesConfig] = useState(DEFAULT_LOAN_CHARGES);
  const [showChargesSettings, setShowChargesSettings] = useState(false);

  // Per-card workflow status advance (requirement #3)
  const [statusDraft, setStatusDraft] = useState({});
  const [advancingId, setAdvancingId] = useState(null);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  // ── Bootstrap: load member list + all applications ───────────────────────
  useEffect(() => {
    loadStaticData();
  }, []);

  const loadStaticData = async () => {
    const { data: membersData } = await supabase.from("members").select("*");
    setMembers(membersData || []);

    const { data: gm } = await supabase
      .from("members")
      .select("member_no, name, kyc_status, credit_score, aml_flag, sanctions_flag, created_at");
    setAllMembers(gm || []);

    await loadApplications();
  };

  const loadApplications = async () => {
    const { data: loans } = await supabase
      .from("loan_application")
      .select("*")
      .order("created_at", { ascending: false });
    setApplications(loans || []);
  };

  // ── Load selected member's ledger ────────────────────────────────────────
  useEffect(() => {
    if (!memberNo) {
      setMember(null);
      setLedger([]);
      return;
    }

    const load = async () => {
      setLoadingMember(true);

      const memberData = members.find((m) => m.member_no === memberNo);
      setMember(memberData || null);

      const { data: l, error: lErr } = await supabase
        .from("general_ledger")
        .select("*")
        .eq("member_no", memberNo);

      if (lErr) console.error("Ledger fetch error:", lErr);
      setLedger(l || []);

      setLoadingMember(false);
    };

    load();
  }, [memberNo, members]);

  // ═══════════════════════════════════════════════════════════════════════
  // GUARANTOR ASSESSMENT ENGINE (requirement #9)
  // Computes savings, existing guaranteed exposure, available guarantee
  // limit, own loan balance, credit score, risk rating, arrears, and the
  // number of loans currently guaranteed — then applies a pass/fail policy.
  // ═══════════════════════════════════════════════════════════════════════
  const assessGuarantor = useCallback(async (guarantorMemberNo) => {
    if (!guarantorMemberNo) return null;

    const gMember = allMembers.find((m) => m.member_no === guarantorMemberNo) || {};
    const { data: gLedger } = await supabase
      .from("general_ledger").select("*").eq("member_no", guarantorMemberNo);

    let savings = 0, disbursed = 0, paid = 0, intCharged = 0, intPaid = 0, lastDate = null;
    (gLedger || []).forEach((t) => {
      const amt = Number(t.amount || 0);
      const d = Number(t.debit_account_id), c = Number(t.credit_account_id);
      const txDate = parseValidDate(t.transaction_date || t.created_at);
      const touchesLoan     = d === LOAN_ACCOUNT || c === LOAN_ACCOUNT;
      const touchesInterest = d === INTEREST_ACCOUNT || c === INTEREST_ACCOUNT;

      if (c === SAVINGS_ACCOUNT) savings += amt;
      if (d === SAVINGS_ACCOUNT) savings -= amt;
      if (d === LOAN_ACCOUNT) disbursed += amt;
      if (c === LOAN_ACCOUNT) paid      += amt;
      if (c === INTEREST_ACCOUNT) intCharged += amt;
      if (d === INTEREST_ACCOUNT) intPaid    += amt;

      // Same broadened rule as the main finance engine — see the detailed
      // comment there. Ensures a guarantor's own arrears aren't understated
      // just because a repayment leg posted against 1020 instead of 1011.
      if (txDate && (touchesLoan || touchesInterest)) {
        if (!lastDate || txDate > lastDate) lastDate = txDate;
      }
    });

    const currentBalance = Math.max(0, disbursed - paid);
    const outstandingInterest = Math.max(0, intCharged - intPaid);
    let arrearsDays = 0;
    if (currentBalance > 0 && lastDate) {
      const days = Math.floor((Date.now() - lastDate) / 86400000);
      if (days > 30) arrearsDays = days - 30;
    }

    const guaranteedLoans = applications.filter(
      (a) => Array.isArray(a.guarantors) && a.guarantors.includes(guarantorMemberNo) &&
        !TERMINATED_STATUSES.includes(a.status) && !CLOSED_LOAN_STATUSES.includes(a.status)
    );
    const guaranteedExposure = guaranteedLoans.reduce((s, a) => s + Number(a.amount || 0), 0);

    const GUARANTEE_MULTIPLIER = 2; // policy: aggregate guarantees capped at 2x own savings
    const availableGuaranteeLimit = Math.max(0, savings * GUARANTEE_MULTIPLIER - guaranteedExposure);

    const score = gMember.credit_score || 75;
    const riskRating = score > 80 ? "Low Risk" : score >= 70 ? "Moderate Risk" : score >= 55 ? "Substandard Risk" : "High Risk";

    const eligible =
      currentBalance === 0 &&
      outstandingInterest === 0 &&
      arrearsDays === 0 &&
      availableGuaranteeLimit > 0 &&
      score >= 55 &&
      !gMember.aml_flag && !gMember.sanctions_flag;

    return {
      memberNo: guarantorMemberNo,
      name: gMember.name || "—",
      savings, currentBalance, outstandingInterest, arrearsDays,
      score, riskRating,
      guaranteedLoansCount: guaranteedLoans.length,
      guaranteedExposure,
      availableGuaranteeLimit,
      eligible,
    };
  }, [allMembers, applications]);

  useEffect(() => {
    let active = true;
    if (form.security_type !== "Guarantor" || !form.guarantor_1_no) {
      setGuarantor1Assessment(null);
    } else {
      setAssessingGuarantors(true);
      assessGuarantor(form.guarantor_1_no).then((res) => { if (active) { setGuarantor1Assessment(res); setAssessingGuarantors(false); } });
    }
    return () => { active = false; };
  }, [form.guarantor_1_no, form.security_type, assessGuarantor]);

  useEffect(() => {
    let active = true;
    if (form.security_type !== "Guarantor" || !form.guarantor_2_no) {
      setGuarantor2Assessment(null);
    } else {
      assessGuarantor(form.guarantor_2_no).then((res) => { if (active) setGuarantor2Assessment(res); });
    }
    return () => { active = false; };
  }, [form.guarantor_2_no, form.security_type, assessGuarantor]);

  // ── Member's loan application history (requirement #7: Loan History) ────
  const memberLoanHistory = useMemo(
    () => (memberNo ? applications.filter((a) => a.member_no === memberNo) : []),
    [applications, memberNo]
  );

  // ── Member's current live loan account, for the Loan Summary panel ──────
  const activeLoanRecord = useMemo(() => {
    if (!memberNo) return null;
    return applications.find((a) => a.member_no === memberNo && ACTIVE_LOAN_STATUSES.includes(a.status)) || null;
  }, [applications, memberNo]);

  // ═══════════════════════════════════════════════════════════════════════
  // CORE FINANCE ENGINE (ported from member self-service, extended)
  // ═══════════════════════════════════════════════════════════════════════
  const finance = useMemo(() => {
    let savings = 0, loanDisbursed = 0, loanPaid = 0;
    let interestCharged = 0, interestPaid = 0;
    let lastActivityDate = null;
    let lastRepaymentDate = null; // tracks ONLY credits to the loan account (actual repayments)

    ledger.forEach((t) => {
      const amt    = Number(t.amount || 0);
      const txDate = parseValidDate(t.transaction_date || t.created_at);
      const debit  = Number(t.debit_account_id);
      const credit = Number(t.credit_account_id);
      const touchesLoan     = debit === LOAN_ACCOUNT || credit === LOAN_ACCOUNT;
      const touchesInterest = debit === INTEREST_ACCOUNT || credit === INTEREST_ACCOUNT;

      // 1018 Savings
      if (credit === SAVINGS_ACCOUNT) savings += amt;
      if (debit  === SAVINGS_ACCOUNT) savings -= amt;

      // 1011 Loan Principal
      if (debit === LOAN_ACCOUNT)  loanDisbursed += amt;
      if (credit === LOAN_ACCOUNT) loanPaid      += amt;

      // 1020 Interest
      if (credit === INTEREST_ACCOUNT) interestCharged += amt;
      if (debit  === INTEREST_ACCOUNT) interestPaid    += amt;

      // ── Last loan activity / last repayment date ─────────────────────────
      // The real ledger doesn't always post repayments as a clean credit to
      // 1011 — several "Repayment" rows split the interest leg across 1020
      // and 1011 in the same voucher (e.g. debit 1020 / credit 1011, or vice
      // versa), and some interest settlements touch 1020 alone. So:
      //   • lastActivityDate  = latest date of ANY transaction that debits
      //     or credits either 1011 or 1020 — this is "loan account activity"
      //     broadly, used for arrears aging.
      //   • lastRepaymentDate = latest date of a transaction that credits
      //     1011 (a clean repayment) OR touches BOTH 1011 and 1020 in the
      //     same row (the split-leg repayment pattern actually seen in the
      //     data) — used for refinance eligibility ("last repayment within
      //     N days").
      if (txDate && (touchesLoan || touchesInterest)) {
        if (!lastActivityDate || txDate > lastActivityDate) lastActivityDate = txDate;
      }
      if (txDate && (credit === LOAN_ACCOUNT || (touchesLoan && touchesInterest))) {
        if (!lastRepaymentDate || txDate > lastRepaymentDate) lastRepaymentDate = txDate;
      }
    });

    const currentLoan         = Math.max(0, loanDisbursed - loanPaid);
    const outstandingInterest = Math.max(0, interestCharged - interestPaid);
    const totalOutstanding    = currentLoan + outstandingInterest;

    // 2. Safe Arrears & Repayment Age Calculation
    const now = Date.now();
    let daysInArrears = 0;
    let arrearsClass  = "Current";
    if (currentLoan > 0 && lastActivityDate) {
      const days = Math.max(0, Math.floor((now - lastActivityDate.getTime()) / 86400000) - 30);
      if (days > 0) {
        daysInArrears = days;
        if      (daysInArrears <= 30)  arrearsClass = "Watch";
        else if (daysInArrears <= 60)  arrearsClass = "Substandard";
        else if (daysInArrears <= 90)  arrearsClass = "Doubtful";
        else                           arrearsClass = "Loss";
      }
    }

    // Membership age
    const membershipMonths = member?.created_at
      ? Math.floor((Date.now() - new Date(member.created_at)) / (86400000 * 30.4375))
      : 0;

    // Credit score & multiplier
    const score = member?.credit_score || 75;
    let riskRating = "Moderate Standard Risk";
    let multiplier = 2.25;
    if      (score > 80) { riskRating = "Low Risk Profile";         multiplier = 3.0; }
    else if (score >= 70){ riskRating = "Moderate Standard Risk";   multiplier = 2.25; }
    else if (score >= 55){ riskRating = "Substandard Risk Factor";  multiplier = 1.80; }
    else                 { riskRating = "High Institutional Risk";  multiplier = 1.0; }

    const products = buildProducts(savings, multiplier);

    const p          = products[form.loan_type] || null;
    const reqAmount  = Number(form.amount   || 0);
    const reqMonths  = Number(form.duration || 1);
    const netIncome  = Number(form.net_income || 0);
    const txCharge   = calcTxCharge(reqAmount);
    const netDisbursable = Math.max(0, reqAmount - txCharge);

    const amort = p && reqAmount > 0 && reqMonths > 0
      ? buildSchedule(reqAmount, p.rate, reqMonths, p.insRate || 0)
      : { schedule: [], monthlyInstalment: 0, totalInterest: 0, totalInsurance: 0, totalRepayable: 0 };

    const totalInterest      = amort.totalInterest;
    const insuranceFee       = amort.totalInsurance;
    const totalRepayable     = amort.totalRepayable;
    const monthlyInstallment = amort.monthlyInstalment;
    const dsrCeiling         = netIncome / 3;
    const isDsrValid         = netIncome > 0 ? monthlyInstallment <= dsrCeiling : true;

    // ── Refinance gate (enterprise-grade) ──────────────────────────────────
    const hasExistingLoan = currentLoan > 0;
    const outstandingPercent = loanDisbursed > 0 ? (currentLoan / loanDisbursed) * 100 : 0;
    const repaidPercent      = loanDisbursed > 0 ? (loanPaid / loanDisbursed) * 100 : 0;
    const daysSinceLastRepayment = lastRepaymentDate
      ? Math.floor((now - lastRepaymentDate.getTime()) / 86400000)
      : null;

    const isOutstandingWithinLimit = outstandingPercent <= REFINANCE_MAX_OUTSTANDING_PCT;
    const isArrearsClear           = daysInArrears === 0;
    const isInterestClear          = outstandingInterest === 0;
    const isPenaltyClear           = true;  // no penalty ledger yet — see Loan Penalty module note below
    const isInsuranceSettled       = true;  // no insurance ledger yet — see Loan Insurance module note below
    const isCreditScoreSufficient  = score >= REFINANCE_MIN_CREDIT_SCORE;
    // Treat null (no prior repayment history needed for a first loan) as valid,
    // or enforce it only if they actually have an existing loan balance.
    const hasRecentRepayment = hasExistingLoan
      ? (daysSinceLastRepayment !== null && daysSinceLastRepayment <= REFINANCE_MAX_DAYS_SINCE_REPAYMENT)
      : true;
    const requiresManagerApproval  = currentLoan >= REFINANCE_MANAGER_APPROVAL_THRESHOLD;

    const canRefinance =
      hasExistingLoan &&
      isOutstandingWithinLimit &&
      isArrearsClear &&
      isInterestClear &&
      isPenaltyClear &&
      isInsuranceSettled &&
      hasRecentRepayment &&
      isCreditScoreSufficient;

    const refinanceBlocked = hasExistingLoan && !canRefinance;

    let refinanceBlockReason = "";
    if (refinanceBlocked) {
      const reasons = [];
      if (!isOutstandingWithinLimit)
        reasons.push(`outstanding principal is ${outstandingPercent.toFixed(1)}% of original (must be ≤ ${REFINANCE_MAX_OUTSTANDING_PCT}%)`);
      if (!isArrearsClear)
        reasons.push(`account is in ${arrearsClass} arrears (${daysInArrears} days overdue)`);
      if (!isInterestClear)
        reasons.push(`unpaid interest of KES ${outstandingInterest.toLocaleString()}`);
      if (!isCreditScoreSufficient)
        reasons.push(`credit score ${score} is below the refinance minimum of ${REFINANCE_MIN_CREDIT_SCORE}`);
      if (!hasRecentRepayment)
        reasons.push(
          daysSinceLastRepayment === null
            ? "no repayment has been made on this loan yet"
            : `last repayment was ${daysSinceLastRepayment} days ago (must be within ${REFINANCE_MAX_DAYS_SINCE_REPAYMENT} days)`
        );
      refinanceBlockReason = reasons.join("; ");
    }

    // Compliance verdict (SASRA business rules — unchanged)
    let isEligible = false;
    let complianceRemark = "Select a member and fill in all fields to see the eligibility verdict.";

    if (!memberNo) {
      complianceRemark = "Select a member to begin.";
    } else if (p) {
      if (refinanceBlocked)
        complianceRemark = `REJECTED: Existing loan — refinance blocked (${refinanceBlockReason}).`;
      else if (daysInArrears > 0)
        complianceRemark = `REJECTED: Account in ${arrearsClass} arrears (${daysInArrears} days overdue). Regularize before applying.`;
      else if (outstandingInterest > 0)
        complianceRemark = `REJECTED: Unsettled interest of KES ${outstandingInterest.toLocaleString()} must be cleared first.`;
      else if (membershipMonths < p.minMonths)
        complianceRemark = `REJECTED: Minimum membership of ${p.minMonths} months required. Member has ${membershipMonths} months.`;
      else if (reqAmount <= 0 || reqAmount > p.maxAmount)
        complianceRemark = `REJECTED: Amount must be between KES 1 and KES ${Math.round(p.maxAmount).toLocaleString()}.`;
      else if (reqMonths <= 0 || reqMonths > p.maxDuration)
        complianceRemark = `REJECTED: Duration must be 1–${p.maxDuration} months for this product.`;
      else if (!isDsrValid)
        complianceRemark = `REJECTED: Monthly instalment KES ${Math.round(monthlyInstallment).toLocaleString()} exceeds 1/3 pay ceiling (KES ${Math.round(dsrCeiling).toLocaleString()}).`;
      else if (p.reqSecurity && !form.security_type)
        complianceRemark = "REJECTED: Collateral/security type is mandatory for this product.";
      else {
        isEligible = true;
        complianceRemark = canRefinance
          ? `APPROVED (REFINANCE${requiresManagerApproval ? " — MANAGER SIGN-OFF REQUIRED" : ""}): ${repaidPercent.toFixed(1)}% of existing loan repaid, last repayment ${daysSinceLastRepayment}d ago. All parameters cleared.`
          : "APPROVED: All SASRA compliance parameters cleared. Ready for submission.";
      }
    } else if (memberNo) {
      complianceRemark = "Select a loan product to begin compliance check.";
    }

    return {
      savings, loanDisbursed, loanPaid, currentLoan,
      outstandingInterest, totalOutstanding, interestCharged, interestPaid,
      daysInArrears, arrearsClass, membershipMonths,
      score, riskRating, multiplier,
      products,
      currentProduct: p,
      txCharge, totalInterest, insuranceFee, totalRepayable,
      monthlyInstallment, dsrCeiling, netDisbursable,
      isDsrValid, isEligible, complianceRemark,
      hasExistingLoan, canRefinance, refinanceBlocked, refinanceBlockReason, requiresManagerApproval,
      outstandingPercent, repaidPercent, daysSinceLastRepayment,
      lastActivityDate, lastRepaymentDate,
      schedule: amort.schedule,
    };
  }, [ledger, form, member, memberNo]);

  // ═══════════════════════════════════════════════════════════════════════
  // ELIGIBILITY ENGINE (requirement #8) — granular pass/fail checklist
  // ═══════════════════════════════════════════════════════════════════════
  const eligibilityChecks = useMemo(() => {
    const checks = [];

    checks.push({ key: "membership", label: "Membership", passed: !!member,
      detail: member ? `Active member — ${finance.membershipMonths} months on record` : "No member selected" });

    checks.push({ key: "savings", label: "Savings", passed: finance.savings > 0,
      detail: `KES ${finance.savings.toLocaleString()}` });

    checks.push({ key: "credit_score", label: "Credit Score", passed: finance.score >= 55,
      detail: `${finance.score}/100 (${finance.riskRating})` });

    checks.push({ key: "income", label: "Income", passed: Number(form.net_income || 0) > 0,
      detail: form.net_income ? `KES ${Number(form.net_income).toLocaleString()}/mo` : "Not provided" });

    checks.push({ key: "dsr", label: "DSR", passed: finance.isDsrValid,
      detail: `Instalment KES ${Math.round(finance.monthlyInstallment).toLocaleString()} vs 1/3 ceiling KES ${Math.round(finance.dsrCeiling).toLocaleString()}` });

    const needsGuarantor = form.security_type === "Guarantor";
    checks.push({ key: "guarantor", label: "Guarantor", passed: !needsGuarantor || !!guarantor1Assessment?.eligible,
      detail: !needsGuarantor ? "Not required for this security type"
        : !form.guarantor_1_no ? "Awaiting guarantor selection"
        : assessingGuarantors ? "Assessing…"
        : guarantor1Assessment?.eligible ? "Guarantor cleared" : "Guarantor does not meet policy" });

    const needsSecurity = !!finance.currentProduct?.reqSecurity;
    checks.push({ key: "security", label: "Security", passed: !needsSecurity || !!form.security_type,
      detail: !needsSecurity ? "Not required for this product" : (form.security_type || "Required — not yet provided") });

    checks.push({ key: "existing_loan", label: "Existing Loan", passed: finance.daysInArrears === 0 && finance.outstandingInterest === 0,
      detail: finance.hasExistingLoan ? `Balance KES ${finance.currentLoan.toLocaleString()} · ${finance.arrearsClass}` : "No existing loan" });

    checks.push({ key: "refinance", label: "Refinance", passed: !finance.refinanceBlocked,
      detail: !finance.hasExistingLoan ? "N/A — no existing loan" : (finance.canRefinance ? "Eligible" : finance.refinanceBlockReason) });

    const requiredDocs = DOCUMENT_CHECKLIST_ITEMS.filter((d) => !d.conditional || d.conditional(form));
    const completedDocs = requiredDocs.filter((d) => docChecklist[d.key]);
    checks.push({ key: "documents", label: "Documents", passed: requiredDocs.length === 0 || completedDocs.length === requiredDocs.length,
      detail: `${completedDocs.length}/${requiredDocs.length} confirmed` });

    const kyc = (member?.kyc_status || "").toLowerCase();
    checks.push({ key: "kyc", label: "KYC", passed: !member || kyc === "verified" || kyc === "approved",
      detail: member?.kyc_status || "Unknown" });

    checks.push({ key: "aml", label: "AML", passed: !member?.aml_flag,
      detail: member?.aml_flag ? "Flagged — escalate to compliance" : "No adverse AML flag on file" });

    checks.push({ key: "sanctions", label: "Sanctions", passed: !member?.sanctions_flag,
      detail: member?.sanctions_flag ? "Sanctions match — escalate immediately" : "No sanctions match on file" });

    return checks;
  }, [member, finance, form, guarantor1Assessment, assessingGuarantors, docChecklist]);

  const allChecksPassed = memberNo && finance.currentProduct
    ? eligibilityChecks.every((c) => c.passed)
    : false;

  // ═══════════════════════════════════════════════════════════════════════
  // CREDIT ASSESSMENT (requirement #7) — AI recommendation heuristic
  // ═══════════════════════════════════════════════════════════════════════
  const collateralCoverageRatio = useMemo(() => {
    const forcedSaleValue = Number(form.security_forced_sale_value || form.security_value || 0);
    const requested = Number(form.amount || 0);
    if (requested <= 0 || !COLLATERAL_REQUIRES_VALUATION.includes(form.security_type)) return null;
    return forcedSaleValue / requested;
  }, [form.security_forced_sale_value, form.security_value, form.amount, form.security_type]);

  const collateralStrengthLabel = useMemo(() => {
    if (collateralCoverageRatio === null) return "N/A";
    if (collateralCoverageRatio >= 1.5) return "Strong";
    if (collateralCoverageRatio >= 1)   return "Adequate";
    if (collateralCoverageRatio > 0)    return "Weak";
    return "None";
  }, [collateralCoverageRatio]);

  const guarantorStrengthLabel = useMemo(() => {
    if (form.security_type !== "Guarantor") return "N/A";
    if (!guarantor1Assessment) return "Pending assessment";
    return guarantor1Assessment.eligible ? "Strong" : "Insufficient";
  }, [form.security_type, guarantor1Assessment]);

  const aiRecommendation = useMemo(() => {
    if (!memberNo || !finance.currentProduct) return "Select a member and product to generate a recommendation.";
    if (!allChecksPassed) return "DECLINE — one or more mandatory checks have not been satisfied. Resolve the flagged items before resubmitting.";
    if (finance.score >= 80 && finance.isDsrValid) return "APPROVE — strong credit profile, low risk, DSR within policy. Recommend fast-track approval.";
    if (finance.score >= 70) return "APPROVE WITH CONDITIONS — acceptable risk profile; recommend standard post-disbursement monitoring.";
    return "REFER TO CREDIT COMMITTEE — borderline risk profile; manual review recommended before approval.";
  }, [memberNo, finance, allChecksPassed]);

  const requiredApprovalLevel = useMemo(() => getApprovalLevel(form.amount), [form.amount]);

  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD METRICS (requirement #14)
  // ═══════════════════════════════════════════════════════════════════════
  const dashboard = useMemo(() => {
    const isToday = (d) => {
      if (!d) return false;
      const dt = new Date(d);
      const now = new Date();
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();
    };

    const applicationsToday = applications.filter((a) => isToday(a.created_at)).length;
    const pendingCount   = applications.filter((a) => MANUAL_ADVANCE_STATUSES.includes(a.status) || a.status === "pending").length;
    const approvedCount  = applications.filter((a) => a.status === "approved").length;
    const rejectedCount  = applications.filter((a) => a.status === "rejected").length;
    const disbursedCount = applications.filter((a) => ["disbursed", "active"].includes(a.status)).length;

    const activeLoans = applications.filter((a) => ACTIVE_LOAN_STATUSES.includes(a.status));
    const portfolioValue      = activeLoans.reduce((s, a) => s + Number(a.amount || 0), 0);
    const outstandingPrincipal = portfolioValue; // approximation — see note below
    const expectedInterest    = activeLoans.reduce((s, a) => s + Number(a.total_interest || 0), 0);

    const allAmounts = applications.map((a) => Number(a.amount || 0)).filter((n) => n > 0);
    const averageLoan = allAmounts.length ? allAmounts.reduce((s, n) => s + n, 0) / allAmounts.length : 0;

    const processed = applications.filter((a) => a.approved_at && a.created_at);
    const averageProcessingDays = processed.length
      ? processed.reduce((s, a) => s + (new Date(a.approved_at) - new Date(a.created_at)) / 86400000, 0) / processed.length
      : null;

    return {
      applicationsToday, pendingCount, approvedCount, rejectedCount, disbursedCount,
      portfolioValue, outstandingPrincipal, expectedInterest, averageLoan, averageProcessingDays,
      // PAR30/60/90 require a per-loan repayment schedule keyed by loan_id, which is
      // exactly the future "Loan Repayment" module this file is now architected for.
      // Reporting these as N/A rather than fabricating a number.
      par30: null, par60: null, par90: null,
    };
  }, [applications]);

  // ── PDF: Official Loan Agreement (filled in by admin on member's behalf) ──
  const downloadOfficialLoanForm = () => {
    try {
      const doc   = new jsPDF();
      const GREEN = [21, 128, 61];
      const DARK  = [30, 41, 59];
      const GRAY  = [100, 116, 139];
      const LGRAY = [248, 250, 252];
      const W     = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
      const refNo = `LOAN-${memberNo}-${Date.now().toString().slice(-6)}`;
      const appId = generateApplicationId(applications.map((a) => a.application_id));

      // ── Header ──────────────────────────────────────────────────────────
      doc.addImage(logo, "PNG", 14, 10, 26, 26);
      doc.setFillColor(...GREEN);
      doc.rect(42, 10, W - 56, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("UMOVA INVESTMENTS LTD — SACCO CREDIT AGREEMENT", 45, 18.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text("P.O. Box 00100, Nairobi  |  info@umovainvestments.co.ke  |  www.umovainvestments.co.ke", 42, 28);
      doc.text(`Date: ${today}   |   Ref: ${refNo}   |   Application ID: ${appId}   |   Channel: Assisted (Admin)`, 42, 33);
      doc.setDrawColor(...GREEN);
      doc.setLineWidth(0.5);
      doc.line(14, 37, W - 14, 37);

      let y = 43;

      const sectionHeader = (title) => {
        doc.setFillColor(240, 253, 244);
        doc.rect(14, y - 1, W - 28, 7, "F");
        doc.setDrawColor(...GREEN);
        doc.setLineWidth(0.3);
        doc.rect(14, y - 1, W - 28, 7, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...GREEN);
        doc.text(title, 17, y + 4);
        y += 10;
      };

      const tbl = (body, colStyles) => {
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14 },
          body,
          theme: "plain",
          styles: { fontSize: 8.5, cellPadding: 2.8, textColor: DARK },
          alternateRowStyles: { fillColor: LGRAY },
          columnStyles: colStyles || {
            0: { fontStyle: "bold", cellWidth: 72 },
            1: { cellWidth: 50 },
            2: { fontStyle: "bold", cellWidth: 38 },
            3: {},
          },
        });
        y = doc.lastAutoTable.finalY + 6;
      };

      // ── Section 1: Member Profile ────────────────────────────────────────
      sectionHeader("SECTION 1 — MEMBER PROFILE");
      tbl([
        ["Full Legal Name:",   member?.name        || "—", "Member No:",      memberNo || "—"],
        ["National ID / PP:",  member?.id_no        || member?.national_id || member?.id_number || "—",
                                                         "Phone Number:",   member?.phone || member?.phone_number || member?.phone_no || "—"],
        ["Email Address:",     member?.email        || "—", "KYC Status:",    (member?.kyc_status || "—").toUpperCase()],
        ["Date of Joining:",   member?.created_at ? new Date(member.created_at).toLocaleDateString("en-GB") : "—",
                                                         "Credit Score:",   `${finance.score} / 100`],
      ]);

      // ── Section 2: Account Standing ──────────────────────────────────────
      sectionHeader("SECTION 2 — CURRENT ACCOUNT STANDING");
      tbl([
        ["Savings Balance (A/C 1018):",       `KES ${finance.savings.toLocaleString()}`,
         "Loan Principal (A/C 1011):",         `KES ${finance.currentLoan.toLocaleString()}`],
        ["Interest Outstanding (A/C 1020):",  `KES ${finance.outstandingInterest.toLocaleString()}`,
         "Total Amount Owed:",                 `KES ${finance.totalOutstanding.toLocaleString()}`],
        ["Risk Classification:",              finance.riskRating,
         "Multiplier Factor:",                `${finance.multiplier}x`],
        ["Days in Arrears:",                  `${finance.daysInArrears} Days (${finance.arrearsClass})`,
         "Max Eligible Cap:",                 `KES ${Math.round(Math.max(0, finance.savings * finance.multiplier - finance.currentLoan)).toLocaleString()}`],
        ["Membership Age:",                   `${finance.membershipMonths} Months`,
         "Refinance Status:",                  finance.hasExistingLoan
           ? (finance.canRefinance
               ? `ELIGIBLE — ${finance.repaidPercent.toFixed(1)}% repaid, last payment ${finance.daysSinceLastRepayment}d ago`
               : `BLOCKED — ${finance.refinanceBlockReason}`)
           : "N/A — No existing loan"],
      ]);

      // ── Section 3: Loan Application Details ─────────────────────────────
      sectionHeader("SECTION 3 — LOAN APPLICATION DETAILS");
      const hasApp = !!form.loan_type && Number(form.amount) > 0;
      if (hasApp) {
        tbl([
          ["Product Type:",           form.loan_type,
           "Principal Requested:",    `KES ${Number(form.amount).toLocaleString()}`],
          ["Repayment Period:",        `${form.duration} Month(s)`,
           "Interest Rate (Flat):",   `${finance.currentProduct?.rate || 0}%`],
          ["Net Monthly Income:",     `KES ${Number(form.net_income || 0).toLocaleString()}`,
           "1/3 DSR Ceiling:",        `KES ${Math.round(finance.dsrCeiling).toLocaleString()}/mo`],
          ["Security Type:",          form.security_type || "—",
           "Collateral Value:",       form.security_type === "Deposits"
             ? "Internal Savings" : `KES ${Number(form.security_value || 0).toLocaleString()}`],
          ["Approval Level Required:", requiredApprovalLevel,
           "AI Recommendation:",      aiRecommendation.split(" — ")[0]],
          ["Loan Purpose:",           form.purpose || "—", "", ""],
        ]);

        // Charges breakdown table
        autoTable(doc, {
          startY: y,
          margin: { left: 14, right: 14 },
          head: [["Charge Item", "Amount (KES)"]],
          body: [
            ["Principal Amount",                  `KES ${Number(form.amount).toLocaleString()}`],
            [`Interest — Reducing Balance (${finance.currentProduct?.rate}% p.m.)`, `KES ${Math.round(finance.totalInterest).toLocaleString()}`],
            [`Insurance/Admin Fee (${finance.currentProduct?.insRate || 0}%)`, `KES ${finance.insuranceFee.toLocaleString()}`],
            ["Transaction Processing Charge",     `KES ${finance.txCharge.toLocaleString()}`],
            ["NET Amount Disbursed to Member",    `KES ${finance.netDisbursable.toLocaleString()}`],
            ["TOTAL Amount Repayable",            `KES ${finance.totalRepayable.toLocaleString()}`],
            ["Monthly Instalment",                `KES ${Math.round(finance.monthlyInstallment).toLocaleString()}/mo`],
          ],
          headStyles: { fillColor: GREEN, textColor: 255, fontSize: 8, fontStyle: "bold" },
          styles: { fontSize: 8.5, cellPadding: 3, textColor: DARK },
          alternateRowStyles: { fillColor: LGRAY },
          columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" } },
          didParseCell: (data) => {
            const bold = ["NET Amount Disbursed to Member", "TOTAL Amount Repayable", "Monthly Instalment"];
            if (data.column.index === 0 && bold.includes(data.cell.raw)) {
              data.cell.styles.fillColor = [220, 252, 231];
            }
            if (data.column.index === 1 && bold.includes(data.row.cells[0]?.raw)) {
              data.cell.styles.fillColor = [220, 252, 231];
              data.cell.styles.textColor = GREEN;
            }
          },
        });
        y = doc.lastAutoTable.finalY + 6;

        // ── Section 4: Repayment Schedule (Reducing Balance) ─────────────
        if (finance.isEligible && finance.schedule.length > 0) {
          if (y > 220) { doc.addPage(); y = 20; }
          sectionHeader("SECTION 4 — INDICATIVE REPAYMENT SCHEDULE (REDUCING BALANCE)");
          const sched   = finance.schedule;
          const display = sched.slice(0, 24);
          const rows    = display.map((r) => [
            `Month ${r.month}`,
            `KES ${r.principal.toLocaleString()}`,
            `KES ${r.interest.toLocaleString()}`,
            `KES ${r.insurance.toLocaleString()}`,
            `KES ${r.total.toLocaleString()}`,
            `KES ${r.balance.toLocaleString()}`,
          ]);
          if (sched.length > 24)
            rows.push(["...", "...", "...", "...", "...", `(${sched.length - 24} more months)`]);
          const totalPrin = sched.reduce((s, r) => s + r.principal, 0);
          const totalInt  = sched.reduce((s, r) => s + r.interest,  0);
          const totalIns  = sched.reduce((s, r) => s + r.insurance, 0);
          const totalPay  = sched.reduce((s, r) => s + r.total,     0);
          autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [["Period", "Principal", "Interest", "Insurance", "Instalment", "Balance"]],
            body: rows,
            foot: [["TOTAL",
              `KES ${Math.round(totalPrin).toLocaleString()}`,
              `KES ${Math.round(totalInt).toLocaleString()}`,
              `KES ${Math.round(totalIns).toLocaleString()}`,
              `KES ${Math.round(totalPay).toLocaleString()}`,
              "KES 0"]],
            headStyles: { fillColor: GREEN, textColor: 255, fontSize: 7.5, fontStyle: "bold" },
            footStyles: { fillColor: DARK,  textColor: 255, fontSize: 7.5, fontStyle: "bold" },
            styles: { fontSize: 7.5, cellPadding: 2, textColor: DARK, halign: "right" },
            alternateRowStyles: { fillColor: LGRAY },
            columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
          });
          y = doc.lastAutoTable.finalY + 6;
        }
      } else {
        doc.setFontSize(8.5);
        doc.setTextColor(...GRAY);
        doc.text("No loan parameters entered — fill the application form, then click Download to generate full details.", 14, y);
        y += 8;
      }

      // ── Section 5: Charge Schedule ───────────────────────────────────────
      if (y > 220) { doc.addPage(); y = 20; }
      sectionHeader("SECTION 5 — TRANSACTION PROCESSING CHARGE SCHEDULE");
      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [["Tier", "Amount Band (KES)", "Processing Fee (KES)"]],
        body: [
          ["Tier 1", "KES 1 – 500",         "KES 10"],
          ["Tier 2", "KES 501 – 1,000",     "KES 15"],
          ["Tier 3", "KES 1,001 – 5,000",   "KES 25"],
          ["Tier 4", "KES 5,001 – 10,000",  "KES 35"],
          ["Tier 5", "Above KES 10,000",    "KES 100"],
        ],
        headStyles: { fillColor: GREEN, textColor: 255, fontSize: 8, fontStyle: "bold" },
        styles: { fontSize: 8.5, cellPadding: 3, textColor: DARK, halign: "center" },
        alternateRowStyles: { fillColor: LGRAY },
        columnStyles: { 2: { fontStyle: "bold" } },
      });
      y = doc.lastAutoTable.finalY + 8;

      // ── Section 6: Declaration & Signatures ──────────────────────────────
      if (y > 210) { doc.addPage(); y = 20; }
      sectionHeader("SECTION 6 — MEMBER DECLARATION & OATH");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.2);
      doc.setTextColor(...DARK);
      const oathLines = [
        "I, the undersigned member, hereby solemnly declare and agree as follows:",
        "(a) All information provided in this application is true, accurate and complete to the best of my knowledge.",
        "(b) I have read and agree to be bound by the Umova Investments SACCO By-Laws and the specific loan product terms stated herein.",
        "(c) I authorize Umova Investments Ltd to deduct monthly loan installments from my salary, savings (A/C 1018), or any other account held with the SACCO.",
        "(d) I understand that failure to repay as scheduled may result in recovery from my deposits, designated guarantors, or legal action under Kenyan law.",
        "(e) I confirm the stated loan purpose is accurate and funds will not be used for unlawful or purely speculative activities.",
        "(f) Transaction processing charges are non-refundable and will be deducted at the point of disbursement.",
        "(g) This application was completed with the assistance of an Umova Investments staff member on behalf of the applicant, who has reviewed and verbally confirmed the details herein.",
        "(h) I acknowledge this document constitutes a legally binding credit agreement upon signing by all parties below.",
      ];
      oathLines.forEach((line) => {
        const split = doc.splitTextToSize(line, W - 28);
        doc.text(split, 14, y);
        y += split.length * 4.8;
      });

      y += 6;
      if (y > 240) { doc.addPage(); y = 20; }

      // Signature boxes
      const boxes = [
        { label: "Applicant Signature & Date",        sub: `Name: ${member?.name || "____________________"}`, x: 14 },
        { label: "Guarantor 1 Signature & Date",      sub: `ID: ${form.guarantor_1_no || "____________________"}`,    x: 80 },
        { label: "Credit Officer Signature & Stamp",  sub: "Umova Investments Ltd",                           x: 146 },
      ];
      boxes.forEach(({ label, sub, x }) => {
        doc.setDrawColor(...GRAY);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, y, 58, 22, 2, 2);
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        doc.text(label, x + 2, y + 8);
        doc.setDrawColor(...GRAY);
        doc.setLineWidth(0.2);
        doc.line(x + 2, y + 15, x + 55, y + 15);
        doc.setFontSize(6.5);
        doc.text(sub, x + 2, y + 20);
      });

      y += 28;
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text(
        "Umova Investments SACCO Ltd is licensed and regulated by SASRA. This is a computer-generated document and is legally binding upon execution.",
        14, y, { maxWidth: W - 28 }
      );

      // ── Footer on every page ─────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const pH = doc.internal.pageSize.getHeight();
        doc.setDrawColor(...GREEN);
        doc.setLineWidth(0.3);
        doc.line(14, pH - 12, W - 14, pH - 12);
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        doc.text(
          `Umova Investments Ltd  |  Ref: ${refNo}  |  Confidential — Member Use Only  |  Page ${p} of ${totalPages}`,
          W / 2, pH - 6, { align: "center" }
        );
      }

      doc.save(`Umova_Loan_Agreement_${memberNo}_${Date.now().toString().slice(-6)}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("PDF generation failed: " + err.message);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SUBMIT LOAN APPLICATION (on behalf of member)
  // Insert strategy: the ORIGINAL required columns are inserted first,
  // exactly as before, so submission can never fail due to a missing new
  // column. Enterprise columns (application_id, doc checklist, collateral
  // detail, etc.) are attempted afterwards in a separate, non-blocking
  // update — if your loan_application table doesn't have them yet, submit
  // still succeeds and a console warning tells you which migration to run.
  // ═══════════════════════════════════════════════════════════════════════
  const executeLoanApplication = async () => {
    try {
      if (!memberNo) return alert("Select a member first.");
      if (!finance.currentProduct) return alert("Select a loan product first.");
      if (!finance.isEligible)     return alert(`Cannot submit: ${finance.complianceRemark}`);
      if (!allChecksPassed) {
        const failed = eligibilityChecks.filter((c) => !c.passed).map((c) => c.label).join(", ");
        return alert(`Cannot submit — outstanding checks: ${failed}`);
      }

      setSubmitting(true);

      // Guarantor validation (existing rule, preserved)
      if (form.security_type === "Guarantor") {
        if (!form.guarantor_1_no) throw new Error("Primary guarantor is required.");
        if (guarantor1Assessment && !guarantor1Assessment.eligible) {
          throw new Error(`Guarantor ${form.guarantor_1_no} does not meet guarantor policy and cannot stand as guarantor.`);
        }
      }

      // File uploads (existing, preserved)
      const docUrls = [];
      for (const f of files) {
        const path = `${memberNo}/${Date.now()}-${f.name}`;
        await supabase.storage.from("loan_documents").upload(path, f);
        const { data: u } = supabase.storage.from("loan_documents").getPublicUrl(path);
        docUrls.push(u.publicUrl);
      }

      // ── Base insert (guaranteed to match the original working schema) ───
      const baseRecord = {
        member_no:           memberNo,
        name:                member?.name || "",
        loan_type:           form.loan_type,
        amount:              Number(form.amount),
        duration:            Number(form.duration),
        net_income:          Number(form.net_income),
        purpose:             form.purpose,
        security_type:       form.security_type,
        security_value:      Number(form.security_value || 0),
        guarantors:          [form.guarantor_1_no, form.guarantor_2_no].filter(Boolean),
        total_interest:      finance.totalInterest,
        insurance_fee:       finance.insuranceFee,
        total_repayable:     finance.totalRepayable,
        monthly_installment: finance.monthlyInstallment,
        risk_score:          finance.score,
        risk_level:          finance.riskRating,
        documents:           docUrls,
        status:              "pending",
        arrears_days:        0,
        channel:             "assisted",
      };

      const { data: inserted, error } = await supabase
        .from("loan_application").insert([baseRecord]).select();
      if (error) throw error;

      const insertedRow = inserted?.[0];

      // ── Enterprise extension (non-blocking) ──────────────────────────────
      if (insertedRow?.id) {
        const applicationId = generateApplicationId(applications.map((a) => a.application_id));
        try {
          await supabase.from("loan_application").update({
            application_id:              applicationId,
            loan_id:                     null, // assigned on approval — Loan Application vs Loan Account
            workflow_status:             "pending",
            approval_level_required:     requiredApprovalLevel,
            doc_checklist:               docChecklist,
            security_market_value:       Number(form.security_market_value || form.security_value || 0),
            security_forced_sale_value:  Number(form.security_forced_sale_value || 0),
            security_insured:            !!form.security_insured,
            security_valuation_date:     form.security_valuation_date || null,
            security_expiry_date:        form.security_expiry_date || null,
            guarantor_assessment:        guarantor1Assessment,
            ai_recommendation:           aiRecommendation,
            eligibility_checks:          eligibilityChecks,
          }).eq("id", insertedRow.id);
        } catch (extErr) {
          console.warn("Enterprise fields not saved — run the suggested schema migration. Base application was saved successfully.", extErr.message);
        }
      }

      await logAuditTrail({ action: "loan_application_submitted", after: baseRecord });
      await notifyAllChannels("member", memberNo, "loan_application_submitted", { amount: form.amount, loan_type: form.loan_type });
      await notifyAllChannels("credit_officer", memberNo, "new_loan_application", { amount: form.amount, member_no: memberNo });

      alert("Loan application submitted successfully on behalf of the member.");
      setFiles([]);
      setDocChecklist({});
      setForm({
        loan_type: "", amount: "", duration: "", net_income: "", purpose: "",
        security_type: "", security_value: "", guarantor_1_no: "", guarantor_2_no: "",
        security_market_value: "", security_forced_sale_value: "",
        security_insured: false, security_valuation_date: "", security_expiry_date: "",
      });

      await loadApplications();
    } catch (err) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // APPROVE / REJECT — preserved one-click actions from "pending", now also
  // mint the Loan ID (Application → Loan Account conversion, requirement #4)
  // and record audit + notifications. Additional workflow-stage advancing
  // is available via advanceLoanStatus for statuses beyond pending/approved.
  // ═══════════════════════════════════════════════════════════════════════
  const approveLoan = async (loan) => {
    try {
      const { data, error } = await supabase
        .from("loan_application")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", loan.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Update failed");

      const approvalLevel = getApprovalLevel(loan.amount);
      const loanId = generateLoanId(applications.map((a) => a.loan_id));

      try {
        await supabase.from("loan_application").update({
          workflow_status:  "approved",
          loan_id:          loanId,
          approval_level:   approvalLevel,
        }).eq("id", loan.id);
      } catch (extErr) {
        console.warn("Loan ID / approval level not saved — run the suggested schema migration.", extErr.message);
      }

      await logAuditTrail({ action: "loan_approved", before: { status: loan.status }, after: { status: "approved", loan_id: loanId }, approvalLevel });
      await notifyAllChannels("member", loan.member_no, "loan_approved", { loan_id: loanId, amount: loan.amount });
      await notifyAllChannels("credit_officer", loan.member_no, "loan_approved", { loan_id: loanId });

      alert(`Loan approved successfully${loanId ? ` — Loan ID ${loanId}` : ""}`);
      await loadApplications();
    } catch (err) {
      alert(err.message);
    }
  };

  const submitReject = async (loan) => {
    try {
      const { data, error } = await supabase
        .from("loan_application")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectReason || null,
        })
        .eq("id", loan.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Update failed");

      try {
        await supabase.from("loan_application").update({ workflow_status: "rejected" }).eq("id", loan.id);
      } catch (extErr) {
        console.warn("workflow_status not saved — run the suggested schema migration.", extErr.message);
      }

      await logAuditTrail({ action: "loan_rejected", before: { status: loan.status }, after: { status: "rejected", reason: rejectReason } });
      await notifyAllChannels("member", loan.member_no, "loan_rejected", { reason: rejectReason });

      setRejectingId(null);
      setRejectReason("");
      await loadApplications();
    } catch (err) {
      alert(err.message);
    }
  };

  // Advance a loan through the intermediate workflow stages (draft → … →
  // pending_approval) without going through the legacy Approve/Reject
  // shortcut buttons. Purely additive — writes to workflow_status so it
  // never conflicts with the original `status` column consumed elsewhere.
  const advanceLoanStatus = async (loan, newStatusKey) => {
    try {
      setAdvancingId(loan.id);
      try {
        await supabase.from("loan_application").update({ workflow_status: newStatusKey }).eq("id", loan.id);
      } catch (extErr) {
        console.warn("workflow_status column missing — run the suggested schema migration to enable full-workflow tracking.", extErr.message);
        alert("Your database does not yet have a workflow_status column — see the console for the migration needed to enable this.");
        return;
      }
      await logAuditTrail({ action: "workflow_status_advanced", before: { workflow_status: loan.workflow_status }, after: { workflow_status: newStatusKey } });
      await loadApplications();
    } finally {
      setAdvancingId(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  const prod = finance.currentProduct;
  const reqAmt = Number(form.amount || 0);
  const pending = applications.filter((a) =>
    a.status === "pending" || MANUAL_ADVANCE_STATUSES.includes(a.workflow_status || a.status)
  );

  return (
    <div className="loanAdminPage">

      {/* HEADER */}
      <div className="header">
        <span className="eyebrow">Assisted Application · Ledger 1011 / 1020 / 1018</span>
        <h1>Loan Application — Admin</h1>
        <p>Apply on behalf of a member with no device, then review pending loans.</p>
      </div>

      {/* ================= DASHBOARD (requirement #14) ================= */}
      <div style={S.card}>
        <div style={S.cardTitle}>Loan Origination Dashboard</div>
        <div style={S.dashboardGrid}>
          <div style={S.dashTile}><div style={S.dashLabel}>Applications Today</div><div style={S.dashValue}>{dashboard.applicationsToday}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Pending</div><div style={S.dashValue}>{dashboard.pendingCount}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Approved</div><div style={S.dashValue}>{dashboard.approvedCount}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Rejected</div><div style={S.dashValue}>{dashboard.rejectedCount}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Disbursed</div><div style={S.dashValue}>{dashboard.disbursedCount}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Portfolio Value</div><div style={S.dashValue}>KES {Math.round(dashboard.portfolioValue).toLocaleString()}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Outstanding Principal</div><div style={S.dashValue}>KES {Math.round(dashboard.outstandingPrincipal).toLocaleString()}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Expected Interest</div><div style={S.dashValue}>KES {Math.round(dashboard.expectedInterest).toLocaleString()}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>PAR30 / 60 / 90</div><div style={{ ...S.dashValue, fontSize: 12, color: "#94a3b8" }}>Pending Repayment Module</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Average Loan</div><div style={S.dashValue}>KES {Math.round(dashboard.averageLoan).toLocaleString()}</div></div>
          <div style={S.dashTile}><div style={S.dashLabel}>Avg. Processing Time</div><div style={S.dashValue}>{dashboard.averageProcessingDays !== null ? `${dashboard.averageProcessingDays.toFixed(1)}d` : "—"}</div></div>
        </div>
      </div>

      <div className="layout">

        {/* ================= APPLICATION FORM ================= */}
        <div className="panel formPanel">

          <h2>New Application</h2>

          {/* Member selector */}
          <label className="field">
            <span>Member</span>
            <select
              value={memberNo}
              onChange={(e) => setMemberNo(e.target.value)}
            >
              <option value="">— Select Member —</option>
              {members.map((m) => (
                <option key={m.member_no} value={m.member_no}>
                  {m.member_no} — {m.name}
                </option>
              ))}
            </select>
          </label>

          {loadingMember && <p className="loadingText">Loading member account…</p>}

          {/* Member snapshot (existing) */}
          {memberNo && !loadingMember && (
            <div className="memberSnapshot">
              <div className="snapRow">
                <span>Savings (1018)</span>
                <strong>KES {finance.savings.toLocaleString()}</strong>
              </div>
              <div className="snapRow">
                <span>Loan Principal (1011)</span>
                <strong>KES {finance.currentLoan.toLocaleString()}</strong>
              </div>
              <div className="snapRow">
                <span>Interest Outstanding (1020)</span>
                <strong className={finance.outstandingInterest > 0 ? "warn" : ""}>
                  KES {finance.outstandingInterest.toLocaleString()}
                </strong>
              </div>
              <div className="snapRow">
                <span>Arrears</span>
                <strong className={finance.daysInArrears > 0 ? "danger" : "good"}>
                  {finance.arrearsClass} · {finance.daysInArrears}d
                </strong>
              </div>
              <div className="snapRow">
                <span>Credit Score / Risk</span>
                <strong>{finance.score} · {finance.riskRating}</strong>
              </div>
              {finance.hasExistingLoan && (
                <div className={`refinanceNotice ${finance.canRefinance ? "ok" : "blocked"}`}>
                  {finance.canRefinance
                    ? `♻ Refinance eligible — ${finance.repaidPercent.toFixed(1)}% repaid, last payment ${finance.daysSinceLastRepayment}d ago${finance.requiresManagerApproval ? " (manager sign-off required)" : ""}`
                    : `🔒 Refinance blocked — ${finance.refinanceBlockReason}`}
                </div>
              )}
            </div>
          )}

          {/* ========== LOAN SUMMARY (requirement #5) ========== */}
          {memberNo && !loadingMember && activeLoanRecord && (
            <div style={S.card}>
              <div style={S.cardTitle}>Loan Summary — {activeLoanRecord.loan_id || activeLoanRecord.application_id || "Pending ID Assignment"}</div>
              <div style={S.grid2}>
                <div style={S.row}><span>Product</span><strong>{activeLoanRecord.loan_type}</strong></div>
                <div style={S.row}><span>Loan Status</span><strong>{statusLabel(activeLoanRecord.workflow_status || activeLoanRecord.status)}</strong></div>
                <div style={S.row}><span>Original Amount</span><strong>KES {Number(activeLoanRecord.amount || 0).toLocaleString()}</strong></div>
                <div style={S.row}><span>Current Balance</span><strong>KES {finance.currentLoan.toLocaleString()}</strong></div>
                <div style={S.row}><span>Outstanding Interest</span><strong>KES {finance.outstandingInterest.toLocaleString()}</strong></div>
                <div style={S.row}><span>Outstanding Penalty</span><strong>Pending Penalty Module</strong></div>
                <div style={S.row}><span>Insurance</span><strong>KES {Number(activeLoanRecord.insurance_fee || 0).toLocaleString()}</strong></div>
                <div style={S.row}><span>Last Repayment</span><strong>{finance.lastRepaymentDate ? finance.lastRepaymentDate.toLocaleDateString("en-GB") : "—"}</strong></div>
                <div style={S.row}>
                  <span>Next Due Date (est.)</span>
                  <strong>{finance.lastActivityDate ? new Date(finance.lastActivityDate.getTime() + 30 * 86400000).toLocaleDateString("en-GB") : "—"}</strong>
                </div>
                <div style={S.row}>
                  <span>Installments Paid (est.)</span>
                  <strong>{activeLoanRecord.monthly_installment ? Math.min(activeLoanRecord.duration, Math.round(finance.loanPaid / activeLoanRecord.monthly_installment)) : "—"} / {activeLoanRecord.duration}</strong>
                </div>
                <div style={S.row}>
                  <span>Remaining Installments (est.)</span>
                  <strong>{activeLoanRecord.monthly_installment ? Math.max(0, activeLoanRecord.duration - Math.round(finance.loanPaid / activeLoanRecord.monthly_installment)) : "—"}</strong>
                </div>
                <div style={S.row}><span>Refinance Status</span><strong>{finance.canRefinance ? "Eligible" : finance.hasExistingLoan ? "Blocked" : "N/A"}</strong></div>
              </div>
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, marginBottom: 0 }}>
                Instalment counts and next-due-date are estimated from ledger activity until the Loan Repayment module
                (keyed by loan_id) tracks per-instalment due dates directly.
              </p>
            </div>
          )}

          {/* Loan product form */}
          {memberNo && !loadingMember && (
            <>
              <div className="formGrid">

                <label className="field">
                  <span>Loan Product</span>
                  <select name="loan_type" value={form.loan_type} onChange={handleInputChange}>
                    <option value="">— Select Product —</option>
                    {Object.entries(finance.products).map(([name, p]) => (
                      <option key={name} value={name}>
                        {name} — {p.rate}% / max {p.maxDuration}mo / KES {Math.round(p.maxAmount).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Amount (KES)</span>
                  <input
                    type="number" name="amount" placeholder="e.g. 50000"
                    value={form.amount} onChange={handleInputChange}
                  />
                  {prod && reqAmt > 0 && (
                    <small>Max: KES {Math.round(prod.maxAmount).toLocaleString()}</small>
                  )}
                </label>

                <label className="field">
                  <span>Duration (Months)</span>
                  <input
                    type="number" name="duration" placeholder="e.g. 12"
                    value={form.duration} onChange={handleInputChange}
                  />
                  {prod && <small>Max: {prod.maxDuration} months</small>}
                </label>

                <label className="field">
                  <span>Net Monthly Income (KES)</span>
                  <input
                    type="number" name="net_income" placeholder="Verified net pay"
                    value={form.net_income} onChange={handleInputChange}
                  />
                </label>

                <label className="field">
                  <span>Security / Collateral Type</span>
                  <select name="security_type" value={form.security_type} onChange={handleInputChange}>
                    <option value="">— Select —</option>
                    <option value="Deposits">Internal Savings (A/C 1018)</option>
                    <option value="Guarantor">Registered Member Guarantor</option>
                    {COLLATERAL_TYPES.filter((t) => !["Deposits", "Guarantor"].includes(t)).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                {form.security_type === "Guarantor" ? (
                  <label className="field">
                    <span>Primary Guarantor</span>
                    <select name="guarantor_1_no" value={form.guarantor_1_no} onChange={handleInputChange}>
                      <option value="">— Select Guarantor —</option>
                      {allMembers.filter((m) => m.member_no !== memberNo).map((m) => (
                        <option key={m.member_no} value={m.member_no}>{m.name} ({m.member_no})</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="field">
                    <span>Collateral Market Value (KES)</span>
                    <input
                      type="number" name="security_value" placeholder="Appraised value"
                      value={form.security_value} onChange={handleInputChange}
                      disabled={form.security_type === "Deposits"}
                    />
                  </label>
                )}

              </div>

              {form.security_type === "Guarantor" && (
                <>
                  <label className="field">
                    <span>Secondary Guarantor (Optional)</span>
                    <select name="guarantor_2_no" value={form.guarantor_2_no} onChange={handleInputChange}>
                      <option value="">— Optional —</option>
                      {allMembers.filter((m) => m.member_no !== memberNo && m.member_no !== form.guarantor_1_no).map((m) => (
                        <option key={m.member_no} value={m.member_no}>{m.name} ({m.member_no})</option>
                      ))}
                    </select>
                  </label>

                  {/* ========== GUARANTOR ASSESSMENT (requirement #9) ========== */}
                  {(guarantor1Assessment || guarantor2Assessment || assessingGuarantors) && (
                    <div style={S.card}>
                      <div style={S.cardTitle}>Guarantor Assessment</div>
                      {assessingGuarantors && !guarantor1Assessment && <p className="loadingText">Assessing guarantor…</p>}
                      {[guarantor1Assessment, guarantor2Assessment].filter(Boolean).map((g) => (
                        <div key={g.memberNo} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <strong>{g.name} ({g.memberNo})</strong>
                            <span style={S.badge(g.eligible)}>{g.eligible ? "✓ ELIGIBLE" : "✗ NOT ELIGIBLE"}</span>
                          </div>
                          <div style={S.grid3}>
                            <div style={S.row}><span>Savings</span><strong>KES {g.savings.toLocaleString()}</strong></div>
                            <div style={S.row}><span>Existing Loan Balance</span><strong>KES {g.currentBalance.toLocaleString()}</strong></div>
                            <div style={S.row}><span>Credit Score</span><strong>{g.score}</strong></div>
                            <div style={S.row}><span>Risk Rating</span><strong>{g.riskRating}</strong></div>
                            <div style={S.row}><span>Arrears</span><strong>{g.arrearsDays}d</strong></div>
                            <div style={S.row}><span># Loans Guaranteed</span><strong>{g.guaranteedLoansCount}</strong></div>
                            <div style={S.row}><span>Guaranteed Exposure</span><strong>KES {g.guaranteedExposure.toLocaleString()}</strong></div>
                            <div style={S.row}><span>Available Guarantee Limit</span><strong>KES {g.availableGuaranteeLimit.toLocaleString()}</strong></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ========== COLLATERAL DETAIL (requirement #10) ========== */}
              {COLLATERAL_REQUIRES_VALUATION.includes(form.security_type) && (
                <div style={S.card}>
                  <div style={S.cardTitle}>Collateral Detail — {form.security_type}</div>
                  <div className="formGrid">
                    <label className="field">
                      <span>Market Value (KES)</span>
                      <input type="number" name="security_market_value" value={form.security_market_value} onChange={handleInputChange} />
                    </label>
                    <label className="field">
                      <span>Forced Sale Value (KES)</span>
                      <input type="number" name="security_forced_sale_value" value={form.security_forced_sale_value} onChange={handleInputChange} />
                    </label>
                    <label className="field">
                      <span>Valuation Date</span>
                      <input type="date" name="security_valuation_date" value={form.security_valuation_date} onChange={handleInputChange} />
                    </label>
                    <label className="field">
                      <span>Expiry Date</span>
                      <input type="date" name="security_expiry_date" value={form.security_expiry_date} onChange={handleInputChange} />
                    </label>
                    <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" name="security_insured" checked={form.security_insured} onChange={handleInputChange} style={{ width: "auto" }} />
                      <span>Collateral is insured</span>
                    </label>
                  </div>
                  {collateralCoverageRatio !== null && (
                    <div style={{ marginTop: 6, fontSize: 12.5 }}>
                      Coverage ratio: <strong>{collateralCoverageRatio.toFixed(2)}x</strong>
                      <span style={S.pill}>{collateralStrengthLabel}</span>
                    </div>
                  )}
                </div>
              )}

              <label className="field">
                <span>Loan Purpose</span>
                <textarea
                  name="purpose" rows="2" placeholder="Describe the intended use of funds..."
                  value={form.purpose} onChange={handleInputChange}
                />
              </label>

              {/* ========== DOCUMENT CHECKLIST (requirement #11) ========== */}
              <div style={S.card}>
                <div style={S.cardTitle}>Document Checklist</div>
                {DOCUMENT_CHECKLIST_ITEMS.filter((d) => !d.conditional || d.conditional(form)).map((d) => (
                  <label key={d.key} style={S.checklistRow}>
                    <input
                      type="checkbox"
                      checked={!!docChecklist[d.key]}
                      onChange={(e) => setDocChecklist((prev) => ({ ...prev, [d.key]: e.target.checked }))}
                    />
                    <span>{docChecklist[d.key] ? "✓" : "○"} {d.label}</span>
                  </label>
                ))}
                <label className="field" style={{ marginTop: 8 }}>
                  <span>Upload Supporting Documents</span>
                  <input type="file" multiple onChange={(e) => setFiles([...e.target.files])} />
                  {files.length > 0 && (
                    <small>{files.length} file(s): {Array.from(files).map((f) => f.name).join(", ")}</small>
                  )}
                </label>
              </div>

              {/* ========== CREDIT ASSESSMENT (requirement #7) ========== */}
              {prod && (
                <div style={S.card}>
                  <div style={S.cardTitle}>Credit Assessment</div>
                  <div style={S.grid2}>
                    <div style={S.row}><span>Credit Score</span><strong>{finance.score}/100</strong></div>
                    <div style={S.row}><span>Risk Rating</span><strong>{finance.riskRating}</strong></div>
                    <div style={S.row}><span>Savings Behaviour</span><strong>KES {finance.savings.toLocaleString()} on deposit</strong></div>
                    <div style={S.row}><span>Loan Repayment Behaviour</span><strong>{finance.arrearsClass} · {finance.daysInArrears}d in arrears</strong></div>
                    <div style={S.row}><span>Existing Exposure</span><strong>KES {finance.currentLoan.toLocaleString()}</strong></div>
                    <div style={S.row}><span>Debt Service Ratio</span><strong className={finance.isDsrValid ? "" : "danger"}>{finance.isDsrValid ? "Within Policy" : "Exceeds Ceiling"}</strong></div>
                    <div style={S.row}><span>Membership Age</span><strong>{finance.membershipMonths} months</strong></div>
                    <div style={S.row}><span>Loan History</span><strong>{memberLoanHistory.length} application(s) on file</strong></div>
                    <div style={S.row}><span>Guarantor Strength</span><strong>{guarantorStrengthLabel}</strong></div>
                    <div style={S.row}><span>Collateral Strength</span><strong>{collateralStrengthLabel}</strong></div>
                  </div>
                  <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: allChecksPassed ? "#f0fdf4" : "#fef2f2", fontSize: 12.5 }}>
                    <strong>AI Recommendation:</strong> {aiRecommendation}
                  </div>
                </div>
              )}

              {/* ========== ELIGIBILITY ENGINE (requirement #8) ========== */}
              {prod && (
                <div style={S.card}>
                  <div style={S.cardTitle}>Eligibility Checks</div>
                  <div style={S.grid2}>
                    {eligibilityChecks.map((c) => (
                      <div key={c.key} style={S.checklistRow} title={c.detail}>
                        <span style={S.badge(c.passed)}>{c.passed ? "✓" : "✗"}</span>
                        <span>{c.label}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11.5, color: "#64748b", marginTop: 8 }}>
                    {eligibilityChecks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`).join(" · ") || "All checks passed."}
                  </p>
                </div>
              )}

              {/* Compliance panel (existing SASRA engine, unchanged) */}
              {prod && (
                <div className={`compliance ${finance.isEligible ? "ok" : "bad"}`}>
                  <div className="complianceHead">
                    <span>SASRA Compliance Engine</span>
                    <span className="verdict">{finance.isEligible ? "✓ APPROVED" : "✗ REJECTED"}</span>
                  </div>

                  <div className="complianceGrid">
                    <div>Principal: <strong>KES {reqAmt.toLocaleString()}</strong></div>
                    <div>Total Interest (reducing bal, {prod.rate}%/yr): <strong>KES {Math.round(finance.totalInterest).toLocaleString()}</strong></div>
                    <div>Insurance ({prod.insRate || 0}%): <strong>KES {Math.round(finance.insuranceFee).toLocaleString()}</strong></div>
                    <div>Tx Charge: <strong>KES {finance.txCharge.toLocaleString()}</strong></div>
                    <div>Net Disbursed: <strong className="positive">KES {finance.netDisbursable.toLocaleString()}</strong></div>
                    <div>Total Repayable: <strong>KES {finance.totalRepayable.toLocaleString()}</strong></div>
                    <div>Monthly Instalment: <strong>KES {Math.round(finance.monthlyInstallment).toLocaleString()}/mo</strong></div>
                    <div>1/3 DSR Ceiling: <strong className={finance.isDsrValid ? "" : "danger"}>KES {Math.round(finance.dsrCeiling).toLocaleString()}/mo</strong></div>
                    <div>Max Cap: <strong>KES {Math.round(prod.maxAmount).toLocaleString()}</strong></div>
                    <div>Max Duration: <strong>{prod.maxDuration} months</strong></div>
                    <div>Approval Level Required: <strong>{requiredApprovalLevel}</strong></div>
                  </div>

                  <div className="txTiers">
                    Tx charge tiers: ≤500=KES10 | 501–1K=KES15 | 1K–5K=KES25 | 5K–10K=KES35 | &gt;10K=KES100
                  </div>

                  <div className="verdictLine">
                    Verdict: {finance.complianceRemark}
                  </div>
                </div>
              )}

              {/* ========== LOAN CHARGES (requirement #13) ========== */}
              {prod && reqAmt > 0 && (
                <div style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={S.cardTitle}>Loan Charges (Configurable)</div>
                    <button type="button" style={S.linkBtn} onClick={() => setShowChargesSettings((s) => !s)}>
                      {showChargesSettings ? "Done editing" : "Edit charges"}
                    </button>
                  </div>
                  {Object.entries(chargesConfig).map(([key, charge]) => {
                    const amount = computeChargeAmount(charge, reqAmt, finance.totalInterest);
                    return (
                      <div key={key} style={S.row}>
                        <span>{charge.label} {charge.type !== "flat" && <em style={{ color: "#94a3b8" }}>({charge.value}%)</em>}</span>
                        {showChargesSettings ? (
                          <input
                            type="number"
                            style={{ ...S.smallInput, width: 90, textAlign: "right" }}
                            value={charge.value}
                            onChange={(e) => setChargesConfig((prev) => ({ ...prev, [key]: { ...prev[key], value: Number(e.target.value) } }))}
                          />
                        ) : (
                          <strong>KES {Math.round(amount).toLocaleString()}</strong>
                        )}
                      </div>
                    );
                  })}
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, marginBottom: 0 }}>
                    Informational schedule for policy configuration — separate from the validated Total Repayable figure above,
                    which already includes interest, insurance, and the transaction processing charge.
                  </p>
                </div>
              )}

              {/* Repayment schedule preview (existing, unchanged) */}
              {finance.schedule.length > 0 && finance.isEligible && (
                <div className="schedule">
                  <h4>Repayment Schedule — Reducing Balance ({finance.schedule.length} months)</h4>
                  <div className="scheduleTableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Principal</th>
                          <th>Interest</th>
                          <th>Insurance</th>
                          <th>Instalment</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finance.schedule.map((r) => (
                          <tr key={r.month}>
                            <td className="rowLabel">Month {r.month}</td>
                            <td>{r.principal.toLocaleString()}</td>
                            <td className="interest">{r.interest.toLocaleString()}</td>
                            <td>{r.insurance.toLocaleString()}</td>
                            <td className="bold">{r.total.toLocaleString()}</td>
                            <td className="balance">{r.balance.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>TOTAL</td>
                          <td>{finance.schedule.reduce((s, r) => s + r.principal, 0).toLocaleString()}</td>
                          <td className="interest">{Math.round(finance.totalInterest).toLocaleString()}</td>
                          <td>{Math.round(finance.insuranceFee).toLocaleString()}</td>
                          <td>{Math.round(finance.totalRepayable).toLocaleString()}</td>
                          <td>0</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="scheduleNote">
                    Interest computed on reducing balance at {finance.currentProduct?.rate}% per month on outstanding balance.
                  </p>
                </div>
              )}

              {/* Step hint (existing, unchanged) */}
              <div className="hint">
                💡 <strong>Step 1:</strong> Fill all fields above →
                {" "}<strong>Step 2:</strong> Download the PDF agreement for the member to sign →
                {" "}<strong>Step 3:</strong> Submit the application.
              </div>

              {/* Download PDF (existing, unchanged) */}
              <button
                className="btn btnDark"
                disabled={!form.loan_type || !form.amount}
                onClick={downloadOfficialLoanForm}
              >
                ⬇ Download Loan Agreement PDF
                {form.loan_type && form.amount
                  ? ` — KES ${Number(form.amount).toLocaleString()} ${form.loan_type}`
                  : " (select product & amount first)"}
              </button>

              {/* Submit (existing, now also gated on the eligibility engine) */}
              <button
                className="btn btnPrimary"
                disabled={submitting || !finance.isEligible || !allChecksPassed}
                onClick={executeLoanApplication}
              >
                {submitting ? "Submitting…" : "✓ Submit Application on Behalf of Member"}
              </button>
            </>
          )}

        </div>

        {/* ================= PENDING APPROVALS ================= */}
        <div className="panel approvalsPanel">

          <h2>
            Pending Approvals
            {pending.length > 0 && <span className="badgeCount">{pending.length}</span>}
          </h2>

          {pending.length === 0 ? (
            <p className="loadingText">No pending loan applications.</p>
          ) : (
            <div className="approvalsList">
              {pending.map((l) => {
                const currentWorkflowStatus = l.workflow_status || l.status;
                const flowIndex = LOAN_STATUS_FLOW.findIndex((s) => s.key === currentWorkflowStatus);
                return (
                  <div key={l.id} className="approvalCard">

                    <div className="approvalTop">
                      <div>
                        <div className="approvalMember">
                          {l.application_id || l.member_no} — {l.name || "—"}
                          {l.loan_id && <span style={S.pill}>{l.loan_id}</span>}
                        </div>
                        <div className="approvalMeta">
                          {l.loan_type} · KES {Number(l.amount).toLocaleString()} · {l.duration} mo
                        </div>
                      </div>
                      {l.channel === "assisted" && (
                        <span className="channelTag">Assisted</span>
                      )}
                    </div>

                    {/* Workflow status stepper */}
                    {flowIndex >= 0 && (
                      <div style={S.stepperWrap}>
                        {LOAN_STATUS_FLOW.slice(0, 7).map((s, idx) => (
                          <span key={s.key} style={S.step(idx < flowIndex ? "done" : idx === flowIndex ? "current" : "pending")}>
                            {s.label}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="approvalDetails">
                      <span>Monthly: KES {Math.round(l.monthly_installment || 0).toLocaleString()}</span>
                      <span>Total Repayable: KES {Math.round(l.total_repayable || 0).toLocaleString()}</span>
                      <span>Risk: {l.risk_level || "—"} ({l.risk_score ?? "—"})</span>
                      <span>Approval Level: {l.approval_level || getApprovalLevel(l.amount)}</span>
                      <span>Status: {statusLabel(currentWorkflowStatus)}</span>
                    </div>

                    {l.purpose && <div className="approvalPurpose">"{l.purpose}"</div>}

                    {/* Manual workflow advance (requirement #3) */}
                    {MANUAL_ADVANCE_STATUSES.includes(currentWorkflowStatus) && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
                        <select
                          style={S.smallInput}
                          value={statusDraft[l.id] || ""}
                          onChange={(e) => setStatusDraft((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        >
                          <option value="">Advance stage to…</option>
                          {MANUAL_ADVANCE_STATUSES.filter((s) => s !== currentWorkflowStatus).map((s) => (
                            <option key={s} value={s}>{statusLabel(s)}</option>
                          ))}
                        </select>
                        <button
                          className="btn btnGhost"
                          disabled={!statusDraft[l.id] || advancingId === l.id}
                          onClick={() => advanceLoanStatus(l, statusDraft[l.id])}
                        >
                          {advancingId === l.id ? "…" : "Apply"}
                        </button>
                      </div>
                    )}

                    <div className="approvalActions">
                      <button className="btn btnApprove" onClick={() => approveLoan(l)}>
                        Approve
                      </button>
                      <button
                        className="btn btnReject"
                        onClick={() => setRejectingId(rejectingId === l.id ? null : l.id)}
                      >
                        Reject
                      </button>
                    </div>

                    {rejectingId === l.id && (
                      <div className="rejectBox">
                        <textarea
                          rows="2"
                          placeholder="Reason for rejection (optional)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <div className="rejectActions">
                          <button className="btn btnReject" onClick={() => submitReject(l)}>
                            Confirm Reject
                          </button>
                          <button
                            className="btn btnGhost"
                            onClick={() => { setRejectingId(null); setRejectReason(""); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}