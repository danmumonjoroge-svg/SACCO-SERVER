-- =============================================================================
-- Welfare module upgrade — additive migrations
--
-- Nothing here drops or renames existing columns/tables. Everything is a new
-- nullable column, a new table with sensible defaults, or a new policy.
-- Run in order. Review the RLS section against your actual auth/RBAC schema
-- before applying — it assumes `chama_members.user_id = auth.uid()` and a
-- `role` column on `chama_members`; adjust to match your real schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contribution sources + pledges (welfare_contributions)
-- -----------------------------------------------------------------------------
alter table welfare_contributions
  alter column member_id drop not null; -- external/organization/anonymous contributions have no member

alter table welfare_contributions
  add column if not exists source_type text not null default 'member'
    check (source_type in ('member', 'external', 'organization', 'anonymous')),
  add column if not exists contributor_name text,        -- external individual or organization name
  add column if not exists contributor_contact text,      -- phone/email, optional, external/org only
  add column if not exists payment_method text,           -- 'cash' | 'bank' | 'mobile_money' | 'cheque' | 'other'
  add column if not exists reference text,                -- transaction/reference number
  add column if not exists is_pledge boolean not null default false,
  add column if not exists pledged_amount numeric,         -- set when is_pledge = true
  add column if not exists amount_received numeric,        -- running total actually received against the pledge
  add column if not exists expected_payment_date date,     -- pledge only
  add column if not exists rejection_reason text,          -- populated when status is set to Rejected
  add column if not exists received_by uuid;               -- officer who logged the contribution

comment on column welfare_contributions.source_type is
  'member | external | organization | anonymous. member_id is only meaningful when source_type = member.';
comment on column welfare_contributions.amount is
  'For a non-pledge contribution: the amount received. For a pledge, mirrors pledged_amount for backward compatibility with existing SUM(amount) reporting; use amount_received for the actually-collected figure.';

-- Same source/pledge fields on event-level contributions, for consistency.
alter table welfare_event_contributions
  alter column member_id drop not null;

alter table welfare_event_contributions
  add column if not exists source_type text not null default 'member'
    check (source_type in ('member', 'external', 'organization', 'anonymous')),
  add column if not exists contributor_name text,
  add column if not exists contributor_contact text,
  add column if not exists payment_method text,
  add column if not exists reference text,
  add column if not exists is_pledge boolean not null default false,
  add column if not exists pledged_amount numeric,
  add column if not exists amount_received numeric,
  add column if not exists expected_payment_date date;

-- -----------------------------------------------------------------------------
-- 2. Granular contribution visibility (welfare_cases)
-- -----------------------------------------------------------------------------
-- amount_visible_to_members already exists; add the finer-grained controls
-- the spec asks for, without removing the existing column (kept as the
-- "show amounts" default for anything not yet migrated to the new fields).
alter table welfare_cases
  add column if not exists show_contributor_names boolean not null default true,
  add column if not exists show_contributor_ranking boolean not null default false,
  add column if not exists show_anonymous_contributors boolean not null default true,
  add column if not exists show_external_contributors boolean not null default true,
  add column if not exists allow_anonymous_contributions boolean not null default true,
  add column if not exists allow_external_contributions boolean not null default true,
  add column if not exists campaign_status text not null default 'open'
    check (campaign_status in ('draft', 'open', 'closing', 'closed', 'reconciled')),
  add column if not exists closing_date date;

comment on column welfare_cases.amount_visible_to_members is
  'Legacy flag, kept for backward compatibility. New code should read show_contributor_names / show_* alongside this.';

-- -----------------------------------------------------------------------------
-- 3. Event budget line items
-- -----------------------------------------------------------------------------
create table if not exists welfare_event_budget_lines (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references welfare_events(id) on delete cascade,
  category text not null,
  activity text,
  description text,
  quantity numeric not null default 1,
  unit_cost numeric not null default 0,
  budget_amount numeric not null default 0,   -- quantity * unit_cost, kept explicit so overrides are possible
  approved_amount numeric,
  actual_amount numeric,
  responsible_member_id uuid references chama_members(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_welfare_event_budget_lines_event on welfare_event_budget_lines(event_id);

-- Budget revision history — every change to an approved line is recorded,
-- never silently overwritten.
create table if not exists welfare_event_budget_revisions (
  id uuid primary key default gen_random_uuid(),
  budget_line_id uuid not null references welfare_event_budget_lines(id) on delete cascade,
  previous_value numeric,
  new_value numeric,
  field text not null,          -- which column changed, e.g. 'budget_amount'
  reason text,
  requested_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Planned vs actual on event tasks/activities
-- -----------------------------------------------------------------------------
alter table welfare_event_tasks
  add column if not exists planned_start_time time,
  add column if not exists planned_end_time time,
  add column if not exists actual_date date,
  add column if not exists actual_start_time time,
  add column if not exists actual_end_time time,
  add column if not exists estimated_cost numeric,
  add column if not exists actual_cost numeric,
  add column if not exists depends_on_task_id uuid references welfare_event_tasks(id),
  add column if not exists completion_evidence text; -- URL/note

-- -----------------------------------------------------------------------------
-- 5. Generic audit log (create only if the wider ERP doesn't already have one)
-- -----------------------------------------------------------------------------
-- If your ERP already has an audit_log/activity_log table, skip this block
-- and point welfareFormat.js's logAudit() at that table/columns instead.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  chama_id uuid not null,
  actor_member_id uuid,
  module text not null,          -- e.g. 'welfare_case', 'welfare_event'
  action text not null,          -- e.g. 'contribution_approved', 'case_closed'
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_chama on audit_log(chama_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 6. Row-Level Security shape for contribution privacy (P0 finding)
-- -----------------------------------------------------------------------------
-- These are TEMPLATE policies illustrating the intent — "a member who isn't
-- authorized to see contributor identity should not receive that column in
-- the query response, not just have it hidden by the UI." Adjust the join
-- conditions to your actual auth.uid()/chama_members schema before applying.
--
-- Recommended pattern: don't try to hide individual columns via RLS (Postgres
-- RLS is row-level, not column-level). Instead expose a view that
-- conditionally nulls out identity columns, and point member-facing reads at
-- the view while officials continue reading the base table directly.

create or replace view welfare_contributions_member_safe as
select
  c.id,
  c.case_id,
  c.status,
  c.created_at,
  c.source_type,
  case when wc.show_contributor_names then c.member_id else null end as member_id,
  case when wc.show_contributor_names then c.contributor_name else null end as contributor_name,
  case
    when wc.amount_visible_to_members then c.amount
    else null
  end as amount,
  case when wc.show_external_contributors or c.source_type <> 'external' then c.source_type else 'hidden' end as visible_source_type
from welfare_contributions c
join welfare_cases wc on wc.id = c.case_id;

comment on view welfare_contributions_member_safe is
  'Use this view (not the base table) for any member-facing contribution list. '
  'Officials/welfare officers should keep reading welfare_contributions directly.';

-- Example RLS enabling row visibility only for the case's participants —
-- adjust table/column names to match your schema:
--
-- alter table welfare_contributions enable row level security;
--
-- create policy "officials see all contributions"
--   on welfare_contributions for select
--   using (
--     exists (
--       select 1 from chama_members m
--       where m.user_id = auth.uid()
--         and m.chama_id = (select chama_id from welfare_cases where id = welfare_contributions.case_id)
--         and m.role in ('welfare_officer','admin','chairperson','treasurer','secretary')
--     )
--   );
--
-- create policy "participants see their case's contributions"
--   on welfare_contributions for select
--   using (
--     exists (
--       select 1 from welfare_case_participants p
--       join chama_members m on m.id = p.member_id
--       where p.case_id = welfare_contributions.case_id
--         and m.user_id = auth.uid()
--         and p.can_see = true
--     )
--   );
