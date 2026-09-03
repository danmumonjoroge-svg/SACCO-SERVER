// -----------------------------------------------------------------------------
// welfareFormat
// Small shared helpers used by WelfareCaseDesk, WelfareEventPlanner,
// WelfareInsightsReport and WelfareDashboard. Pulled out so currency
// formatting, contribution-source vocabulary, and audit logging can't drift
// between components.
// -----------------------------------------------------------------------------
import { supabase } from "../../supabaseClient";

/** Format a number as KES currency, e.g. formatKES(15000) -> "KES 15,000" */
export function formatKES(v) {
  return `KES ${Number(v || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

/**
 * Safely escape a value for inclusion in a CSV cell.
 * Wraps in quotes and doubles any embedded quotes, per RFC 4180.
 */
export function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Build a CSV string from an array of plain objects, using the keys of the first row as headers. */
export function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Contribution sources — a contribution is not always a member (section 14-15
// of the welfare spec: member, external individual, organization, anonymous).
// -----------------------------------------------------------------------------
export const CONTRIBUTION_SOURCES = [
  { value: "member", label: "Chama member" },
  { value: "external", label: "External individual" },
  { value: "organization", label: "Organization" },
  { value: "anonymous", label: "Anonymous" },
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

/** Human label for a contribution's source, falling back sensibly. */
export function sourceLabel(sourceType) {
  return CONTRIBUTION_SOURCES.find((s) => s.value === sourceType)?.label || "Unknown source";
}

/**
 * Display name for a contribution row, respecting anonymity — never surfaces
 * a name for an anonymous contribution regardless of what's stored.
 */
export function contributorDisplayName(contribution, memberNameLookup) {
  if (contribution.source_type === "anonymous") return "Anonymous";
  if (contribution.source_type === "member") {
    return memberNameLookup?.(contribution.member_id) || "Unknown member";
  }
  return contribution.contributor_name || sourceLabel(contribution.source_type);
}

/**
 * Outstanding amount on a contribution. Non-pledges are fully "received" by
 * definition; pledges track amount_received against pledged_amount.
 */
export function outstandingAmount(contribution) {
  if (!contribution.is_pledge) return 0;
  const pledged = Number(contribution.pledged_amount ?? contribution.amount ?? 0);
  const received = Number(contribution.amount_received ?? 0);
  return Math.max(0, pledged - received);
}

export function pledgeStatusLabel(contribution) {
  if (!contribution.is_pledge) return null;
  const outstanding = outstandingAmount(contribution);
  if (outstanding <= 0) return "Fulfilled";
  const received = Number(contribution.amount_received ?? 0);
  return received > 0 ? "Partially received" : "Outstanding";
}

// -----------------------------------------------------------------------------
// Audit logging — best-effort, defensive. If the wider ERP doesn't have an
// audit_log table yet (see migrations.sql) this fails silently rather than
// breaking the user-facing action it's attached to; a console warning is
// left so it's visible in development without blocking the UI.
// -----------------------------------------------------------------------------
export async function logAudit({ chamaId, actorMemberId, module, action, entityId, previousValue, newValue, reason }) {
  try {
    const { error } = await supabase.from("audit_log").insert([{
      chama_id: chamaId,
      actor_member_id: actorMemberId || null,
      module,
      action,
      entity_id: entityId || null,
      previous_value: previousValue ?? null,
      new_value: newValue ?? null,
      reason: reason || null,
    }]);
    if (error) console.warn("welfare audit log write failed (non-fatal):", error.message);
  } catch (e) {
    console.warn("welfare audit log write failed (non-fatal):", e);
  }
}

/** Days until (positive) or since (negative) a date string, or null if no date. */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}
