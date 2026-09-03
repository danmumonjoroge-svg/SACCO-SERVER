# Welfare Module Upgrade — What's in this folder

Start with `AUDIT_AND_ROADMAP.md` — it's the required audit (architecture,
existing/missing/weak features, DB/workflow/finance/security findings,
priority classification) that the brief asked for before any code changes.
Everything below is what was actually implemented against that audit.

## Files

| File | Status |
|---|---|
| `AUDIT_AND_ROADMAP.md` | New — the audit deliverable |
| `migrations.sql` | New — additive schema (run before deploying the updated components) |
| `welfareFormat.js` | Modified — new shared constants + `logAudit()` helper |
| `WelfareCaseDesk.js` / `.css` | Modified — contribution recording, sources, pledges, granular visibility, closure guard |
| `WelfareEventPlanner.js` / `.css` | Modified — budget line items tab, contribution sources/pledges, guarded status stepper, audit hooks |
| `WelfareInsightsReport.js` / `.css` | Modified — contributions-by-source panel, outstanding-pledges panel |
| `WelfareDashboard.js` / `.css` | New — the operational dashboard called for in the spec, absent from the original files |

Drop these files in place of the originals (same paths, same import
structure — nothing renamed).

## Order of operations

1. **Review `migrations.sql` against your real schema first.** It's written
   defensively (`add column if not exists`, nullable, sensible defaults) so
   it's safe to run on existing data, but the RLS section at the bottom is a
   *template*, not a drop-in policy — I don't have visibility into your
   actual `chama_members`/`auth.uid()` wiring, so that part needs your
   review before it goes anywhere near production.
2. Apply the migration.
3. Replace the five JS/CSS pairs with the versions in this folder.
4. Add `WelfareDashboard` to whatever routes/nav the other three components
   are already wired into, and pass it an `onNavigate(view, filter)`
   callback — see the comment block at the top of `WelfareDashboard.js` for
   the exact shape it calls. Without this prop, KPI/alert/pending-action
   clicks are inert (they just don't crash).

## What changed functionally (short version)

- **Contributions can now actually be created** from `WelfareCaseDesk` —
  previously the file only approved/rejected rows that nothing in the
  supplied code ever inserted.
- **Four contribution sources**: member, external individual, organization,
  anonymous — on both case-level and event-level contributions.
- **Pledges**: mark a contribution as pledged, log partial payments against
  it later, see outstanding balances in the case modal, the event funds
  tab, and the Insights report.
- **Granular visibility** on a case: show contributor names / ranking /
  anonymous entries / external identity, independently of whether amounts
  are shown — previously there was only one flag.
- **Event budget line items**: category/description/qty/unit cost/actual,
  with a running variance, instead of two flat numbers per event.
- **Guarded status stepper**: an event can no longer jump straight from
  "planned" to "completed" in one click; moving backward to correct a
  mistake is still allowed.
- **Case closure now warns** about pending contributions and outstanding
  pledges instead of a generic confirm.
- **Best-effort audit logging** on case open/close, contribution
  approve/reject/record, pledge payments, and event status/cost changes.
- **New dashboard**: KPI strip, alerts, pending actions, upcoming events,
  per-event progress (activities % / budget %) — all read-only, all
  drill-downable via `onNavigate`.

## What this deliberately does NOT include, and why

These are P2/P3 in the audit — either they depend on modules that weren't
part of the supplied files, or they're large enough structural changes that
building them without seeing what already exists elsewhere in your ERP
would risk duplicating something, which the brief explicitly said not to do:

- **Finance/GL integration.** The dashboard's "Welfare fund balance" card is
  intentionally left as a placeholder rather than computed from
  contributions minus expenses — that arithmetic would look authoritative
  but wouldn't be reconciled against your actual cashbook. Every point
  where money changes hands (contribution approved, pledge received,
  expense recorded) is a clear integration point once you point me at the
  Finance module.
- **EDRMS integration** for case/event documents.
- **Notification service integration** — no file here calls out to send a
  notification; the alerts panel only reads current state.
- **Budget revision history UI** — the table (`welfare_event_budget_revisions`)
  is in the migration, but no screen writes to it yet.
- **Event-day execution view and post-mortem recording.**
- **RLS enforcement** — the *shape* is in `migrations.sql` (a
  `welfare_contributions_member_safe` view plus example policies), but I
  have not seen your auth schema, so I'm not claiming it's safe to apply
  verbatim. Treat the P0 finding in the audit (contributor privacy is
  currently UI-only) as needing your sign-off before shipping.

If you'd like the next pass to tackle any of these, the cleanest path is
pointing me at the Finance/EDRMS/notification files (the same way you did
for Welfare) so the same "audit first, then build on what's real" approach
applies there too, rather than guessing at APIs that likely already exist.
