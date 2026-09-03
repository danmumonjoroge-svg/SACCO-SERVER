# Welfare Module — Audit & Roadmap

Audited files: `WelfareCaseDesk.js/.css`, `WelfareEventPlanner.js/.css`,
`WelfareInsightsReport.js/.css`, `welfareFormat.js`.

## A. Current Architecture

Three top-level React components, all Supabase-backed, sharing one helper
module (`welfareFormat.js`):

- **WelfareCaseDesk** — CRUD for `welfare_cases`, with a companion
  `welfare_case_participants` table that stores, per member, whether they
  can see the case (`can_see`) and what they're individually expected to
  contribute (`expected_contribution`). Contributions live in
  `welfare_contributions` (case-scoped) and go through a Pending →
  Approved/Rejected flow. Access is gated with `hasRole` from `ChamaContext`.
- **WelfareEventPlanner** — CRUD for `welfare_events`, with child tables
  `welfare_event_tasks`, `welfare_event_attendance`,
  `welfare_event_contributions`, `welfare_event_comments`,
  `welfare_event_attachments`. Uses Supabase Realtime channels for live
  updates, `@hello-pangea/dnd` for task reordering, `sonner` for toasts,
  and has grid/list/calendar/analytics view modes plus CSV export.
- **WelfareInsightsReport** — read-only, officials-only aggregation view:
  highest/lowest-raising cases, most/least generous members, event status
  counts.
- **welfareFormat.js** — `formatKES`, `csvCell`, `toCSV`. Deliberately thin,
  to stop currency formatting from drifting between files.

Data flow is straightforward: each component owns its own `load()` /
`useCallback` fetch, no shared data-fetching layer, no global state
management beyond `ChamaContext` (role + current chama/member).

## B. Existing Features (already working)

- Case creation with per-member visibility + expected-contribution control
  (this is a good, deliberate design — it puts privacy and individual asks
  in one row rather than two separate mechanisms).
- Contribution approve/reject workflow for cases.
- Case closure with confirmation.
- Event CRUD, recurrence flag, event templates (`event_templates` →
  default task sets on create).
- Event tasks: assignee, due date, priority, drag-to-reorder, completion
  toggle.
- Event attendance (confirmed/maybe/declined) per member.
- Event contributions (member-only, single amount + note).
- Event comments and file attachments (Supabase Storage).
- Event status flow (planned → ongoing → completed → cancelled) with a
  clickable stepper.
- CSV export of the event list, using a properly RFC-4180-escaped `toCSV`
  (a fix already applied over a prior "previous plain template string"
  implementation — noted in the code's own comments).
- Insights report: top/bottom 5 cases and members by amount raised, event
  status breakdown, officials-only gate.
- Role gating throughout via `hasRole([...])`, consistently applied at the
  top of each component.

## C. Missing Features (relative to the full command)

Ranked by how much of the requested lifecycle they block:

1. **No contribution creation path for cases at all.** `WelfareCaseDesk`
   only *approves/rejects* contributions — nothing in the audited files
   ever inserts a row into `welfare_contributions`. Either a member-facing
   component exists elsewhere and wasn't supplied, or this is a real gap.
   Either way it's the single most important missing piece: without it,
   the approve/reject panel has nothing to act on.
2. **No non-member contribution sources.** Both contribution tables
   (`welfare_contributions`, `welfare_event_contributions`) assume a
   `member_id` and nothing else — no external individual, organization,
   or anonymous source, and no payment method/reference field.
3. **No pledges.** Every contribution is treated as fully paid the moment
   it exists; there's no pledged-vs-received distinction anywhere.
4. **No event budget *line items*.** Events have a single `budget` and
   `actual_cost` number each — no category breakdown, no per-line
   approval, no variance by line, no "responsible person per budget line."
5. **No budget revision control.** `actual_cost`/`budget` can be edited
   directly at any time with no history of who changed what or why.
6. **No campaign/contribution-closure workflow.** Cases go straight from
   `open` to `closed`; there's no `closing` state, no "new contributions
   blocked but outstanding pledges surfaced" step.
7. **No dashboard component at all.** None of the three files is a
   dashboard — there's no KPI strip, no alerts, no drill-down, no
   period-over-period comparison anywhere in the Welfare module.
8. **No audit trail.** No file writes to any kind of audit/history table.
   Status changes, approvals, and visibility changes are silent.
9. **No event-day / execution view**, no post-mortem recording, no
   planned-vs-actual for dates/times/attendance beyond the one
   overdue-highlight on task due dates.
10. **No Finance integration.** Contributions and expenses never touch a
    ledger, cashbook, or chart-of-accounts concept — none of that
    infrastructure is visible in the supplied files.
11. **No notification hooks** (task assigned, campaign closing, event
    approaching, etc.) — nothing in these files calls out to a
    notification service.
12. **Contribution visibility is one flag, not several.** Only
    `amount_visible_to_members` exists at the case level, plus a
    per-contribution `amount_visible` flag whose write path isn't in the
    supplied code. The command specifically asks for independent controls
    over: show names / show amounts / show ranking / show anonymous /
    show external / show history.

## D. Weak Features (present but need improvement)

- **Contribution privacy is enforced nowhere but the UI.** `WelfareCaseDesk`
  fetches the full `welfare_contributions` row set for a case
  (`select("*")`) regardless of any visibility flag — the flag only ever
  changes what's *rendered*. For officials this is fine (they're meant to
  see everything), but if any member-facing component reuses this same
  query pattern, a member could read the network response and see
  "hidden" identities/amounts regardless of the UI. This needs enforcement
  at the RLS/query level, not just conditional JSX.
- **`beneficiary_name` is denormalized onto `welfare_cases` at write time**
  (`members.find(...)?.name`). If the member is later renamed, the case
  keeps the stale name forever. Minor, but worth flagging since the spec
  asks not to duplicate member data.
- **Event budget is two flat numbers with no reconciliation step** — easy
  to lose track of what actually happened vs. what was planned once an
  event has more than a couple of expense categories.
- **Task model has priority/due-date but no planned-start vs
  actual-completion timestamps**, so post-event analysis of "did things
  run on time" isn't possible yet.
- **`EventAnalytics` and `WelfareInsightsReport` overlap conceptually**
  (both are "aggregate and rank") but are built as two independent,
  non-shared implementations. Not a bug, but worth consolidating later so
  KPI logic doesn't drift the way currency formatting once did.
- **Case closure blocks nothing.** Closing a case with unresolved pending
  contributions or unaccounted pledges is currently allowed with just a
  generic confirm dialog.

## E. Duplicate Features / Overlap

- Currency formatting was already deduplicated into `welfareFormat.js` —
  good, no action needed.
- `EventAnalytics` (inside `WelfareEventPlanner.js`) and
  `WelfareInsightsReport` both compute "totals and rankings" from
  overlapping data. Not true duplication (different data sets — events vs.
  cases/members) but the same *kind* of logic is written twice. Recommend
  a shared `useWelfareStats` hook in a later pass rather than a third
  bespoke implementation in the new Dashboard (see below — the Dashboard
  built in this pass reuses the same query shapes rather than inventing a
  fourth aggregation style).

## F. Database Issues

- `welfare_contributions` / `welfare_event_contributions`: `member_id`
  should become nullable, with a `source_type` discriminator, so
  non-member sources don't require a fabricated member row.
- No columns anywhere for: payment method, reference/transaction number,
  pledge amount vs. received amount, contributor name/contact for
  non-member sources.
- No `welfare_event_budget_lines` table — budget is currently scalar.
- No audit table referenced by these files. If the wider ERP already has
  a generic `audit_log`, these files don't use it (nothing to reuse
  against in the supplied code — flagged as an integration assumption
  below, not invented).
- No table backs "visibility settings" beyond two booleans on
  `welfare_cases`.

`migrations.sql` in this delivery adds the minimum schema needed for the
P0/P1 items below, additively (new nullable columns, new tables) — nothing
in the existing schema is dropped or renamed.

## G. Workflow Issues

- Contribution approval has no rejection reason field — a rejected
  contributor has no way to know why.
- Case status is binary (open/closed) with no "closing" transitional
  state, so there's no clean way to say "stop accepting new money, but
  we're still chasing three pledges."
- Event status stepper lets an official jump any number of steps forward
  in one click (`onClick={() => advanceStatus(s)}` for every step, not
  just the next one) — there's no guard against skipping "completed"
  straight from "planned," which undermines the planned lifecycle.

## H. Finance Issues

None of the supplied files call into a Finance/GL/cashbook module. This
audit does not invent one. The correct fix is integration, not a parallel
ledger — this delivery adds a clearly marked `// TODO: FINANCE INTEGRATION`
hook at each point money changes hands (contribution approved, pledge
received, expense recorded) so whoever owns the real Finance module has an
exact, obvious point to wire in, rather than the Welfare module quietly
becoming a second set of books.

## I. Security Issues

- Contributor identity is only hidden client-side (see D above). This is
  the most important security finding: **treat it as P0**. Real fix
  requires Postgres RLS policies (or an RPC/view that pre-filters columns
  server-side) keyed off the same visibility flags. This delivery adds
  the RLS policy *shape* in `migrations.sql` as a starting point, but it
  must be adapted to your actual `chama_members`/auth setup and tested —
  I have not seen your RLS/auth schema so I'm not claiming these are
  drop-in-safe as written.
- No audit trail means a disputed approval/rejection or a visibility
  change has no record of who did it or why.
- `hasRole` is the only gate in view; nothing in the supplied files
  suggests server-side role checks duplicate it, which is worth
  confirming with whoever owns Supabase RLS for this project.

## J. Dashboard Issues

There is no dashboard in the supplied files at all — this is the biggest
single gap relative to the command. `WelfareDashboard.js` in this delivery
addresses KPIs, alerts, pending actions, and per-event progress, built
from the same tables the other three components already use (no schema
change required for the dashboard itself). Drill-down is implemented as an
`onNavigate(view, filter)` callback prop, since routing lives outside the
files I was given — the host app wires it to real navigation.

## K. Recommended File Changes

| File | Action | Why |
|---|---|---|
| `welfareFormat.js` | **Modify** | Add shared constants (contribution sources, payment methods), a defensive `logAudit()` helper, and pledge/status label helpers, so the new UI in every file stays consistent. |
| `WelfareCaseDesk.js` / `.css` | **Modify** | Add contribution recording (the missing insert path), source types, pledges, granular visibility settings, closure guard against outstanding pledges. |
| `WelfareEventPlanner.js` / `.css` | **Modify** | Add a Budget tab with line items, extend event contributions with source type + pledge, add audit logging on status/cost changes, guard the status stepper to one step at a time. |
| `WelfareInsightsReport.js` / `.css` | **Modify** | Add a "Contributions by source" panel now that source data exists. |
| `WelfareDashboard.js` / `.css` | **Create** | The missing operational dashboard (KPIs, alerts, pending actions, upcoming events, per-event progress). |
| `migrations.sql` | **Create** | Additive schema for source types, pledges, visibility columns, event budget lines. |
| `README.md` | **Create** | Wiring instructions, assumptions, and explicit list of what still needs the real Finance/EDRMS/notification modules. |
| Finance / EDRMS / notification modules | **Keep unchanged** | Not supplied, not duplicated — integration points are marked instead. |

## Priority Classification

- **P0 (this delivery):** contributor-privacy enforcement design (RLS
  shape provided; must be reviewed by whoever owns your auth schema),
  missing contribution-creation path, closure allowing unresolved pledges.
- **P1 (this delivery):** contribution sources (member/external/org/
  anonymous), pledges, granular visibility flags, event budget line items,
  operational dashboard, audit logging hooks.
- **P2 (roadmap, not built here):** budget revision history, event-day
  execution view, post-mortem recording, guarded single-step status
  advancement, shared stats hook to de-duplicate `EventAnalytics` vs.
  `WelfareInsightsReport`.
- **P3 (roadmap, not built here):** notification integration, Finance/GL
  integration, EDRMS document integration, recurring-event auto-generation
  from `recurrence_rule` (currently stored but nothing consumes it).

P2/P3 items are genuinely dependent on modules I wasn't given (Finance,
EDRMS, notifications) or are larger structural changes best done as a
follow-up once P0/P1 are reviewed — implementing them blind would mean
guessing at APIs that may already exist elsewhere in your ERP, which is
exactly what the brief said not to do.
