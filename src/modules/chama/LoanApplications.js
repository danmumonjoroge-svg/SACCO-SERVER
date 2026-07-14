import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  FileText,
  TrendingUp,
  Users,
  Clock,
  X,
  Loader2,
  ShieldCheck,
  Download,
  AlertCircle,
  PlusCircle,
  Wallet,
  Trash2,
  Settings,
} from "lucide-react";
import { supabase } from "../../supabaseClient"; // <-- adjust this path to wherever your project initializes the Supabase client
import "./LoanApplications.css";

// =============================================================================
// DATA LAYER — talks to the real Supabase tables.
//
// Tables used (see chama_loan_applications_schema.sql for the migration that
// adds the columns this file needs on top of your original schema):
//   - chama_loan_applications  (extended: interest_rate, interest_type,
//                                required_approvals, approvals jsonb, loan_id,
//                                rejected_at)
//   - chama_loan_rules         (new — one row per chama, sacco-style rules)
//   - chama_members            (assumed existing: id, chama_id, member_name,
//                                total_contributions, and ideally a join date
//                                column for the membership-length rule —
//                                see MEMBERSHIP_DATE_FIELD below)
//
// This file is deliberately scoped to APPLICATIONS ONLY. Disbursement,
// repayments, and closure are separate modules to be added later; once a
// loan application is fully approved we just stamp it with a `loan_id`
// (a uuid) so those future modules have something stable to key off of.
// =============================================================================

const APPLICATIONS_TABLE = "chama_loan_applications";
const RULES_TABLE = "chama_loan_rules";
const MEMBERS_TABLE = "chama_contributions";

// Note: membership length now comes from normalizeMemberRow()'s joined_at
// detection above — no need to hardcode a single column name here anymore.

// -----------------------------------------------------------------------------
// Auto-resolving the logged-in user's chama_id
//
// This is a fallback only — it runs when no `chamaId` prop is passed in. Your
// query logs show ChamaLoansDashboard already passes a working chama_id down
// as a prop, so this path likely isn't even exercised in your app today. It's
// kept here so the component degrades safely if it's ever mounted without
// that prop, rather than silently showing an empty dropdown again.
//
// Your chama_contributions table has:
//   constraint chama_transactions_user_id_fkey foreign key (user_id)
//     references chama_profiles (id)
// which means `chama_profiles.id` IS the authenticated user's id — not a
// separate `user_id` column on that table. We look up the profile row by its
// own primary key and read `chama_id` off of it. If `chama_profiles` doesn't
// have a `chama_id` column, adjust AUTH_CHAMA_ID_FIELD below.
// -----------------------------------------------------------------------------
const AUTH_CHAMA_LOOKUP_TABLE = "chama_profiles";
const AUTH_USER_ID_FIELD = "id";
const AUTH_CHAMA_ID_FIELD = "chama_id";

// -----------------------------------------------------------------------------
// Member row normalization
//
// Members and their savings actually live in `chama_contributions`, not a
// separate `chama_members` table — one row per member per chama, enforced by
// `unique_member_in_chama unique (name, chama_no)`. The real columns are
// `name` (member's name) and `savings` (their running savings balance, used
// for the loan eligibility multiplier). We prioritize those, but keep a few
// fallback guesses in case you later add a proper members table.
//
// There's no membership-join-date column on chama_contributions, so
// `joined_at` stays null here — which is fine, since the min-membership-
// length rule is skipped (treated as satisfied) whenever it can't be
// determined, rather than incorrectly blocking every application.
// -----------------------------------------------------------------------------

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== "");
}

function normalizeMemberRow(row) {
  const fullNameFromParts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  const member_name = firstDefined(row.name, row.member_name, row.full_name, fullNameFromParts) || "Unnamed member";
  const total_contributions = firstDefined(row.savings, row.total_contributions, row.contributions, row.total_savings) ?? 0;
  const joined_at = firstDefined(row.joined_at, row.join_date, row.date_joined) ?? null;
  return { ...row, member_name, total_contributions, joined_at };
}

const DEFAULT_RULES = {
  savings_multiplier: 3,
  max_loan_amount: null,
  min_membership_months: 0,
  requires_guarantors: true,
  min_guarantors: 1,
  guarantor_coverage_percent: 100,
  requires_security: false,
  security_instructions: "",
  default_interest_rate: 10,
  default_interest_type: "flat_monthly",
  required_approvals: 2,
};

const STATUS_TABS = ["All", "Pending", "Awaiting Approval", "Approved", "Rejected"];

const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Amount: high to low" },
  { value: "amount_asc", label: "Amount: low to high" },
];

const emptyForm = {
  requested_amount: "",
  purpose: "",
  repayment_months: "",
  interest_rate: "10",
  interest_type: "flat_monthly",
};

const emptyGuarantor = () => ({ id: `tmp_${Math.random().toString(36).slice(2)}`, memberId: "", amount: "" });

// -----------------------------------------------------------------------------
// Row (de)serialization
//
// `guarantors` is a plain `text` column in your schema (not jsonb), so we
// store it as a JSON string and parse it back out on read. `approvals` is
// jsonb, so Supabase already hands it back as a real array/object — no
// parsing needed there.
// -----------------------------------------------------------------------------

function parseApplicationRow(row) {
  if (!row) return row;
  let guarantors = [];
  try {
    guarantors = row.guarantors ? JSON.parse(row.guarantors) : [];
  } catch {
    guarantors = [];
  }
  return {
    ...row,
    guarantors,
    approvals: Array.isArray(row.approvals) ? row.approvals : [],
    applied_on: row.application_date || row.created_at,
    rejection_reason: row.status === "Rejected" ? row.remarks : null,
  };
}

// A tiny fake network delay so loading states are visible and believable in dev.
const wait = (ms = 150) => new Promise((res) => setTimeout(res, ms));

const db = {
  async resolveChamaIdForCurrentUser() {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const user = authData?.user;
    if (!user) throw new Error("You're not signed in, so we can't tell which chama you belong to.");

    const { data, error } = await supabase
      .from(AUTH_CHAMA_LOOKUP_TABLE)
      .select(AUTH_CHAMA_ID_FIELD)
      .eq(AUTH_USER_ID_FIELD, user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data[AUTH_CHAMA_ID_FIELD]) {
      throw new Error("We couldn't find a chama linked to your account.");
    }
    return data[AUTH_CHAMA_ID_FIELD];
  },

  async getRules(chamaId) {
    const { data, error } = await supabase
      .from(RULES_TABLE)
      .select("*")
      .eq("chama_id", chamaId)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...DEFAULT_RULES, ...data } : null; // null = no custom rules saved yet
  },

  async listMembers(chamaId) {
    const { data, error } = await supabase
      .from(MEMBERS_TABLE)
      .select("*")
      .eq("chama_id", chamaId);
    if (error) throw error;
    const rows = (data || []).map(normalizeMemberRow);
    rows.sort((a, b) => a.member_name.localeCompare(b.member_name));
    return rows;
  },

  async listApplications(chamaId) {
    const { data, error } = await supabase
      .from(APPLICATIONS_TABLE)
      .select("*")
      .eq("chama_id", chamaId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(parseApplicationRow);
  },

  async createApplication(chamaId, payload) {
    const { data, error } = await supabase
      .from(APPLICATIONS_TABLE)
      .insert([
        {
          chama_id: chamaId,
          member_id: payload.member_id,
          member_name: payload.member_name,
          requested_amount: payload.requested_amount,
          purpose: payload.purpose,
          repayment_months: payload.repayment_months,
          interest_rate: payload.interest_rate,
          interest_type: payload.interest_type,
          guarantors: JSON.stringify(payload.guarantors || []),
          status: "Pending",
          required_approvals: payload.required_approvals,
          approvals: [],
        },
      ])
      .select()
      .single();
    if (error) throw error;
    return parseApplicationRow(data);
  },

  async approveApplication(chamaId, id, approval) {
    // Read-modify-write: fetch the current row so we can append to the
    // approvals array server-side-consistent with what's actually stored.
    const { data: existing, error: fetchErr } = await supabase
      .from(APPLICATIONS_TABLE)
      .select("*")
      .eq("id", id)
      .eq("chama_id", chamaId)
      .single();
    if (fetchErr) throw fetchErr;

    const row = parseApplicationRow(existing);
    const already = row.approvals.some((a) => a.name.toLowerCase() === approval.name.toLowerCase());
    if (already) throw new Error("This approver has already signed off");

    const newApprovals = [...row.approvals, approval];
    const required = row.required_approvals || DEFAULT_RULES.required_approvals;
    const fullyApproved = newApprovals.length >= required;

    const updateFields = {
      approvals: newApprovals,
      status: fullyApproved ? "Approved" : "Awaiting Approval",
    };

    if (fullyApproved) {
      updateFields.loan_id = crypto.randomUUID();
      updateFields.approved_at = new Date().toISOString();
      // approved_by is a uuid column on your table. If you have an
      // authenticated committee member (e.g. via supabase.auth.getUser()),
      // set it here — we leave it null when approvals are captured by name
      // only, since a typed name isn't a real user id.
      updateFields.approved_by = approval.member_id || null;
    }

    const { data, error } = await supabase
      .from(APPLICATIONS_TABLE)
      .update(updateFields)
      .eq("id", id)
      .eq("chama_id", chamaId)
      .select()
      .single();
    if (error) throw error;

    return {
      row: parseApplicationRow(data),
      fullyApproved,
      approvalsCount: newApprovals.length,
      required,
    };
  },

  async rejectApplication(chamaId, id, reason) {
    const { data, error } = await supabase
      .from(APPLICATIONS_TABLE)
      .update({ status: "Rejected", remarks: reason || null, rejected_at: new Date().toISOString() })
      .eq("id", id)
      .eq("chama_id", chamaId)
      .select()
      .single();
    if (error) throw error;
    return parseApplicationRow(data);
  },
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatKES(value) {
  const n = Number(value || 0);
  return `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function calculateLoan({ amount, months, rate, type }) {
  const P = Number(amount) || 0;
  const n = Number(months) || 0;
  const r = Number(rate) || 0;

  if (P <= 0 || n <= 0) return { monthlyInstallment: 0, totalInterest: 0, totalRepayable: 0 };

  if (type === "reducing_annual") {
    const monthlyRate = r / 100 / 12;
    let monthlyInstallment;
    if (monthlyRate === 0) {
      monthlyInstallment = P / n;
    } else {
      const factor = Math.pow(1 + monthlyRate, n);
      monthlyInstallment = (P * monthlyRate * factor) / (factor - 1);
    }
    const totalRepayable = monthlyInstallment * n;
    return { monthlyInstallment, totalRepayable, totalInterest: totalRepayable - P };
  }

  const totalInterest = P * (r / 100) * n;
  const totalRepayable = P + totalInterest;
  const monthlyInstallment = totalRepayable / n;
  return { monthlyInstallment, totalInterest, totalRepayable };
}

function monthsSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
}

function toCSV(rows) {
  const headers = [
    "Member", "Amount Requested", "Interest Rate", "Interest Type", "Repayment Months",
    "Monthly Installment", "Total Repayable", "Status", "Guarantors", "Applied On",
  ];
  const lines = rows.map((r) => {
    const { monthlyInstallment, totalRepayable } = calculateLoan({
      amount: r.requested_amount, months: r.repayment_months, rate: r.interest_rate, type: r.interest_type,
    });
    const guarantors = (r.guarantors || []).map((g) => `${g.name} (${g.amount})`).join("; ");
    return [
      r.member_name, r.requested_amount, `${r.interest_rate ?? 0}%`,
      r.interest_type === "reducing_annual" ? "Reducing (annual)" : "Flat (monthly)",
      r.repayment_months, Math.round(monthlyInstallment), Math.round(totalRepayable),
      r.status, guarantors, r.applied_on ? new Date(r.applied_on).toLocaleDateString() : "",
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  });
  return [headers.join(","), ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoanApplications({ chamaId: chamaIdProp, onOpenLoanRules }) {
  const [chamaId, setChamaId] = useState(chamaIdProp || null);
  const [resolvingChama, setResolvingChama] = useState(!chamaIdProp);
  const [chamaError, setChamaError] = useState(null);

  const resolveChama = useCallback(async () => {
    if (chamaIdProp) {
      setChamaId(chamaIdProp);
      setResolvingChama(false);
      setChamaError(null);
      return;
    }
    setResolvingChama(true);
    setChamaError(null);
    try {
      const id = await db.resolveChamaIdForCurrentUser();
      setChamaId(id);
    } catch (err) {
      setChamaError(err.message || "Could not determine your chama");
      setChamaId(null);
    } finally {
      setResolvingChama(false);
    }
  }, [chamaIdProp]);

  useEffect(() => {
    resolveChama();
  }, [resolveChama]);

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(null);

  const [rules, setRules] = useState(DEFAULT_RULES);
  const [rulesAreCustom, setRulesAreCustom] = useState(false);

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [applicantId, setApplicantId] = useState("");
  const [guarantors, setGuarantors] = useState([emptyGuarantor()]);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const [actingId, setActingId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [approverName, setApproverName] = useState("");
  const [approverRole, setApproverRole] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [toast, setToast] = useState(null);
  const [toastTimer, setToastTimer] = useState(null);

  // ---- Data loading ------------------------------------------------------

  const showToast = useCallback(
    (message, type = "success") => {
      setToast({ message, type });
      if (toastTimer) window.clearTimeout(toastTimer);
      const t = window.setTimeout(() => setToast(null), 3500);
      setToastTimer(t);
    },
    [toastTimer]
  );

  const loadApplications = useCallback(async (id) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await db.listApplications(id);
      setApplications(data);
    } catch (err) {
      setLoadError(err.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (id) => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const data = await db.listMembers(id);
      setMembers(data);
    } catch (err) {
      console.error("[LoanApplications] Failed to load chama_members:", err);
      setMembersError(err.message || "Failed to load members");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadRules = useCallback(async (id) => {
    try {
      const data = await db.getRules(id);
      if (data) {
        setRules(data);
        setRulesAreCustom(true);
      } else {
        setRules(DEFAULT_RULES);
        setRulesAreCustom(false);
      }
    } catch {
      setRules(DEFAULT_RULES);
      setRulesAreCustom(false);
    }
  }, []);

  useEffect(() => {
    if (!chamaId) return;
    setFormOpen(false);
    resetForm();
    setStatusTab("All");
    setSearch("");
    loadApplications(chamaId);
    loadMembers(chamaId);
    loadRules(chamaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamaId]);

  useEffect(() => () => toastTimer && window.clearTimeout(toastTimer), [toastTimer]);

  // Whenever rules load (or change), refresh the form defaults for interest
  // terms and required approvals, unless the committee member already typed
  // something different into the open form.
  useEffect(() => {
    setForm((f) => ({
      ...f,
      interest_rate: f.interest_rate || String(rules.default_interest_rate),
      interest_type: f.interest_type || rules.default_interest_type,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules]);

  // ---- Derived data --------------------------------------------------------

  const membersById = useMemo(() => {
    const map = {};
    members.forEach((m) => { map[m.id] = m; });
    return map;
  }, [members]);

  const applicantMember = membersById[applicantId] || null;

  const eligibility = useMemo(() => {
    if (!applicantMember) return null;
    const contributions = Number(applicantMember.total_contributions) || 0;
    let limit = contributions * (rules.savings_multiplier || DEFAULT_RULES.savings_multiplier);
    if (rules.max_loan_amount) limit = Math.min(limit, Number(rules.max_loan_amount));

    const tenureMonths = monthsSince(applicantMember.joined_at);
    const tenureOk =
      rules.min_membership_months <= 0 || tenureMonths === null || tenureMonths >= rules.min_membership_months;

    return { contributions, limit, tenureMonths, tenureOk };
  }, [applicantMember, rules]);

  const stats = useMemo(() => {
    const pending = applications.filter((a) => a.status === "Pending" || a.status === "Awaiting Approval");
    const approved = applications.filter((a) => a.status === "Approved");
    const rejected = applications.filter((a) => a.status === "Rejected");
    const decided = approved.length + rejected.length;
    const totalDisbursed = approved.reduce((sum, a) => sum + (Number(a.requested_amount) || 0), 0);
    const avgLoanSize = applications.length > 0
      ? applications.reduce((s, a) => s + (Number(a.requested_amount) || 0), 0) / applications.length
      : 0;
    return {
      pendingCount: pending.length,
      totalDisbursed,
      avgLoanSize,
      approvalRate: decided > 0 ? (approved.length / decided) * 100 : null,
    };
  }, [applications]);

  const filtered = useMemo(() => {
    let rows = applications.filter((a) => (a.member_name || "").toLowerCase().includes(search.toLowerCase()));
    if (statusTab !== "All") rows = rows.filter((a) => a.status === statusTab);
    rows = [...rows].sort((a, b) => {
      switch (sortBy) {
        case "date_asc": return new Date(a.applied_on) - new Date(b.applied_on);
        case "amount_desc": return (b.requested_amount || 0) - (a.requested_amount || 0);
        case "amount_asc": return (a.requested_amount || 0) - (b.requested_amount || 0);
        case "date_desc":
        default: return new Date(b.applied_on) - new Date(a.applied_on);
      }
    });
    return rows;
  }, [applications, search, statusTab, sortBy]);

  const loanPreview = useMemo(
    () => calculateLoan({
      amount: form.requested_amount, months: form.repayment_months,
      rate: form.interest_rate, type: form.interest_type,
    }),
    [form.requested_amount, form.repayment_months, form.interest_rate, form.interest_type]
  );

  const guarantorTotal = useMemo(
    () => guarantors.reduce((sum, g) => sum + (Number(g.amount) || 0), 0),
    [guarantors]
  );

  const requiredGuarantorCoverage = useMemo(() => {
    const amount = Number(form.requested_amount) || 0;
    return amount * ((rules.guarantor_coverage_percent || 100) / 100);
  }, [form.requested_amount, rules.guarantor_coverage_percent]);

  // ---- Guarantor list editing ---------------------------------------------

  const addGuarantor = () => setGuarantors((g) => [...g, emptyGuarantor()]);
  const removeGuarantor = (id) => setGuarantors((g) => (g.length > 1 ? g.filter((row) => row.id !== id) : g));
  const updateGuarantor = (id, field, value) =>
    setGuarantors((g) => g.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  const guarantorOptionsFor = (rowId) => {
    const takenElsewhere = new Set(guarantors.filter((g) => g.id !== rowId && g.memberId).map((g) => g.memberId));
    return members.filter((m) => m.id !== applicantId && !takenElsewhere.has(m.id));
  };

  // ---- Create application --------------------------------------------------

  const validateForm = () => {
    const errors = {};
    if (!applicantId) errors.applicant = "Select the member applying";
    if (!form.requested_amount || Number(form.requested_amount) <= 0) errors.requested_amount = "Enter a valid amount";
    if (!form.repayment_months || Number(form.repayment_months) <= 0) errors.repayment_months = "Enter repayment period";
    if (!form.purpose.trim()) errors.purpose = "Required";

    if (eligibility && !eligibility.tenureOk) {
      errors.applicant = `This member needs ${rules.min_membership_months} months of membership to borrow (currently ${eligibility.tenureMonths ?? "unknown"})`;
    }
    if (eligibility && Number(form.requested_amount) > eligibility.limit) {
      errors.requested_amount = `Exceeds this member's eligibility limit of ${formatKES(eligibility.limit)}`;
    }

    const cleanGuarantors = guarantors.filter((g) => g.memberId);
    if (rules.requires_guarantors) {
      const minG = rules.min_guarantors || 1;
      if (cleanGuarantors.length < minG) {
        errors.guarantors = `This chama requires at least ${minG} guarantor${minG > 1 ? "s" : ""}`;
      } else if (cleanGuarantors.some((g) => !g.amount || Number(g.amount) <= 0)) {
        errors.guarantors = "Enter a guaranteed amount for each guarantor";
      } else if (guarantorTotal < requiredGuarantorCoverage) {
        errors.guarantors = `Guarantors must cover at least ${rules.guarantor_coverage_percent}% of the requested amount (${formatKES(requiredGuarantorCoverage)})`;
      }
    }

    setFormErrors(errors);
    return errors;
  };

  function resetForm() {
    setForm({ ...emptyForm, interest_rate: String(rules.default_interest_rate), interest_type: rules.default_interest_type });
    setApplicantId("");
    setGuarantors([emptyGuarantor()]);
    setFormErrors({});
  }

  const createApplication = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      console.warn("[LoanApplications] Submit blocked by validation:", errors);
      showToast(Object.values(errors)[0], "error");
      return;
    }

    const applicant = membersById[applicantId];
    if (!applicant) {
      setFormErrors((prev) => ({ ...prev, applicant: "Select the member applying" }));
      showToast("Select the member applying", "error");
      return;
    }

    setSubmitting(true);
    const cleanGuarantors = guarantors
      .filter((g) => g.memberId)
      .map((g) => {
        const member = membersById[g.memberId];
        return { name: member?.member_name || "", amount: Number(g.amount) || 0 };
      });

    try {
      await db.createApplication(chamaId, {
        member_id: applicant.id,
        member_name: applicant.member_name,
        requested_amount: Number(form.requested_amount),
        purpose: form.purpose.trim(),
        repayment_months: Number(form.repayment_months),
        interest_rate: Number(form.interest_rate) || 0,
        interest_type: form.interest_type,
        guarantors: cleanGuarantors,
        required_approvals: rules.required_approvals || DEFAULT_RULES.required_approvals,
      });
      showToast("Application submitted");
      resetForm();
      setFormOpen(false);
      await loadApplications(chamaId);
    } catch (err) {
      console.error("[LoanApplications] createApplication failed:", err);
      showToast(`Could not submit application: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Approval workflow -----------------------------------------------

  const openApprove = (row) => {
    setApproverName("");
    setApproverRole("");
    setConfirmModal({ type: "approve", row });
  };

  const openReject = (row) => {
    setRejectionReason("");
    setConfirmModal({ type: "reject", row });
  };

  const closeModal = () => setConfirmModal(null);

  const submitApproval = async () => {
    const row = confirmModal.row;
    if (!approverName.trim()) {
      showToast("Enter the approver's name", "error");
      return;
    }
    setActingId(row.id);
    try {
      const { fullyApproved, approvalsCount, required } = await db.approveApplication(chamaId, row.id, {
        name: approverName.trim(),
        role: approverRole.trim() || "Committee member",
        decided_at: new Date().toISOString(),
      });

      if (fullyApproved) {
        showToast(`Loan approved for ${row.member_name}. It's now ready for disbursement.`);
      } else {
        showToast(`Sign-off recorded (${approvalsCount}/${required}). Awaiting further approval.`);
      }
      closeModal();
      await loadApplications(chamaId);
    } catch (err) {
      showToast(`Could not process approval: ${err.message}`, "error");
    } finally {
      setActingId(null);
    }
  };

  const submitRejection = async () => {
    const row = confirmModal.row;
    setActingId(row.id);
    try {
      await db.rejectApplication(chamaId, row.id, rejectionReason.trim());
      showToast(`Application from ${row.member_name} rejected`);
      closeModal();
      await loadApplications(chamaId);
    } catch (err) {
      showToast(`Could not reject: ${err.message}`, "error");
    } finally {
      setActingId(null);
    }
  };

  // ---- Export --------------------------------------------------------------

  const exportCSV = () => {
    if (filtered.length === 0) {
      showToast("Nothing to export for the current filters", "error");
      return;
    }
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loan-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  };

  // ---- Render ----------------------------------------------------------

  if (resolvingChama) {
    return (
      <div className="loan-applications">
        <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading your chama...</p></div>
      </div>
    );
  }

  if (chamaError || !chamaId) {
    return (
      <div className="loan-applications">
        <div className="empty-state error">
          <AlertCircle size={24} />
          <p>{chamaError || "No chama selected."}</p>
          <button className="cancel-btn" type="button" onClick={resolveChama}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="loan-applications">
      <div className="module-header">
        <h2><FileText size={20} /> Loan Applications</h2>

        <div className="header-actions">
          <div className="search-box">
            <Search size={14} />
            <input placeholder="Search by member..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <button className="export-btn" onClick={exportCSV} type="button">
            <Download size={16} /> Export
          </button>

          <button className="new-application-btn" onClick={() => setFormOpen((v) => !v)} type="button">
            <Plus size={16} /> New Application
          </button>
        </div>
      </div>

      {!rulesAreCustom && (
        <div className="rules-banner">
          <AlertCircle size={14} />
          This chama is using default loan rules (3x savings, 2 sign-offs). Set custom rules for this chama.
          {onOpenLoanRules && (
            <button type="button" onClick={onOpenLoanRules}>
              <Settings size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} /> Configure
            </button>
          )}
        </div>
      )}

      <div className="stats-dashboard">
        <div className="stat-card">
          <div className="stat-icon pending"><Clock size={18} /></div>
          <div><p className="stat-value">{stats.pendingCount}</p><p className="stat-label">Pending review</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon disbursed"><Wallet size={18} /></div>
          <div><p className="stat-value">{formatKES(stats.totalDisbursed)}</p><p className="stat-label">Total approved</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon rate"><TrendingUp size={18} /></div>
          <div><p className="stat-value">{stats.approvalRate === null ? "—" : `${stats.approvalRate.toFixed(0)}%`}</p><p className="stat-label">Approval rate</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon avg"><Users size={18} /></div>
          <div><p className="stat-value">{formatKES(stats.avgLoanSize)}</p><p className="stat-label">Average loan size</p></div>
        </div>
      </div>

      {formOpen && (
        <div className="application-form">
          <h3><Plus size={18} /> New Loan Application</h3>

          <div className="rules-summary">
            <span>Eligibility: {rules.savings_multiplier}x savings{rules.max_loan_amount ? ` (capped at ${formatKES(rules.max_loan_amount)})` : ""}</span>
            <span>Guarantors: {rules.requires_guarantors ? `${rules.min_guarantors} min, ${rules.guarantor_coverage_percent}% coverage` : "Not required"}</span>
            <span>Security: {rules.requires_security ? "Required" : "Not required"}</span>
            <span>Sign-offs needed: {rules.required_approvals}</span>
          </div>

          {rules.requires_security && (
            <div className="security-note">
              <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} />
              {rules.security_instructions || "This chama requires security/collateral for loans. Confirm arrangements with the applicant before submitting."}
            </div>
          )}

          {membersError && (
            <p className="field-error"><AlertCircle size={12} /> Could not load chama members: {membersError}</p>
          )}
          {!membersLoading && !membersError && members.length === 0 && (
            <p className="field-error"><AlertCircle size={12} /> No members found for this chama yet. Add members before creating a loan application.</p>
          )}

          <form onSubmit={createApplication}>
            <div className="form-row">
              <div className="form-field">
                <select
                  value={applicantId}
                  onChange={(e) => {
                    setApplicantId(e.target.value);
                    setFormErrors((prev) => ({ ...prev, applicant: undefined }));
                    setGuarantors((g) => g.map((row) => (row.memberId === e.target.value ? { ...row, memberId: "" } : row)));
                  }}
                  disabled={membersLoading || members.length === 0}
                >
                  <option value="">{membersLoading ? "Loading members..." : "Select applying member"}</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.member_name}</option>)}
                </select>
                {formErrors.applicant && <span className="field-error">{formErrors.applicant}</span>}
                {eligibility && (
                  <span className="eligibility-badge">
                    <ShieldCheck size={12} />
                    Eligible up to {formatKES(eligibility.limit)} (based on {formatKES(eligibility.contributions)} contributed)
                  </span>
                )}
              </div>

              <div className="form-field">
                <input
                  type="number" min="0" placeholder="Amount Requested (KES)"
                  value={form.requested_amount}
                  onChange={(e) => setForm({ ...form, requested_amount: e.target.value })}
                />
                {formErrors.requested_amount && <span className="field-error">{formErrors.requested_amount}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <input
                  type="number" min="1" placeholder="Repayment Period (months)"
                  value={form.repayment_months}
                  onChange={(e) => setForm({ ...form, repayment_months: e.target.value })}
                />
                {formErrors.repayment_months && <span className="field-error">{formErrors.repayment_months}</span>}
              </div>

              <div className="form-field">
                <input
                  type="number" min="0" step="0.5" placeholder="Interest Rate (%)"
                  value={form.interest_rate}
                  onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                />
              </div>

              <div className="form-field">
                <select value={form.interest_type} onChange={(e) => setForm({ ...form, interest_type: e.target.value })}>
                  <option value="flat_monthly">Flat rate, per month</option>
                  <option value="reducing_annual">Reducing balance, annual</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <textarea placeholder="Purpose of the loan" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              {formErrors.purpose && <span className="field-error">{formErrors.purpose}</span>}
            </div>

            {Number(form.requested_amount) > 0 && Number(form.repayment_months) > 0 && (
              <div className="loan-preview">
                <div className="preview-row"><span>Monthly installment</span><strong>{formatKES(loanPreview.monthlyInstallment)}</strong></div>
                <div className="preview-row"><span>Total interest</span><strong>{formatKES(loanPreview.totalInterest)}</strong></div>
                <div className="preview-row"><span>Total repayable</span><strong>{formatKES(loanPreview.totalRepayable)}</strong></div>
              </div>
            )}

            {rules.requires_guarantors && (
              <div className="guarantor-section">
                <div className="guarantor-header">
                  <span>Guarantors</span>
                  <button
                    type="button" className="add-guarantor-btn" onClick={addGuarantor}
                    disabled={members.length === 0 || guarantors.length >= Math.max(members.length - 1, 0)}
                  >
                    <PlusCircle size={14} /> Add guarantor
                  </button>
                </div>

                <div className="guarantor-list">
                  {guarantors.map((g) => {
                    const options = guarantorOptionsFor(g.id);
                    return (
                      <div className="guarantor-row" key={g.id}>
                        <select value={g.memberId} onChange={(e) => updateGuarantor(g.id, "memberId", e.target.value)} disabled={membersLoading || members.length === 0}>
                          <option value="">{membersLoading ? "Loading members..." : "Select guarantor"}</option>
                          {g.memberId && !options.some((m) => m.id === g.memberId) && (
                            <option value={g.memberId}>{membersById[g.memberId]?.member_name || "Selected member"}</option>
                          )}
                          {options.map((m) => <option key={m.id} value={m.id}>{m.member_name}</option>)}
                        </select>
                        <input type="number" min="0" placeholder="Amount guaranteed" value={g.amount} onChange={(e) => updateGuarantor(g.id, "amount", e.target.value)} />
                        <button type="button" className="remove-guarantor-btn" onClick={() => removeGuarantor(g.id)} disabled={guarantors.length === 1}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {formErrors.guarantors && <span className="field-error">{formErrors.guarantors}</span>}

                {Number(form.requested_amount) > 0 && (
                  <p className={guarantorTotal >= requiredGuarantorCoverage ? "guarantor-coverage ok" : "guarantor-coverage warn"}>
                    Guarantors cover {formatKES(guarantorTotal)} of {formatKES(requiredGuarantorCoverage)} required ({rules.guarantor_coverage_percent}% of loan)
                  </p>
                )}
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="cancel-btn" onClick={() => { resetForm(); setFormOpen(false); }}>Cancel</button>
              <button type="submit" disabled={submitting}>
                {submitting ? (<><Loader2 size={16} className="spin" /> Submitting...</>) : "Submit Application"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-tabs">
          {STATUS_TABS.map((tab) => (
            <button key={tab} className={`tab ${statusTab === tab ? "active" : ""}`} onClick={() => setStatusTab(tab)} type="button">{tab}</button>
          ))}
        </div>
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 size={24} className="spin" /><p>Loading applications...</p></div>
      ) : loadError ? (
        <div className="empty-state error"><AlertCircle size={24} /><p>Could not load applications: {loadError}</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><FileText size={24} /><p>No loan applications match your filters yet.</p></div>
      ) : (
        <div className="application-grid">
          {filtered.map((app) => {
            const { monthlyInstallment, totalRepayable } = calculateLoan({
              amount: app.requested_amount, months: app.repayment_months, rate: app.interest_rate, type: app.interest_type,
            });
            const approvals = app.approvals || [];
            const required = app.required_approvals || DEFAULT_RULES.required_approvals;
            const isPendingLike = app.status === "Pending" || app.status === "Awaiting Approval";

            return (
              <div className="application-card" key={app.id}>
                <div className="card-top">
                  <h3>{app.member_name}</h3>
                  <span className={`status ${app.status.replace(/\s+/g, "-")}`}>{app.status}</span>
                </div>

                <div className="card-body">
                  <p>Amount: <strong>{formatKES(app.requested_amount)}</strong></p>
                  <p>Purpose: {app.purpose}</p>
                  <p>
                    Terms: {app.repayment_months} months at {app.interest_rate ?? 0}%{" "}
                    {app.interest_type === "reducing_annual" ? "(reducing, annual)" : "(flat, monthly)"}
                  </p>
                  <p>Monthly installment: <strong>{formatKES(monthlyInstallment)}</strong> &middot; Total repayable: <strong>{formatKES(totalRepayable)}</strong></p>
                  <p>
                    Guarantors: {(app.guarantors || []).length > 0
                      ? app.guarantors.map((g) => `${g.name} (${formatKES(g.amount)})`).join(", ")
                      : "None on file"}
                  </p>

                  {isPendingLike && required > 1 && (
                    <div className="approval-progress">
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${(approvals.length / required) * 100}%` }} /></div>
                      <span>{approvals.length}/{required} sign-offs{approvals.length > 0 && ` (${approvals.map((a) => a.name).join(", ")})`}</span>
                    </div>
                  )}

                  {app.status === "Rejected" && app.rejection_reason && (
                    <p className="rejection-reason"><AlertCircle size={12} /> {app.rejection_reason}</p>
                  )}
                </div>

                {isPendingLike && (
                  <div className="card-actions">
                    <button className="approve-btn" onClick={() => openApprove(app)} disabled={actingId === app.id}><CheckCircle size={16} /> Approve</button>
                    <button className="reject-btn" onClick={() => openReject(app)} disabled={actingId === app.id}><XCircle size={16} /> Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmModal.type === "approve" ? `Sign off on ${confirmModal.row.member_name}'s loan` : `Reject ${confirmModal.row.member_name}'s application`}</h3>
              <button className="modal-close" onClick={closeModal} type="button"><X size={18} /></button>
            </div>

            {confirmModal.type === "approve" ? (
              <>
                <p className="modal-hint">
                  This records your sign-off as a committee member. Once {confirmModal.row.required_approvals || DEFAULT_RULES.required_approvals}{" "}
                  members have signed off, the application moves to Approved and gets a loan ID for disbursement.
                </p>
                <input placeholder="Your name" value={approverName} onChange={(e) => setApproverName(e.target.value)} />
                <input placeholder="Your role (e.g. Treasurer)" value={approverRole} onChange={(e) => setApproverRole(e.target.value)} />
              </>
            ) : (
              <>
                <p className="modal-hint">Let the member know why this application was declined.</p>
                <textarea placeholder="Reason for rejection (optional but recommended)" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
              </>
            )}

            <div className="modal-actions">
              <button className="cancel-btn" onClick={closeModal} type="button">Cancel</button>
              <button
                className={confirmModal.type === "approve" ? "approve-btn" : "reject-btn"}
                onClick={confirmModal.type === "approve" ? submitApproval : submitRejection}
                disabled={actingId === confirmModal.row.id}
                type="button"
              >
                {actingId === confirmModal.row.id ? <Loader2 size={16} className="spin" /> : confirmModal.type === "approve" ? "Confirm sign-off" : "Confirm rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}