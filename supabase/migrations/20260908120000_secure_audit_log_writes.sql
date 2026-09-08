begin;

-- Remove the historical policy/grant that allowed every authenticated user
-- to insert arbitrary rows into audit_logs.
drop policy if exists audit_logs_insert_auth on public.audit_logs;
drop policy if exists audit_logs_insert_admin_context on public.audit_logs;

revoke insert, update, delete on table public.audit_logs from public;
revoke insert, update, delete on table public.audit_logs from anon;
revoke insert, update, delete on table public.audit_logs from authenticated;

create or replace function public.log_audit(
  p_action text,
  p_details text default null,
  p_target_id uuid default null,
  p_target_email text default null,
  p_target_name text default null,
  p_metadata jsonb default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.users%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_existing_id uuid;
  v_log_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_action not in ('role_changed', 'menu_updated', 'menu_options_added') then
    raise exception 'audit_action_not_allowed';
  end if;

  select *
  into v_actor
  from public.users
  where id = v_uid;

  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;

  if v_request_id is not null then
    select a.id
    into v_existing_id
    from public.audit_logs a
    where a.request_id = v_request_id
      and a.action = v_action
    limit 1;

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    actor_email,
    actor_name,
    target_id,
    target_email,
    target_name,
    metadata,
    request_id,
    created_at
  )
  values (
    v_action,
    p_details,
    v_actor.id,
    v_actor.email,
    coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email, 'Administrador'),
    p_target_id,
    nullif(trim(coalesce(p_target_email, '')), ''),
    nullif(trim(coalesce(p_target_name, '')), ''),
    p_metadata,
    v_request_id,
    now()
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.log_audit(text, text, uuid, text, text, jsonb, text) from public;
revoke all on function public.log_audit(text, text, uuid, text, text, jsonb, text) from anon;
grant execute on function public.log_audit(text, text, uuid, text, text, jsonb, text) to authenticated;

commit;
