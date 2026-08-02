/**
 * loanPolicy.js
 * ---------------------------------------------------------------------------
 * Single source of truth for every threshold the loan engine uses.
 *
 * Nothing in the rule engine hardcodes a number — every limit, ratio, window
 * and bucket lives here so credit policy can be changed (or later moved into a
 * `loan_policies` table per tenant) without touching business logic or UI.
 *
 * Defaults follow SASRA prudential guidance for Kenyan deposit-taking SACCOs:
 *   - 33% debt service ratio ceiling
 *   - 90-day arrears gate for further borrowing
 *   - Five-bucket loan classification (Performing / Watch / Substandard /
 *     Doubtful / Loss)
 * ---------------------------------------------------------------------------
 */

export const LOAN_POLICY = {
  /* ---------------------------------------------------------------- dates */
  dates: {
    // Any date older than this is treated as corrupt data, never as a real
    // event. This is what stops "20,630 days overdue" (Unix epoch) reaching
    // the screen.
    minValidDate: "2000-01-01",
    // Small tolerance for clock skew / timezone drift on future dates.
    maxFutureDays: 1,
    // Anything beyond this is implausible for an operating SACCO account and
    // is reported as a data-quality issue instead of a number.
    maxPlausibleDays: 3650, // 10 years
  },

  /* ----------------------------------------------------------- membership */
  membership: {
    minAgeYears: 18,
    maxAgeYears: 70,
    minMembershipMonths: 6,
    activeStatuses: ["active", "ACTIVE", "1", "true"],
    suspendedStatuses: ["suspended", "dormant", "frozen", "on_hold"],
    closedStatuses: ["closed", "exited", "terminated", "deceased", "withdrawn"],
  },

  /* -------------------------------------------------------------- savings */
  savings: {
    minimumSavings: 5000,
    // Consistency = months with at least one savings credit, inside the window.
    consistencyWindowMonths: 6,
    minConsistentMonths: 3,
    // Score band -> savings multiplier. Evaluated top-down, first match wins.
    multiplierBands: [
      { minScore: 80, multiplier: 3 },
      { minScore: 65, multiplier: 2.5 },
      { minScore: 51, multiplier: 2 },
      { minScore: 40, multiplier: 1.5 },
      { minScore: 0, multiplier: 1 },
    ],
    absoluteMaxMultiplier: 3,
    // GL account code for member deposits (UBOS chart of accounts).
    savingsAccountCode: "1018",
  },

  /* --------------------------------------------------------- active loans */
  activeLoans: {
    maxConcurrentLoans: 2,
    // Total outstanding (existing + requested) may not exceed savings × this.
    maxOutstandingToSavingsRatio: 3,
    // A loan must be this far repaid before it can be topped up / refinanced.
    minRepaidRatioForRefinance: 0.5,
    // Restructured accounts serve a cooling-off period before new credit.
    restructureCoolingOffMonths: 6,
    restructuredStatuses: ["restructured", "rescheduled", "rolled_over"],
    activeStatuses: ["active", "disbursed", "running", "approved", "arrears"],
    pendingStatuses: ["pending", "submitted", "under_review", "appraisal"],
    closedStatuses: ["closed", "settled", "paid", "cleared", "written_off", "rejected", "declined"],
  },

  /* ----------------------------------------------------------- repayment */
  repayment: {
    // SASRA further-borrowing gate.
    maxDaysInArrears: 90,
    // Internal (stricter) tolerance before an application is referred.
    warnDaysInArrears: 30,
    maxMissedInstalments: 2,
    warnMissedInstalments: 1,
    // A silent account is a risk signal even without formal arrears.
    maxDaysSinceLastRepayment: 60,
    warnDaysSinceLastRepayment: 45,
    // paid instalments / expected instalments
    minConsistencyRatio: 0.7,
    warnConsistencyRatio: 0.85,
  },

  /* ------------------------------------------------------ classification */
  classification: {
    // SASRA five-bucket model. `maxDays` is inclusive, evaluated top-down.
    buckets: [
      { code: "PERFORMING",  label: "Performing",  maxDays: 30,       provisionRate: 0.01, allowRefinance: true,  riskWeight: 0 },
      { code: "WATCH",       label: "Watch",       maxDays: 180,      provisionRate: 0.05, allowRefinance: false, riskWeight: 15 },
      { code: "SUBSTANDARD", label: "Substandard", maxDays: 360,      provisionRate: 0.25, allowRefinance: false, riskWeight: 30 },
      { code: "DOUBTFUL",    label: "Doubtful",    maxDays: 540,      provisionRate: 0.50, allowRefinance: false, riskWeight: 45 },
      { code: "LOSS",        label: "Loss",        maxDays: Infinity, provisionRate: 1.00, allowRefinance: false, riskWeight: 60 },
    ],
    // Buckets that block any new borrowing outright.
    blockingBuckets: ["SUBSTANDARD", "DOUBTFUL", "LOSS"],
    // Buckets that block refinancing but may still be referred for a new loan.
    refinanceBlockingBuckets: ["WATCH", "SUBSTANDARD", "DOUBTFUL", "LOSS"],
  },

  /* ------------------------------------------------------- affordability */
  affordability: {
    maxDebtServiceRatio: 0.33, // SASRA one-third rule
    warnDebtServiceRatio: 0.3,
    minDisposableIncome: 3000,
    requireIncomeVerification: true,
    // Months of ledger history used to estimate monthly income.
    incomeWindowMonths: 6,
    // Interest applied when projecting the instalment. Set per product; kept
    // at zero by default so existing repayment figures do not shift.
    annualInterestRate: 0,
    interestMethod: "reducing", // "reducing" | "flat"
    minMonths: 1,
    maxMonths: 48,
    minAmount: 1000,
  },

  /* ------------------------------------------------------------ security */
  security: {
    // Cover required over the requested amount, by security type.
    coverageRatio: {
      own_deposit: 1,
      guarantor: 1,
      logbook: 1.5,
      chattel: 2,
      others: 2,
    },
    minGuarantors: 2,
    maxGuarantorExposureRatio: 1, // a guarantor's free deposits must cover their share
    // Loan amount above which security is mandatory regardless of type.
    unsecuredCeiling: 50000,
    // Security types requiring a valuation / registered charge before release.
    requiresValuation: ["logbook", "chattel", "others"],
  },

  /* ----------------------------------------------------------- documents */
  documents: {
    maxFiles: 10,
    minFiles: 1,
    allowedMimeTypes: ["application/pdf"],
    maxFileSizeMb: 5,
    // Required supporting documents per loan type.
    requiredByLoanType: {
      emergency:   ["National ID copy"],
      school_fees: ["National ID copy", "Fee structure or admission letter"],
      business:    ["National ID copy", "Business permit", "6-month bank or M-Pesa statement"],
      asset:       ["National ID copy", "Proforma invoice", "Ownership or logbook copy"],
      development: ["National ID copy", "Title deed or approved plan", "Contractor quotation"],
      personal:    ["National ID copy", "Payslip or proof of income"],
    },
    defaultRequired: ["National ID copy"],
  },

  /* --------------------------------------------------------------- fraud */
  fraud: {
    duplicateWindowHours: 24,
    duplicateAmountTolerance: 0.05, // ±5% of a recent application = duplicate
    maxPendingApplications: 1,
    maxApplicationsPerMonth: 3,
    // Member fields that must be present before an application is accepted.
    requiredMemberFields: ["member_no"],
  },

  /* ------------------------------------------------------------ decision */
  decision: {
    // Risk score is 0–100 where higher = riskier.
    referThreshold: 45,
    declineThreshold: 70,
    // Contribution of each failed rule to the risk score.
    severityWeight: { BLOCK: 25, WARNING: 10, INFO: 3 },
    // Weight of the inverse credit score in the risk score.
    creditScoreWeight: 0.3,
  },

  /* -------------------------------------------------------- credit score */
  creditScore: {
    base: 50,
    savingsBonusThreshold: 5000,
    savingsBonus: 20,
    incomeBonusThreshold: 10000, // monthly income
    incomeBonus: 10,
    tenureBonusMonths: 24,
    tenureBonus: 10,
    cleanHistoryBonus: 10,
    arrearsPenalty: 20,
    classificationPenalty: { PERFORMING: 0, WATCH: 10, SUBSTANDARD: 25, DOUBTFUL: 35, LOSS: 50 },
    minScoreToBorrow: 40,
  },
};

export default LOAN_POLICY;