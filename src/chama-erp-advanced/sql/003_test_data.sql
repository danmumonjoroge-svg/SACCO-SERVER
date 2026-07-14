-- =============================================================================
-- TEST DATA — one clean chama, one member per role, logins for each.
-- Single paste, single run — no manual copy-pasting of the generated
-- chama_id required. Safe to run once; re-running fails cleanly on the
-- unique chama_no / phone constraints rather than silently duplicating.
-- =============================================================================

do $$
declare
  v_chama_id uuid;
begin
  -- 1. A fresh, fully-licensed test chama
  insert into chamas (name, chama_no, license_status, license_expiry, license_plan)
  values ('Test Chama Ltd', 'CHM-TEST01', 'active', null, 'standard')
  returning id into v_chama_id;

  -- 2. One member per role, so every dashboard tab has someone who can use it
  insert into chama_members (chama_id, name, phone, role, status, savings_balance)
  values
    (v_chama_id, 'Alice Chair',     '0700000001', 'chairperson',     'active', 20000),
    (v_chama_id, 'Bob Secretary',   '0700000002', 'secretary',       'active', 15000),
    (v_chama_id, 'Carol Treasurer', '0700000003', 'treasurer',       'active', 30000),
    (v_chama_id, 'Dave Welfare',    '0700000004', 'welfare_officer', 'active', 10000),
    (v_chama_id, 'Eve Member',      '0700000005', 'member',          'active', 50000);

  -- 3. A test bank account, so contribution/disbursement dropdowns aren't empty
  insert into chama_bank_accounts (chama_id, account_name, account_type, provider, is_active)
  values (v_chama_id, 'Test CIC Chama Account', 'bank', 'CIC', true);

  -- 4. Create a real login for each member via the actual register_user()
  --    RPC (not a raw insert) — proves the auto-link-by-phone path works
  --    end to end, not just that a row can be inserted.
  --    Password for all five test accounts: Test1234
  perform register_user('0700000001', 'Test1234', 'Alice Chair');
  perform register_user('0700000002', 'Test1234', 'Bob Secretary');
  perform register_user('0700000003', 'Test1234', 'Carol Treasurer');
  perform register_user('0700000004', 'Test1234', 'Dave Welfare');
  perform register_user('0700000005', 'Test1234', 'Eve Member');

  raise notice 'Test chama id: %', v_chama_id;
end $$;

-- 5. Verify: every member row above should now show a non-null user_id,
--    proving the phone-match auto-link in register_user() actually worked.
select cm.name, cm.role, cm.phone, cm.user_id, cu.phone_number
from chama_members cm
join chama_users cu on cu.id = cm.user_id
join chamas c on c.id = cm.chama_id
where c.chama_no = 'CHM-TEST01'
order by cm.role;
