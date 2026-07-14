-- =============================================================================
-- CHAMA ERP — SCHEMA UPGRADE (v2 — hardened against pre-existing tables)
-- =============================================================================
-- What changed from v1
-- ---------------------
-- v1 relied on `create table if not exists` for every table, and only added
-- explicit `alter table ... add column if not exists` for the columns we
-- were SURE were new (on chama_members and chama_loans). That's wrong: this
-- database already has other tables from earlier sessions with the same
-- names but different columns — confirmed concretely by
-- chama_contribution_requests already existing with a `user_id` column
-- (written by ChamasendContributions.js) instead of `member_id`. Because
-- `create table if not exists` is a total no-op when the table is already
-- there, v1's CREATE TABLE for that table silently did nothing, and every
-- later statement assuming a `member_id` column on it broke.
--
-- Fix: every table below now gets an explicit `alter table ... add column
-- if not exists` for EVERY column, immediately after its `create table if
-- not exists` — not just the ones we assumed were new. This is idempotent
-- and additive-only regardless of whether the table was just created fresh
-- or already existed in some other shape; run it as many times as you like.
--
-- New columns added this way to a table that may already have rows are
-- deliberately NOT declared NOT NULL at the ALTER step (Postgres would
-- reject that against existing rows with no default) — even where the
-- CREATE TABLE above declares NOT NULL for a brand-new install. If your
-- chama_contribution_requests already had rows before this ran, their new
-- `member_id` will be NULL until backfilled; every new row going forward
-- (from MemberContributionForm.js) always sets it.
--
-- Run this whole file once, top to bottom, in the Supabase SQL editor.
-- Safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. MEMBERS (canonical: chama_members)
-- -----------------------------------------------------------------------------
create table if not exists chama_members (
  id uuid primary key default gen_random_uuid()
);

alter table chama_members add column if not exists chama_id uuid;
alter table chama_members add column if not exists name text;
alter table chama_members add column if not exists phone text;
alter table chama_members add column if not exists role text default 'member';
alter table chama_members add column if not exists status text default 'active';
alter table chama_members add column if not exists has_pin boolean default false;
alter table chama_members add column if not exists created_at timestamptz default now();
alter table chama_members add column if not exists savings_balance numeric(14,2) default 0;
alter table chama_members add column if not exists shares_balance numeric(14,2) default 0;
alter table chama_members add column if not exists welfare_balance numeric(14,2) default 0;
alter table chama_members add column if not exists joined_at timestamptz default now();

-- Roles this schema understands for approval/permission gating everywhere below:
--   member | secretary | treasurer | chairperson | welfare_officer | admin
-- (admin / chairperson are treated as super-roles with the same reach as
-- "official" checks throughout — see hasRole() in ChamaContext.js)

-- -----------------------------------------------------------------------------
-- 2. CHAMA BANK / MOBILE-MONEY ACCOUNTS
--    ("she sent to CIC chama account" — this is what CIC is)
-- -----------------------------------------------------------------------------
create table if not exists chama_bank_accounts (
  id uuid primary key default gen_random_uuid()
);

alter table chama_bank_accounts add column if not exists chama_id uuid;
alter table chama_bank_accounts add column if not exists account_name text;
alter table chama_bank_accounts add column if not exists account_type text default 'bank';
alter table chama_bank_accounts add column if not exists account_number text;
alter table chama_bank_accounts add column if not exists provider text;
alter table chama_bank_accounts add column if not exists is_active boolean default true;
alter table chama_bank_accounts add column if not exists opening_balance numeric(14,2) default 0;
alter table chama_bank_accounts add column if not exists created_at timestamptz default now();

-- -----------------------------------------------------------------------------
-- 3. CONTRIBUTION REQUESTS — member declares, treasurer reconciles & approves
--    CONFIRMED to already exist in this database with a different shape
--    (user_id instead of member_id, plus no reconciliation/verification
--    columns) — every column below is added defensively.
-- -----------------------------------------------------------------------------
create table if not exists chama_contribution_requests (
  id uuid primary key default gen_random_uuid()
);

alter table chama_contribution_requests add column if not exists chama_id uuid;
alter table chama_contribution_requests add column if not exists member_id uuid references chama_members(id);
alter table chama_contribution_requests add column if not exists bank_account_id uuid references chama_bank_accounts(id);
alter table chama_contribution_requests add column if not exists amount numeric(14,2);
alter table chama_contribution_requests add column if not exists contribution_type text default 'savings';
alter table chama_contribution_requests add column if not exists contributed_on date default current_date;
alter table chama_contribution_requests add column if not exists payment_method text default 'MPESA';
alter table chama_contribution_requests add column if not exists transaction_ref text;
alter table chama_contribution_requests add column if not exists member_notes text;
alter table chama_contribution_requests add column if not exists status text default 'PENDING';
  -- PENDING | VERIFIED | APPROVED | REJECTED
  -- VERIFIED = treasurer confirmed the money actually landed in the account
  -- APPROVED = posted to ledger + member balance (terminal, irreversible via UI)
alter table chama_contribution_requests add column if not exists verified_by uuid references chama_members(id);
alter table chama_contribution_requests add column if not exists verified_at timestamptz;
alter table chama_contribution_requests add column if not exists verification_notes text;
alter table chama_contribution_requests add column if not exists bank_statement_amount numeric(14,2);
alter table chama_contribution_requests add column if not exists approved_by uuid references chama_members(id);
alter table chama_contribution_requests add column if not exists approved_at timestamptz;
alter table chama_contribution_requests add column if not exists rejection_reason text;
alter table chama_contribution_requests add column if not exists posted boolean default false;
alter table chama_contribution_requests add column if not exists posted_ledger_entry_id uuid;
alter table chama_contribution_requests add column if not exists created_at timestamptz default now();

create index if not exists idx_ccr_chama_status on chama_contribution_requests(chama_id, status);
create index if not exists idx_ccr_member on chama_contribution_requests(member_id);

-- -----------------------------------------------------------------------------
-- 4. LEDGER — one canonical, append-only ledger table
--    (supersedes chama_transactions / chama_fund_movements going forward;
--     those are left in place for historical data, simply not written to by
--     the new modules)
-- -----------------------------------------------------------------------------
create table if not exists chama_ledger_entries (
  id uuid primary key default gen_random_uuid()
);

alter table chama_ledger_entries add column if not exists chama_id uuid;
alter table chama_ledger_entries add column if not exists member_id uuid references chama_members(id);
alter table chama_ledger_entries add column if not exists account_type text;
alter table chama_ledger_entries add column if not exists direction text;
alter table chama_ledger_entries add column if not exists amount numeric(14,2);
alter table chama_ledger_entries add column if not exists source_type text;
alter table chama_ledger_entries add column if not exists source_id uuid;
alter table chama_ledger_entries add column if not exists description text;
alter table chama_ledger_entries add column if not exists created_by uuid references chama_members(id);
alter table chama_ledger_entries add column if not exists created_at timestamptz default now();

-- Add the direction check constraint only if it isn't already there (can't
-- "add constraint if not exists" directly, so guard with a catalog check).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chama_ledger_entries_direction_check'
  ) then
    alter table chama_ledger_entries
      add constraint chama_ledger_entries_direction_check check (direction in ('credit','debit'));
  end if;
end $$;

create index if not exists idx_ledger_chama on chama_ledger_entries(chama_id, account_type);
create index if not exists idx_ledger_member on chama_ledger_entries(member_id);

-- -----------------------------------------------------------------------------
-- 5. LOAN RULES — one row per chama; this is the "physical card" of rules
--    the official dashboard lets officials configure per multi-tenant chama.
-- -----------------------------------------------------------------------------
create table if not exists chama_loan_rules (
  id uuid primary key default gen_random_uuid()
);

alter table chama_loan_rules add column if not exists chama_id uuid;
alter table chama_loan_rules add column if not exists savings_multiplier numeric(6,2) default 3;
alter table chama_loan_rules add column if not exists max_loan_amount numeric(14,2);
alter table chama_loan_rules add column if not exists min_membership_months integer default 0;
alter table chama_loan_rules add column if not exists requires_guarantors boolean default true;
alter table chama_loan_rules add column if not exists min_guarantors integer default 1;
alter table chama_loan_rules add column if not exists guarantor_coverage_percent numeric(5,2) default 100;
alter table chama_loan_rules add column if not exists requires_security boolean default false;
alter table chama_loan_rules add column if not exists security_instructions text;
alter table chama_loan_rules add column if not exists default_interest_rate numeric(6,2) default 10;
alter table chama_loan_rules add column if not exists default_interest_type text default 'flat_monthly';
alter table chama_loan_rules add column if not exists required_approvals integer default 3;
alter table chama_loan_rules add column if not exists approver_roles jsonb default '["secretary","treasurer","chairperson"]';
alter table chama_loan_rules add column if not exists max_active_loans_per_member integer default 1;
alter table chama_loan_rules add column if not exists updated_by uuid references chama_members(id);
alter table chama_loan_rules add column if not exists updated_at timestamptz default now();
alter table chama_loan_rules add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chama_loan_rules_chama_id_key') then
    alter table chama_loan_rules add constraint chama_loan_rules_chama_id_key unique (chama_id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. LOAN APPLICATIONS — member applies, named-role officials approve
--    CONFIRMED to already exist (LoanApplications.js was written against an
--    existing baseline table and its own "extension" migration) — every
--    column added defensively.
-- -----------------------------------------------------------------------------
create table if not exists chama_loan_applications (
  id uuid primary key default gen_random_uuid()
);

alter table chama_loan_applications add column if not exists chama_id uuid;
alter table chama_loan_applications add column if not exists member_id uuid references chama_members(id);
alter table chama_loan_applications add column if not exists member_name text;
alter table chama_loan_applications add column if not exists requested_amount numeric(14,2);
alter table chama_loan_applications add column if not exists purpose text;
alter table chama_loan_applications add column if not exists repayment_months integer default 1;
alter table chama_loan_applications add column if not exists interest_rate numeric(6,2) default 10;
alter table chama_loan_applications add column if not exists interest_type text default 'flat_monthly';
alter table chama_loan_applications add column if not exists guarantors jsonb default '[]';
alter table chama_loan_applications add column if not exists status text default 'Pending';
  -- Pending -> Awaiting Approval -> Approved -> Disbursed -> Closed
  --                              \-> Rejected
alter table chama_loan_applications add column if not exists required_approvals integer default 3;
alter table chama_loan_applications add column if not exists approver_roles jsonb default '["secretary","treasurer","chairperson"]';
alter table chama_loan_applications add column if not exists approvals jsonb default '[]';
  -- approvals: [{ role, member_id, name, decision, comment, decided_at }]
alter table chama_loan_applications add column if not exists loan_id uuid;
alter table chama_loan_applications add column if not exists approved_at timestamptz;
alter table chama_loan_applications add column if not exists rejected_at timestamptz;
alter table chama_loan_applications add column if not exists remarks text;
alter table chama_loan_applications add column if not exists created_at timestamptz default now();

create index if not exists idx_loanapp_chama_status on chama_loan_applications(chama_id, status);

-- One pending/in-flight application per member at a time.
create unique index if not exists uniq_member_open_application
  on chama_loan_applications(member_id)
  where status in ('Pending','Awaiting Approval');

-- -----------------------------------------------------------------------------
-- 7. LOANS (disbursed) + REPAYMENTS — both confirmed pre-existing, every
--    column added defensively.
-- -----------------------------------------------------------------------------
create table if not exists chama_loans (
  id uuid primary key default gen_random_uuid()
);

alter table chama_loans add column if not exists chama_id uuid;
alter table chama_loans add column if not exists member_id uuid references chama_members(id);
alter table chama_loans add column if not exists member_name text;
alter table chama_loans add column if not exists application_id uuid references chama_loan_applications(id);
alter table chama_loans add column if not exists amount numeric(14,2);
alter table chama_loans add column if not exists interest_rate numeric(6,2) default 10;
alter table chama_loans add column if not exists interest_type text default 'flat_monthly';
alter table chama_loans add column if not exists repayment_months integer default 1;
alter table chama_loans add column if not exists balance numeric(14,2);
alter table chama_loans add column if not exists disbursed boolean default false;
alter table chama_loans add column if not exists disbursement_date date;
alter table chama_loans add column if not exists disbursement_source uuid references chama_bank_accounts(id);
alter table chama_loans add column if not exists disbursed_by uuid references chama_members(id);
alter table chama_loans add column if not exists status text default 'active'; -- active | closed | defaulted
alter table chama_loans add column if not exists created_at timestamptz default now();

create table if not exists chama_loan_repayments (
  id uuid primary key default gen_random_uuid()
);

alter table chama_loan_repayments add column if not exists chama_id uuid;
alter table chama_loan_repayments add column if not exists loan_id uuid references chama_loans(id);
alter table chama_loan_repayments add column if not exists member_id uuid references chama_members(id);
alter table chama_loan_repayments add column if not exists amount numeric(14,2);
alter table chama_loan_repayments add column if not exists paid_on date default current_date;
alter table chama_loan_repayments add column if not exists method text default 'MPESA';
alter table chama_loan_repayments add column if not exists reference text;
alter table chama_loan_repayments add column if not exists recorded_by uuid references chama_members(id);
alter table chama_loan_repayments add column if not exists created_at timestamptz default now();

-- -----------------------------------------------------------------------------
-- 8. WELFARE — staff-managed cases with per-member visibility + expected
--    contribution, plus NEW event planning tables. welfare_cases,
--    welfare_contributions and welfare_member_access are CONFIRMED
--    pre-existing (from WelfareOfficerDashboard.js) — every column on them
--    added defensively.
-- -----------------------------------------------------------------------------
create table if not exists welfare_cases (
  id uuid primary key default gen_random_uuid()
);

alter table welfare_cases add column if not exists chama_id uuid;
alter table welfare_cases add column if not exists title text;
alter table welfare_cases add column if not exists event_type text default 'other'; -- funeral | sickness | wedding | achievement | other
alter table welfare_cases add column if not exists beneficiary_member_id uuid references chama_members(id);
alter table welfare_cases add column if not exists beneficiary_name text;
alter table welfare_cases add column if not exists description text;
alter table welfare_cases add column if not exists expected_amount numeric(14,2) default 0;
alter table welfare_cases add column if not exists amount_visible_to_members boolean default true;
alter table welfare_cases add column if not exists is_visible_to_beneficiary boolean default true;
alter table welfare_cases add column if not exists status text default 'open'; -- open | closed
alter table welfare_cases add column if not exists opened_by uuid references chama_members(id);
alter table welfare_cases add column if not exists opened_at timestamptz default now();
alter table welfare_cases add column if not exists closed_by uuid references chama_members(id);
alter table welfare_cases add column if not exists closed_at timestamptz;

-- Who can see the case + what each of them is individually expected to
-- contribute (the welfare officer sets both at once). New table name —
-- deliberately not reusing the old welfare_case_visibility table, since
-- this merges visibility + expected-amount into one row per participant.
create table if not exists welfare_case_participants (
  id uuid primary key default gen_random_uuid()
);

alter table welfare_case_participants add column if not exists case_id uuid references welfare_cases(id) on delete cascade;
alter table welfare_case_participants add column if not exists member_id uuid references chama_members(id);
alter table welfare_case_participants add column if not exists can_see boolean default true;
alter table welfare_case_participants add column if not exists expected_contribution numeric(14,2) default 0;
alter table welfare_case_participants add column if not exists added_by uuid references chama_members(id);
alter table welfare_case_participants add column if not exists added_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'welfare_case_participants_case_member_key') then
    alter table welfare_case_participants
      add constraint welfare_case_participants_case_member_key unique (case_id, member_id);
  end if;
end $$;

create table if not exists welfare_contributions (
  id uuid primary key default gen_random_uuid()
);

alter table welfare_contributions add column if not exists chama_id uuid;
alter table welfare_contributions add column if not exists case_id uuid references welfare_cases(id) on delete cascade;
alter table welfare_contributions add column if not exists member_id uuid references chama_members(id);
alter table welfare_contributions add column if not exists amount numeric(14,2);
alter table welfare_contributions add column if not exists contributed_on date default current_date;
alter table welfare_contributions add column if not exists reference text;
alter table welfare_contributions add column if not exists status text default 'Pending'; -- Pending | Approved | Rejected
alter table welfare_contributions add column if not exists is_visible boolean default true;
alter table welfare_contributions add column if not exists amount_visible boolean default true;
alter table welfare_contributions add column if not exists recorded_by uuid references chama_members(id);
alter table welfare_contributions add column if not exists approved_by uuid references chama_members(id);
alter table welfare_contributions add column if not exists approved_at timestamptz;
alter table welfare_contributions add column if not exists created_at timestamptz default now();

create index if not exists idx_welfarecontrib_case on welfare_contributions(case_id);

create table if not exists welfare_member_access (
  chama_id uuid,
  member_id uuid references chama_members(id)
);

alter table welfare_member_access add column if not exists can_access boolean default true;
alter table welfare_member_access add column if not exists granted_by uuid references chama_members(id);
alter table welfare_member_access add column if not exists granted_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'welfare_member_access_pkey') then
    alter table welfare_member_access add constraint welfare_member_access_pkey primary key (chama_id, member_id);
  end if;
exception when others then
  -- if the table already had a different primary key / duplicate rows
  -- prevent this from being added, skip rather than abort the whole script
  null;
end $$;

-- NEW: Event planning.
create table if not exists welfare_events (
  id uuid primary key default gen_random_uuid()
);

alter table welfare_events add column if not exists chama_id uuid;
alter table welfare_events add column if not exists case_id uuid references welfare_cases(id) on delete set null;
alter table welfare_events add column if not exists title text;
alter table welfare_events add column if not exists event_type text default 'gathering'; -- fundraiser | gathering | visit | ceremony | other
alter table welfare_events add column if not exists event_date date;
alter table welfare_events add column if not exists location text;
alter table welfare_events add column if not exists description text;
alter table welfare_events add column if not exists budget numeric(14,2) default 0;
alter table welfare_events add column if not exists status text default 'planned'; -- planned | ongoing | completed | cancelled
alter table welfare_events add column if not exists created_by uuid references chama_members(id);
alter table welfare_events add column if not exists created_at timestamptz default now();

create table if not exists welfare_event_tasks (
  id uuid primary key default gen_random_uuid()
);

alter table welfare_event_tasks add column if not exists event_id uuid references welfare_events(id) on delete cascade;
alter table welfare_event_tasks add column if not exists task text;
alter table welfare_event_tasks add column if not exists assignee_member_id uuid references chama_members(id);
alter table welfare_event_tasks add column if not exists due_date date;
alter table welfare_event_tasks add column if not exists status text default 'pending'; -- pending | in_progress | done
alter table welfare_event_tasks add column if not exists created_at timestamptz default now();

-- =============================================================================
-- 9. FUNCTIONS — atomic posting. The React layer NEVER writes ledger +
--    balance in two separate calls; it always calls these.
-- =============================================================================

create or replace function post_contribution(p_request_id uuid, p_approver uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_req chama_contribution_requests%rowtype;
  v_ledger_id uuid;
begin
  select * into v_req from chama_contribution_requests where id = p_request_id for update;

  if v_req.id is null then
    raise exception 'Contribution request % not found', p_request_id;
  end if;
  if v_req.member_id is null then
    raise exception 'Contribution % has no member_id set — cannot post to a member balance', p_request_id;
  end if;
  if v_req.status <> 'VERIFIED' then
    raise exception 'Contribution % must be VERIFIED before it can be posted (currently %)', p_request_id, v_req.status;
  end if;
  if v_req.posted then
    raise exception 'Contribution % has already been posted', p_request_id;
  end if;

  insert into chama_ledger_entries (chama_id, member_id, account_type, direction, amount, source_type, source_id, description, created_by)
  values (
    v_req.chama_id, v_req.member_id, v_req.contribution_type, 'credit', v_req.amount,
    'contribution', v_req.id,
    'Contribution verified against account, ref ' || coalesce(v_req.transaction_ref, 'n/a'),
    p_approver
  )
  returning id into v_ledger_id;

  update chama_contribution_requests
    set status = 'APPROVED', approved_by = p_approver, approved_at = now(),
        posted = true, posted_ledger_entry_id = v_ledger_id
    where id = p_request_id;

  if v_req.contribution_type = 'savings' then
    update chama_members set savings_balance = coalesce(savings_balance, 0) + v_req.amount where id = v_req.member_id;
  elsif v_req.contribution_type = 'shares' then
    update chama_members set shares_balance = coalesce(shares_balance, 0) + v_req.amount where id = v_req.member_id;
  elsif v_req.contribution_type = 'welfare' then
    update chama_members set welfare_balance = coalesce(welfare_balance, 0) + v_req.amount where id = v_req.member_id;
  elsif v_req.contribution_type = 'loan_repayment' then
    -- loan_repayment contributions still need a chama_loan_repayments row +
    -- loan balance decrement; the app layer calls apply_loan_repayment()
    -- for that instead of relying on this generic path when a loan_id
    -- is known. This branch just avoids silently doing nothing.
    null;
  end if;

  return v_ledger_id;
end;
$$;

create or replace function disburse_loan(p_loan_id uuid, p_source_account uuid, p_disburser uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_loan chama_loans%rowtype;
begin
  select * into v_loan from chama_loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'Loan % not found', p_loan_id;
  end if;
  if v_loan.disbursed then
    raise exception 'Loan % already disbursed', p_loan_id;
  end if;

  update chama_loans
    set disbursed = true, disbursement_date = current_date,
        disbursement_source = p_source_account, disbursed_by = p_disburser,
        balance = amount
    where id = p_loan_id;

  insert into chama_ledger_entries (chama_id, member_id, account_type, direction, amount, source_type, source_id, description, created_by)
  values (
    v_loan.chama_id, v_loan.member_id, 'loan_disbursement', 'debit', v_loan.amount,
    'loan_disbursement', v_loan.id, 'Loan disbursed to member', p_disburser
  );
end;
$$;

create or replace function apply_loan_repayment(p_loan_id uuid, p_amount numeric, p_method text, p_reference text, p_recorder uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_loan chama_loans%rowtype;
  v_repayment_id uuid;
begin
  select * into v_loan from chama_loans where id = p_loan_id for update;
  if v_loan.id is null then
    raise exception 'Loan % not found', p_loan_id;
  end if;

  insert into chama_loan_repayments (chama_id, loan_id, member_id, amount, method, reference, recorded_by)
  values (v_loan.chama_id, p_loan_id, v_loan.member_id, p_amount, p_method, p_reference, p_recorder)
  returning id into v_repayment_id;

  update chama_loans
    set balance = greatest(coalesce(balance, amount) - p_amount, 0),
        status = case when coalesce(balance, amount) - p_amount <= 0 then 'closed' else status end
    where id = p_loan_id;

  insert into chama_ledger_entries (chama_id, member_id, account_type, direction, amount, source_type, source_id, description, created_by)
  values (v_loan.chama_id, v_loan.member_id, 'loan_repayment', 'credit', p_amount, 'loan_repayment', v_repayment_id, 'Loan repayment', p_recorder);

  return v_repayment_id;
end;
$$;

-- =============================================================================
-- 10. ROW LEVEL SECURITY — deliberately left commented out. See README.
-- =============================================================================
-- alter table chama_contribution_requests enable row level security;
-- create policy tenant_isolation on chama_contribution_requests
--   using (chama_id = get_current_chama_id());
-- ... (repeat per table)

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
