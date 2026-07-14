-- =============================================================================
-- CHAMA FORMATION — self-service "start a new chama" registration
-- =============================================================================
-- Different from register_user() in 002: that one links a NEW login to a
-- chama_members row someone else (an official) already created. This one
-- creates the chama itself — the person registering becomes its first
-- member, as chairperson, with a trial license so it works immediately
-- without waiting on platform-admin activation (see LicenseManager.js /
-- is_chama_licensed()'s treatment of 'trial' as valid).
-- =============================================================================

create or replace function register_chama(
  p_chama_name text,
  p_chama_no text,
  p_founder_name text,
  p_founder_phone text,
  p_founder_password text
)
returns table (chama_id uuid, chama_member_id uuid, user_id uuid)
language plpgsql
security definer
as $$
declare
  v_chama_id uuid;
  v_member_id uuid;
  v_user_id uuid;
begin
  if length(p_founder_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from chamas ch where ch.chama_no = p_chama_no) then
    raise exception 'That chama code is already taken — try another';
  end if;
  if exists (select 1 from chama_users cu where cu.phone_number = p_founder_phone) then
    raise exception 'An account already exists for this phone number';
  end if;

  insert into chamas (name, chama_no, license_status, license_plan, license_expiry)
  values (p_chama_name, p_chama_no, 'trial', 'trial', current_date + interval '30 days')
  returning id into v_chama_id;

  insert into chama_members (chama_id, name, phone, role, status)
  values (v_chama_id, p_founder_name, p_founder_phone, 'chairperson', 'active')
  returning id into v_member_id;

  insert into chama_users (phone_number, password_hash, full_name)
  values (p_founder_phone, crypt(p_founder_password, gen_salt('bf')), p_founder_name)
  returning id into v_user_id;

  update chama_members cm set user_id = v_user_id where cm.id = v_member_id;

  return query select v_chama_id, v_member_id, v_user_id;
end;
$$;

grant execute on function register_chama(text, text, text, text, text) to anon, authenticated;
