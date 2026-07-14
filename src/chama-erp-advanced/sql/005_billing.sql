-- =============================================================================
-- BILLING — payment records + automatic prepaid-style license extension
-- =============================================================================
-- Model: like a prepaid electricity meter, not a subscription you have to
-- remember to cancel. A chama's license_expiry is the date its paid-up
-- period runs out. Blocking already happens automatically at login time
-- (isLicenseValid() in ChamaContext.js compares license_expiry to today —
-- no human action needed for a chama to get locked out). What was missing:
-- recording a payment that automatically PUSHES license_expiry forward,
-- the way buying more units resets a meter, instead of a platform admin
-- guessing and hand-typing a new date.
-- =============================================================================

create table if not exists chama_payments (
  id uuid primary key default gen_random_uuid()
);

alter table chama_payments add column if not exists chama_id uuid references chamas(id);
alter table chama_payments add column if not exists amount numeric(14,2);
alter table chama_payments add column if not exists method text default 'MPESA'; -- MPESA | BANK | CASH
alter table chama_payments add column if not exists reference text;
alter table chama_payments add column if not exists period_days integer default 30; -- how many days this payment buys
alter table chama_payments add column if not exists paid_on date default current_date;
alter table chama_payments add column if not exists recorded_by text; -- free text, since /platform-admin has no member identity yet
alter table chama_payments add column if not exists notes text;
alter table chama_payments add column if not exists created_at timestamptz default now();

create index if not exists idx_chama_payments_chama on chama_payments(chama_id);

-- Record a payment and extend the license in one atomic step. If the
-- current license_expiry is already in the future, the new period stacks
-- on top of it (paying early doesn't waste remaining time) — exactly like
-- topping up a meter before it hits zero. If it's already expired (or
-- null), the new period starts counting from today.
create or replace function record_chama_payment(
  p_chama_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_period_days integer,
  p_recorded_by text default 'platform admin',
  p_notes text default null
)
returns date
language plpgsql
security definer
as $$
declare
  v_current_expiry date;
  v_new_expiry date;
begin
  select c.license_expiry into v_current_expiry from chamas c where c.id = p_chama_id;

  v_new_expiry := greatest(coalesce(v_current_expiry, current_date), current_date) + p_period_days;

  insert into chama_payments (chama_id, amount, method, reference, period_days, recorded_by, notes)
  values (p_chama_id, p_amount, p_method, p_reference, p_period_days, p_recorded_by, p_notes);

  update chamas
    set license_expiry = v_new_expiry,
        license_status = 'active' -- paying always restores service, same as a meter accepting new units
    where id = p_chama_id;

  return v_new_expiry;
end;
$$;

-- Exempt a chama from billing entirely — a manual "free forever" switch
-- (demo accounts, partners, whatever) distinct from a paid or trial state.
-- No expiry countdown applies while license_plan = 'free'.
create or replace function set_chama_free(p_chama_id uuid, p_free boolean)
returns void
language plpgsql
security definer
as $$
begin
  if p_free then
    update chamas set license_plan = 'free', license_status = 'active', license_expiry = null where id = p_chama_id;
  else
    -- Taking a chama off free mode with no payment on file leaves it
    -- expired today, not silently active — forces a real payment record
    -- to be the thing that turns it back on.
    update chamas set license_plan = 'standard', license_status = 'expired', license_expiry = current_date - 1 where id = p_chama_id;
  end if;
end;
$$;

grant execute on function record_chama_payment(uuid, numeric, text, text, integer, text, text) to anon, authenticated;
grant execute on function set_chama_free(uuid, boolean) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- OPTIONAL: make the stored license_status self-correct daily, not just at
-- read time. Not required for enforcement (that already happens live via
-- the expiry-date check on every login) — this only keeps the raw column
-- honest for anything that queries chamas directly without recomputing.
-- Requires the pg_cron extension, which isn't available on every Supabase
-- tier — uncomment only if `create extension pg_cron;` succeeds for you.
-- -----------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'expire-overdue-chamas',
--   '0 1 * * *', -- daily at 01:00
--   $$update chamas set license_status = 'expired'
--     where license_expiry < current_date and license_status in ('active','trial') and license_plan <> 'free'$$
-- );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
