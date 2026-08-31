-- Make late admin extra history retroactive on read/close.
-- The UI must not depend on the history table having been pre-populated.

begin;

create or replace function public.backfill_late_admin_extra_history_for_date(p_operational_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_inserted integer := 0;
begin
  if p_operational_date is null then
    raise exception 'operational_date_required';
  end if;

  select * into v_bounds
  from public.late_admin_extra_operational_bounds(p_operational_date);

  insert into public.late_admin_extra_order_history (
    order_id,
    operational_date,
    delivery_date,
    window_started_at,
    window_closed_at,
    created_at,
    created_by,
    created_by_email,
    created_by_name,
    company_slug,
    company_name,
    location,
    delivery_location,
    location_key,
    service,
    total_items,
    detail,
    order_snapshot,
    historical_status,
    create_request_id,
    create_audit_log_id,
    source
  )
  select
    case
      when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
    end,
    p_operational_date,
    coalesce(o.delivery_date, nullif(a.metadata->>'delivery_date', '')::date),
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    coalesce(o.created_at, a.created_at),
    a.actor_id,
    a.actor_email,
    a.actor_name,
    coalesce(o.company_slug, a.metadata->'snapshot'->>'company_slug'),
    coalesce(o.company_name, a.metadata->'snapshot'->>'company_name'),
    coalesce(o.location, a.metadata->'snapshot'->>'location'),
    coalesce(o.delivery_location, a.metadata->'snapshot'->>'delivery_location'),
    coalesce(o.requesting_location_code, a.metadata->'snapshot'->>'requesting_location_code', ''),
    coalesce(o.service, a.metadata->'snapshot'->>'service'),
    public.late_admin_extra_order_units(coalesce(to_jsonb(o), a.metadata->'snapshot', '{}'::jsonb)),
    public.late_admin_extra_order_snapshot_detail(coalesce(to_jsonb(o), a.metadata->'snapshot', '{}'::jsonb)),
    coalesce(to_jsonb(o), a.metadata->'snapshot', jsonb_build_object('audit_metadata', a.metadata)),
    case when d.id is null then 'created' else 'deleted' end,
    a.request_id,
    a.id,
    'on_read_backfill_audit_logs'
  from public.audit_logs a
  left join public.orders o on o.id = (
    case
      when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
    end
  )
  left join public.audit_logs d on d.action = 'admin_extra_order_deleted'
    and d.metadata->>'order_id' = coalesce(a.metadata->>'order_id', a.target_id::text)
  where a.action = 'late_admin_extra_order_created'
    and a.created_at >= v_bounds.window_started_at
    and a.created_at < v_bounds.window_closed_at
    and coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  on conflict (order_id) where order_id is not null do update
  set create_request_id = coalesce(late_admin_extra_order_history.create_request_id, excluded.create_request_id),
      create_audit_log_id = coalesce(late_admin_extra_order_history.create_audit_log_id, excluded.create_audit_log_id),
      updated_at = now();

  get diagnostics v_inserted = row_count;

  update public.late_admin_extra_order_history h
  set historical_status = 'deleted',
      deleted_at = d.created_at,
      deleted_by = d.actor_id,
      deleted_by_email = d.actor_email,
      deleted_by_name = d.actor_name,
      deleted_reason = d.metadata->>'reason',
      delete_request_id = d.request_id,
      delete_audit_log_id = d.id,
      updated_at = now()
  from public.audit_logs d
  where h.operational_date = p_operational_date
    and d.action = 'admin_extra_order_deleted'
    and d.metadata->>'order_id' = h.order_id::text
    and h.deleted_at is null;

  return v_inserted;
end;
$$;

create or replace function public.get_late_admin_extra_history_days(
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  operational_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz,
  total_orders integer,
  total_units integer,
  deleted_orders integer,
  status text,
  closure_id uuid,
  closure_version integer,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;

  for v_day in
    select distinct public.resolve_late_admin_extra_operational_date(a.created_at)
    from public.audit_logs a
    where a.action = 'late_admin_extra_order_created'
      and (p_from_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) >= p_from_date)
      and (p_to_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) <= p_to_date)
  loop
    perform public.backfill_late_admin_extra_history_for_date(v_day);
  end loop;

  return query
  with days as (
    select h.operational_date
    from public.late_admin_extra_order_history h
    where (p_from_date is null or h.operational_date >= p_from_date)
      and (p_to_date is null or h.operational_date <= p_to_date)
    union
    select public.resolve_late_admin_extra_operational_date(a.created_at)
    from public.audit_logs a
    where a.action = 'late_admin_extra_order_created'
      and (p_from_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) >= p_from_date)
      and (p_to_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) <= p_to_date)
    union
    select c.operational_date
    from public.late_admin_extra_order_closures c
    where (p_from_date is null or c.operational_date >= p_from_date)
      and (p_to_date is null or c.operational_date <= p_to_date)
  )
  select
    d.operational_date,
    b.window_started_at,
    b.window_closed_at,
    count(h.id)::integer,
    coalesce(sum(h.total_items), 0)::integer,
    count(h.id) filter (where h.deleted_at is not null)::integer,
    case
      when c.id is not null then 'closed'
      when now() >= b.window_closed_at then 'ready_to_close'
      else 'open'
    end,
    c.id,
    c.version,
    c.closed_at
  from days d
  cross join lateral public.late_admin_extra_operational_bounds(d.operational_date) b
  left join public.late_admin_extra_order_history h on h.operational_date = d.operational_date
  left join public.late_admin_extra_order_closures c on c.operational_date = d.operational_date
  group by d.operational_date, b.window_started_at, b.window_closed_at, c.id, c.version, c.closed_at
  order by d.operational_date desc;
end;
$$;

create or replace function public.get_late_admin_extra_history_for_day(p_operational_date date)
returns setof public.late_admin_extra_order_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  perform public.backfill_late_admin_extra_history_for_date(p_operational_date);

  return query
  select *
  from public.late_admin_extra_order_history
  where operational_date = p_operational_date
  order by created_at asc, id asc;
end;
$$;

create or replace function public.close_late_admin_extra_operational_day(p_operational_date date)
returns public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_existing public.late_admin_extra_order_closures%rowtype;
  v_result public.late_admin_extra_order_closures%rowtype;
  v_actor public.users;
  v_snapshot jsonb;
  v_total_orders integer := 0;
  v_total_units integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  select * into v_bounds from public.late_admin_extra_operational_bounds(p_operational_date);
  if now() < v_bounds.window_closed_at then
    raise exception 'late_extra_operational_day_open';
  end if;

  perform public.backfill_late_admin_extra_history_for_date(p_operational_date);

  select * into v_existing
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date
  for update;
  if found then return v_existing; end if;

  select * into v_actor from public.users where id = auth.uid();

  select count(*)::integer, coalesce(sum(total_items), 0)::integer
  into v_total_orders, v_total_units
  from public.late_admin_extra_order_history h
  where h.operational_date = p_operational_date
    and h.created_at >= v_bounds.window_started_at
    and h.created_at < v_bounds.window_closed_at;

  select jsonb_build_object(
    'version', 1,
    'operationalDate', p_operational_date,
    'windowStartedAt', v_bounds.window_started_at,
    'windowClosedAt', v_bounds.window_closed_at,
    'totalOrders', v_total_orders,
    'totalUnits', v_total_units,
    'rows', coalesce(jsonb_agg(to_jsonb(h) order by h.created_at, h.id) filter (where h.id is not null), '[]'::jsonb)
  )
  into v_snapshot
  from public.late_admin_extra_order_history h
  where h.operational_date = p_operational_date
    and h.created_at >= v_bounds.window_started_at
    and h.created_at < v_bounds.window_closed_at;

  insert into public.late_admin_extra_order_closures (
    operational_date,
    window_started_at,
    window_closed_at,
    closed_by,
    closed_by_email,
    total_orders,
    total_units,
    snapshot
  )
  values (
    p_operational_date,
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    auth.uid(),
    v_actor.email,
    v_total_orders,
    v_total_units,
    coalesce(v_snapshot, '{}'::jsonb)
  )
  returning * into v_result;

  insert into public.audit_logs (
    action, details, actor_id, actor_email, actor_name, target_id, target_name, metadata, request_id, created_at
  )
  values (
    'late_admin_extra_operational_day_closed',
    'Cierre operativo de pedidos extra fuera de termino',
    auth.uid(),
    v_actor.email,
    coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email),
    v_result.id,
    p_operational_date::text,
    jsonb_build_object('operational_date', p_operational_date, 'total_orders', v_total_orders, 'total_units', v_total_units),
    concat('late-extra-closure:', p_operational_date::text, ':', v_result.version::text),
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_result;
end;
$$;

revoke all on function public.backfill_late_admin_extra_history_for_date(date) from public, anon;
grant execute on function public.backfill_late_admin_extra_history_for_date(date) to authenticated;

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.get_late_admin_extra_history_for_day(date) from public, anon;
grant execute on function public.get_late_admin_extra_history_for_day(date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;

notify pgrst, 'reload schema';

commit;
