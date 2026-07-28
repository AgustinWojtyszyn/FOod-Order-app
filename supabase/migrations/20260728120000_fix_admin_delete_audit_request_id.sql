create or replace function public.admin_delete_archived_orders(p_request_id text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_count integer := 0;
  v_audit_request_id uuid := null;
  v_audit_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_request_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_audit_request_id := p_request_id::uuid;
  end if;

  with deleted as (
    delete from public.orders
    where status = 'archived'
    returning id
  )
  select count(*)::integer into v_deleted_count from deleted;

  v_audit_metadata := jsonb_build_object('deleted_count', v_deleted_count)
    || case
      when p_request_id is null then '{}'::jsonb
      else jsonb_build_object('client_request_id', p_request_id)
    end;

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    target_name,
    metadata,
    request_id,
    created_at
  )
  values (
    'orders_archived_deleted',
    'Pedidos archivados eliminados por administrador',
    auth.uid(),
    'orders',
    v_audit_metadata,
    v_audit_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_deleted_count;
end;
$$;

create or replace function public.admin_delete_all_orders(p_request_id text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_count integer := 0;
  v_audit_request_id uuid := null;
  v_audit_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_request_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_audit_request_id := p_request_id::uuid;
  end if;

  with deleted as (
    delete from public.orders
    returning id
  )
  select count(*)::integer into v_deleted_count from deleted;

  v_audit_metadata := jsonb_build_object('deleted_count', v_deleted_count)
    || case
      when p_request_id is null then '{}'::jsonb
      else jsonb_build_object('client_request_id', p_request_id)
    end;

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    target_name,
    metadata,
    request_id,
    created_at
  )
  values (
    'orders_all_deleted',
    'Todos los pedidos eliminados por administrador',
    auth.uid(),
    'orders',
    v_audit_metadata,
    v_audit_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_deleted_count;
end;
$$;

revoke all on function public.admin_delete_archived_orders(text) from public;
revoke all on function public.admin_delete_archived_orders(text) from anon;
grant execute on function public.admin_delete_archived_orders(text) to authenticated;

revoke all on function public.admin_delete_all_orders(text) from public;
revoke all on function public.admin_delete_all_orders(text) from anon;
grant execute on function public.admin_delete_all_orders(text) to authenticated;
