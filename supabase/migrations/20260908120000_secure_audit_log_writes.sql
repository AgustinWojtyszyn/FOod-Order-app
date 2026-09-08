begin;

-- Client-side audit writes are only needed by current admin/company-admin
-- menu/role flows. Remove the historical policy that allowed every
-- authenticated user to insert arbitrary audit rows.
drop policy if exists audit_logs_insert_auth on public.audit_logs;
drop policy if exists audit_logs_insert_admin_context on public.audit_logs;

-- Always derive the actor identity server-side before RLS validates the row.
-- This prevents a client from impersonating another actor in audit_logs.
create or replace function public.audit_log_set_verified_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
begin
  -- Internal maintenance/migration writes without an auth context keep their
  -- explicitly supplied actor. Authenticated application writes are verified.
  if auth.uid() is null then
    return new;
  end if;

  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;

  new.actor_id := v_actor.id;
  new.actor_email := v_actor.email;
  new.actor_name := coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email, 'Administrador');
  new.created_at := now();

  return new;
end;
$$;

revoke all on function public.audit_log_set_verified_actor() from public;
revoke all on function public.audit_log_set_verified_actor() from anon;
revoke all on function public.audit_log_set_verified_actor() from authenticated;

drop trigger if exists trg_audit_log_set_verified_actor on public.audit_logs;
create trigger trg_audit_log_set_verified_actor
before insert on public.audit_logs
for each row
execute function public.audit_log_set_verified_actor();

-- Keep the existing client audit helper working for legitimate admin flows,
-- but ordinary authenticated users can no longer create audit events.
-- Restrict direct client writes to the three actions currently emitted by
-- frontend logAudit helpers; sensitive order/remito/discount audit events are
-- created inside security-definer RPCs and do not depend on this policy.
create policy audit_logs_insert_admin_context
on public.audit_logs
for insert
to authenticated
with check (
  auth.uid() is not null
  and actor_id = auth.uid()
  and public.has_company_admin_access()
  and action in ('role_changed', 'menu_updated', 'menu_options_added')
);

commit;
