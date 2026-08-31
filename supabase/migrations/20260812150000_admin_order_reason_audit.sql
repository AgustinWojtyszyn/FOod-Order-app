-- Administrative order edit/cancel actions with mandatory reason and audit trail.

create or replace function public.admin_update_order_with_reason(
  p_order_id uuid,
  p_updates jsonb,
  p_reason text,
  p_request_id text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users%rowtype;
  v_old public.orders%rowtype;
  v_new public.orders%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_updates jsonb := coalesce(p_updates, '{}'::jsonb);
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_order_id is null then
    raise exception 'order_required';
  end if;

  if v_reason is null then
    raise exception 'reason_required';
  end if;

  if jsonb_typeof(v_updates) <> 'object' then
    raise exception 'updates_invalid';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

  select *
  into v_old
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  update public.orders
  set
    location = coalesce(v_updates->>'location', location),
    organization = coalesce(v_updates->>'organization', organization),
    requesting_location_code = coalesce(v_updates->>'requesting_location_code', requesting_location_code),
    delivery_location = coalesce(v_updates->>'delivery_location', delivery_location),
    delivery_location_code = coalesce(v_updates->>'delivery_location_code', delivery_location_code),
    service = coalesce(v_updates->>'service', service),
    status = coalesce(v_updates->>'status', status),
    total_items = coalesce(nullif(v_updates->>'total_items', '')::integer, total_items),
    items = coalesce(v_updates->'items', items),
    custom_responses = coalesce(v_updates->'custom_responses', custom_responses),
    customer_name = coalesce(v_updates->>'customer_name', customer_name),
    customer_email = coalesce(v_updates->>'customer_email', customer_email),
    customer_phone = coalesce(v_updates->>'customer_phone', customer_phone),
    comments = coalesce(v_updates->>'comments', comments),
    delivery_date = coalesce(nullif(v_updates->>'delivery_date', '')::date, delivery_date),
    updated_at = now()
  where id = p_order_id
  returning *
  into v_new;

  if to_regclass('public.audit_logs') is not null then
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
      'admin_order_updated',
      'Pedido editado por administrador',
      v_admin_id,
      v_admin.email,
      coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
      v_new.id,
      v_new.customer_email,
      v_new.customer_name,
      jsonb_build_object(
        'reason', v_reason,
        'previous', to_jsonb(v_old),
        'new', to_jsonb(v_new),
        'updates', v_updates,
        'responsible', jsonb_build_object(
          'id', v_admin_id,
          'email', v_admin.email,
          'name', coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email)
        )
      ),
      v_request_id,
      now()
    );
  end if;

  return v_new;
end;
$$;

create or replace function public.admin_cancel_order_with_reason(
  p_order_id uuid,
  p_reason text,
  p_request_id text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users%rowtype;
  v_old public.orders%rowtype;
  v_new public.orders%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_order_id is null then
    raise exception 'order_required';
  end if;

  if v_reason is null then
    raise exception 'reason_required';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

  select *
  into v_old
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id
  returning *
  into v_new;

  if to_regclass('public.audit_logs') is not null then
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
      'admin_order_cancelled',
      'Pedido cancelado por administrador',
      v_admin_id,
      v_admin.email,
      coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
      v_new.id,
      v_new.customer_email,
      v_new.customer_name,
      jsonb_build_object(
        'reason', v_reason,
        'previous', to_jsonb(v_old),
        'new', to_jsonb(v_new),
        'responsible', jsonb_build_object(
          'id', v_admin_id,
          'email', v_admin.email,
          'name', coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email)
        )
      ),
      v_request_id,
      now()
    );
  end if;

  return v_new;
end;
$$;

revoke all on function public.admin_update_order_with_reason(uuid, jsonb, text, text) from public;
revoke all on function public.admin_update_order_with_reason(uuid, jsonb, text, text) from anon;
grant execute on function public.admin_update_order_with_reason(uuid, jsonb, text, text) to authenticated;

revoke all on function public.admin_cancel_order_with_reason(uuid, text, text) from public;
revoke all on function public.admin_cancel_order_with_reason(uuid, text, text) from anon;
grant execute on function public.admin_cancel_order_with_reason(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
