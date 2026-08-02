import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { v4 as uuidv4 } from "uuid";

import { LOAN_POLICY } from "./loanPolicy";
import {
  loadLoanContext,
  buildEvaluationContext,
  evaluateLoanApplication,
  formatDecisionMessage,
  insertLoanApplication,
  formatMoney,
  toNumber,
} from "./loanEngineService";

/**
 * LoanEngine
 * ---------------------------------------------------------------------------
 * Loan origination screen for the Umova ERP.
 *
 * The component is now presentation only: it collects the application, asks
 * `loanEngineService` for a decision, and renders it. No credit policy lives
 * in this file — see `loanPolicy.js`.
 *
 * Everything from the previous version is preserved: member lookup from
 * localStorage, savings/income/score/limit summary, the same form fields and
 * options, PDF-only multi-document upload, and submission to `loans` +
 * `loan_documents` + the `loan-documents` storage bucket.
 * ---------------------------------------------------------------------------
 */
const LoanEngine = () => {
  /* =======================================================================
   * MEMBER
   * ===================================================================== */
  const member = useMemo(() => {
    try {
      const stored = localStorage.getItem("member");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const memberNo = member?.member_no;

  /* =======================================================================
   * STATE
   * ===================================================================== */
  // Loaded member data (ledger, loans, repayments) — the engine's input.
  const [loanContext, setLoanContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Application form (unchanged fields).
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState(3);
  const [loanType, setLoanType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [security, setSecurity] = useState("");
  const [guarantorCount, setGuarantorCount] = useState(0);
  const [documents, setDocuments] = useState([]);

  // Submission.
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("neutral"); // neutral | ok | warn | error
  const [showDetail, setShowDetail] = useState(false);

  /* =======================================================================
   * LOAD DATA
   * ===================================================================== */
  const loadData = useCallback(async () => {
    if (!memberNo) return;

    setLoading(true);
    setLoadError("");

    try {
      const data = await loadLoanContext(supabase, memberNo);
      setLoanContext(data);

      // Surface partially-loaded data rather than failing silently.
      const missing = Object.entries(data.sources)
        .filter(([, ok]) => !ok)
        .map(([name]) => name);
      if (missing.length > 0) {
        setLoadError(
          `Some records could not be read (${missing.join(", ")}). The assessment below uses the data that was available.`
        );
      }
    } catch (err) {
      console.error("LOAN ENGINE LOAD ERROR:", err);
      setLoanContext(null);
      setLoadError("Member records could not be loaded. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [memberNo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* =======================================================================
   * EVALUATION
   * ---------------------------------------------------------------------
   * Recomputed only when the loaded data or the form actually changes, so
   * the ledger is summarised once per change instead of once per render.
   * ===================================================================== */
  const evaluation = useMemo(() => {
    if (!loanContext) return null;

    const context = buildEvaluationContext(
      loanContext,
      {
        amount,
        months,
        loanType,
        purpose,
        security,
        guarantors: guarantorCount,
        documents,
      },
      LOAN_POLICY
    );

    return { context, decision: evaluateLoanApplication(context, LOAN_POLICY) };
  }, [loanContext, amount, months, loanType, purpose, security, guarantorCount, documents]);

  // Summary figures shown at the top of the screen.
  const savings = evaluation?.context.totalSavings ?? 0;
  const monthlyIncome = evaluation?.context.monthlyIncome ?? 0;
  const score = evaluation?.context.creditScore ?? 0;
  const limit = evaluation?.context.loanLimit ?? 0;
  const decision = evaluation?.decision ?? null;

  // A form that has not been filled in yet should not shout "declined".
  const formStarted = Boolean(loanType || security || amount);

  /* =======================================================================
   * FILE HANDLER
   * ---------------------------------------------------------------------
   * Selection is append-safe as before. Validation itself now lives in the
   * DOCUMENTS rule group, so the same checks apply on submit.
   * ===================================================================== */
  const handleFiles = (e) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length === 0) return;

    const combined = [...documents, ...newFiles];
    setDocuments(combined);
    setStatus(`📎 ${combined.length} document(s) selected`);
    setStatusTone("neutral");

    // Allow the same file to be re-selected after removal.
    e.target.value = "";
  };

  const removeDocument = (index) => {
    setDocuments((files) => files.filter((_, i) => i !== index));
  };

  /* =======================================================================
   * APPLY LOAN
   * ===================================================================== */
  const applyLoan = async () => {
    if (!evaluation || submitting) return;

    const { context, decision: result } = evaluation;

    // Blocking rules stop the submission; warnings do not.
    if (!result.eligible) {
      setStatus(formatDecisionMessage(result));
      setStatusTone("error");
      setShowDetail(true);
      return;
    }

    setSubmitting(true);
    setStatus("Submitting application…");
    setStatusTone("neutral");

    try {
      /* ---- STEP 1: CREATE LOAN RECORD --------------------------------- */
      // Base payload matches the existing `loans` table exactly.
      const basePayload = {
        member_no: memberNo,
        amount: toNumber(amount),
        months: toNumber(months),
        loan_type: loanType,
        purpose,
        security,
        // Kept as "pending" for both APPROVED and REFER — the approval chain
        // owns the transition. The distinction is carried in `decision`.
        status: "pending",
        score: result.creditScore,
      };

      // Appraisal fields — saved only if the columns exist.
      const extendedPayload = {
        risk_score: result.riskScore,
        decision: result.decision,
        classification: result.classification?.code || null,
        monthly_repayment: result.monthlyRepayment,
        debt_service_ratio: result.debtServiceRatio,
        recommended_amount: result.recommendedAmount,
        recommended_limit: result.recommendedLimit,
        appraisal_notes: [...result.reasons, ...result.warnings, ...result.conditions].join(" | ") || null,
      };

      const { data, error, degraded } = await insertLoanApplication(
        supabase,
        basePayload,
        extendedPayload
      );

      if (error) {
        console.error("LOAN INSERT ERROR:", error);
        setStatus("❌ The application could not be submitted. No record was created — try again.");
        setStatusTone("error");
        return;
      }

      const loanId = data.id;

      /* ---- STEP 2: UPLOAD DOCUMENTS ----------------------------------- */
      const uploadResult = await uploadDocuments(loanId);

      /* ---- STEP 3: REPORT --------------------------------------------- */
      const lines = [];
      lines.push(
        result.decision === "REFER"
          ? "✅ Application submitted and referred to the credit committee."
          : "✅ Application submitted successfully."
      );
      lines.push(`Reference: ${loanId}`);

      if (uploadResult.failed.length > 0) {
        lines.push(
          `⚠️ ${uploadResult.failed.length} document(s) did not upload: ${uploadResult.failed.join(", ")}. Re-attach them from the loan record.`
        );
      } else if (uploadResult.uploaded > 0) {
        lines.push(`${uploadResult.uploaded} document(s) attached.`);
      }

      if (degraded) {
        lines.push("Note: appraisal fields were not stored — the loans table has not been migrated.");
      }
      if (result.warnings.length > 0) {
        lines.push("Review points:");
        lines.push(result.warnings.map((w) => `• ${w}`).join("\n"));
      }

      setStatus(lines.join("\n"));
      setStatusTone(uploadResult.failed.length > 0 ? "warn" : "ok");

      // Reset the form and refresh exposure so limits reflect the new loan.
      setAmount("");
      setPurpose("");
      setDocuments([]);
      await loadData();
    } catch (err) {
      console.error("LOAN SUBMISSION ERROR:", err);
      setStatus("❌ An unexpected error stopped the submission. Try again, or contact support if it persists.");
      setStatusTone("error");
    } finally {
      setSubmitting(false);
    }
  };

  /* =======================================================================
   * DOCUMENT UPLOAD
   * ---------------------------------------------------------------------
   * Same bucket, same path scheme, same `loan_documents` insert as before.
   * Failures are now collected and reported instead of only logged.
   * ===================================================================== */
  const uploadDocuments = async (loanId) => {
    const uploaded = [];
    const failed = [];

    for (const file of documents) {
      const path = `${memberNo}/${loanId}/${uuidv4()}-${file.name}`;

      try {
        const { error: uploadError } = await supabase.storage
          .from("loan-documents")
          .upload(path, file);

        if (uploadError) {
          console.error("UPLOAD ERROR:", file.name, uploadError);
          failed.push(file.name);
          continue;
        }

        const { data } = supabase.storage.from("loan-documents").getPublicUrl(path);

        uploaded.push({
          loan_id: loanId,
          member_no: memberNo,
          file_name: file.name,
          file_url: data.publicUrl,
        });
      } catch (err) {
        console.error("UPLOAD EXCEPTION:", file.name, err);
        failed.push(file.name);
      }
    }

    if (uploaded.length > 0) {
      const { error: insertError } = await supabase.from("loan_documents").insert(uploaded);
      if (insertError) {
        console.error("DOCUMENT INDEX ERROR:", insertError);
        // Files are in storage but not indexed — report them as failed so the
        // officer re-attaches rather than assuming they are on the record.
        return { uploaded: 0, failed: [...failed, ...uploaded.map((u) => u.file_name)] };
      }
    }

    return { uploaded: uploaded.length, failed };
  };

  /* =======================================================================
   * GUARDS
   * ===================================================================== */
  if (!memberNo) {
    return <div style={{ padding: 20 }}>Loading loan engine…</div>;
  }

  /* =======================================================================
   * UI
   * ===================================================================== */
  const decisionTone =
    decision?.decision === "DECLINED"
      ? "error"
      : decision?.decision === "REFER"
      ? "warn"
      : "ok";

  return (
    <div style={{ padding: 20 }}>
      <h2>🏦 Loan Engine</h2>

      {/* LOAD ERROR */}
      {loadError && (
        <div style={{ ...banner, ...toneStyles.warn }}>
          {loadError}{" "}
          <button onClick={loadData} style={linkBtn} type="button">
            Retry
          </button>
        </div>
      )}

      {/* SUMMARY */}
      <div style={box}>
        {loading ? (
          <p style={{ margin: 0 }}>Reading member records…</p>
        ) : (
          <>
            <p>Savings: {formatMoney(savings)}</p>
            <p>Monthly income (estimated): {formatMoney(monthlyIncome)}</p>
            <p>Score: {score}%</p>
            <p>Loan Limit: {formatMoney(limit)}</p>
            {evaluation?.context.loanSummary.activeCount > 0 && (
              <p>
                Existing loans: {evaluation.context.loanSummary.activeCount} ·
                Outstanding {formatMoney(evaluation.context.loanSummary.outstandingTotal)} ·
                Classified {evaluation.context.loanSummary.classification.label}
              </p>
            )}
          </>
        )}
      </div>

      {/* LOAN TYPE */}
      <select
        value={loanType}
        onChange={(e) => setLoanType(e.target.value)}
        style={input}
        disabled={submitting}
      >
        <option value="">Select Loan Type</option>
        <option value="emergency">Emergency</option>
        <option value="school_fees">School Fees</option>
        <option value="business">Business</option>
        <option value="asset">Asset Purchase</option>
        <option value="development">Development</option>
        <option value="personal">Personal</option>
      </select>

      {/* PURPOSE */}
      <input
        placeholder="Purpose"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        style={input}
        disabled={submitting}
      />

      {/* SECURITY */}
      <select
        value={security}
        onChange={(e) => setSecurity(e.target.value)}
        style={input}
        disabled={submitting}
      >
        <option value="">Select Security</option>
        <option value="own_deposit">Own Deposit</option>
        <option value="logbook">Logbook</option>
        <option value="guarantor">Guarantor</option>
        <option value="chattel">Chattel</option>
        <option value="others">Others</option>
      </select>

      {/* GUARANTORS — only relevant when guarantors are the security */}
      {security === "guarantor" && (
        <input
          placeholder={`Number of guarantors (minimum ${LOAN_POLICY.security.minGuarantors})`}
          value={guarantorCount}
          onChange={(e) => setGuarantorCount(e.target.value.replace(/[^0-9]/g, ""))}
          style={input}
          inputMode="numeric"
          disabled={submitting}
        />
      )}

      {/* AMOUNT + MONTHS */}
      <input
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={input}
        inputMode="decimal"
        disabled={submitting}
      />

      <input
        placeholder="Months"
        value={months}
        onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ""))}
        style={input}
        inputMode="numeric"
        disabled={submitting}
      />

      {/* FILE UPLOAD */}
      <div style={{ marginTop: 10 }}>
        <p>
          Upload Documents (PDF only, max {LOAN_POLICY.documents.maxFiles})
          {loanType && (
            <span style={{ display: "block", fontSize: 12, color: "#555" }}>
              Required for this loan type:{" "}
              {(
                LOAN_POLICY.documents.requiredByLoanType[loanType] ||
                LOAN_POLICY.documents.defaultRequired
              ).join(", ")}
            </span>
          )}
        </p>

        <input
          type="file"
          multiple
          accept="application/pdf"
          onChange={handleFiles}
          disabled={submitting}
        />

        <ul>
          {documents.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`}>
              {f.name}{" "}
              <button onClick={() => removeDocument(i)} style={linkBtn} type="button" disabled={submitting}>
                remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* LIVE APPRAISAL */}
      {!loading && decision && formStarted && (
        <div style={{ ...banner, ...toneStyles[decisionTone] }}>
          <strong>{headline[decision.decision]}</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Risk score {decision.riskScore}/100 · Credit score {decision.creditScore}% ·
            Repayment {formatMoney(decision.monthlyRepayment)}/month
            {decision.debtServiceRatio !== null &&
              ` · DSR ${Math.round(decision.debtServiceRatio * 100)}%`}
          </div>

          {decision.reasons.length > 0 && (
            <>
              <p style={listHeading}>Reason:</p>
              <ul style={list}>
                {decision.reasons.map((reason, i) => (
                  <li key={`r-${i}`}>{reason}</li>
                ))}
              </ul>
            </>
          )}

          {decision.warnings.length > 0 && (
            <>
              <p style={listHeading}>Review points:</p>
              <ul style={list}>
                {decision.warnings.map((w, i) => (
                  <li key={`w-${i}`}>{w}</li>
                ))}
              </ul>
            </>
          )}

          {decision.conditions.length > 0 && (
            <>
              <p style={listHeading}>Conditions before disbursement:</p>
              <ul style={list}>
                {decision.conditions.map((c, i) => (
                  <li key={`c-${i}`}>{c}</li>
                ))}
              </ul>
            </>
          )}

          {decision.recommendedAmount > 0 && decision.recommendedAmount < toNumber(amount) && (
            <p style={{ marginBottom: 0 }}>
              The member currently qualifies for up to {formatMoney(decision.recommendedAmount)}.
            </p>
          )}

          <button onClick={() => setShowDetail((v) => !v)} style={linkBtn} type="button">
            {showDetail ? "Hide checks" : "Show all checks"}
          </button>

          {showDetail && (
            <ul style={list}>
              {decision.rules.map((rule, i) => (
                <li key={`${rule.code}-${i}`}>
                  {rule.passed ? "✅" : rule.severity === "BLOCK" ? "⛔" : rule.severity === "WARNING" ? "⚠️" : "ℹ️"}{" "}
                  <code style={{ fontSize: 11 }}>{rule.code}</code> — {rule.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* BUTTON */}
      <button
        onClick={applyLoan}
        style={{ ...btn, opacity: loading || submitting ? 0.6 : 1 }}
        disabled={loading || submitting}
        type="button"
      >
        {submitting ? "Submitting…" : "Apply Loan"}
      </button>

      {/* STATUS */}
      {status && (
        <pre style={{ ...statusBox, ...toneStyles[statusTone] }}>{status}</pre>
      )}
    </div>
  );
};

/* =========================================================================
 * PRESENTATION HELPERS
 * ========================================================================= */
const headline = {
  APPROVED: "✅ Loan eligible for submission.",
  REFER: "⚠️ Eligible — referred for credit committee review.",
  DECLINED: "❌ Loan declined.",
};

/* =========================================================================
 * STYLES (original palette preserved)
 * ========================================================================= */
const box = {
  background: "#f5f5f5",
  padding: 10,
  marginBottom: 10,
};

const input = {
  display: "block",
  marginTop: 10,
  padding: 8,
  width: "100%",
};

const btn = {
  marginTop: 15,
  padding: "10px 15px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const linkBtn = {
  background: "none",
  border: "none",
  color: "#2563eb",
  cursor: "pointer",
  padding: 0,
  font: "inherit",
  textDecoration: "underline",
};

const banner = {
  marginTop: 15,
  padding: 12,
  borderRadius: 8,
  borderLeft: "4px solid",
  fontSize: 14,
};

const statusBox = {
  ...banner,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
};

const listHeading = { margin: "8px 0 2px", fontWeight: 600 };
const list = { margin: "0 0 6px", paddingLeft: 18 };

const toneStyles = {
  neutral: { background: "#f1f5f9", borderColor: "#64748b" },
  ok: { background: "#ecfdf5", borderColor: "#059669" },
  warn: { background: "#fffbeb", borderColor: "#d97706" },
  error: { background: "#fef2f2", borderColor: "#dc2626" },
};

export default LoanEngine;