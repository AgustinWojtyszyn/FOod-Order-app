begin;

-- Allow a cancelled remito to remain auditable without blocking a new issued
-- remito for the same company/date/location. Number uniqueness remains intact.
drop index if exists public.company_remitos_company_date_location_unique;
create unique index if not exists company_remitos_company_date_location_issued_unique
  on public.company_remitos (company_id, delivery_date, location_key)
  where status = 'issued';

drop index if exists public.company_remitos_request_id_unique;
create unique index if not exists company_remitos_request_id_issued_unique
  on public.company_remitos (request_id)
  where request_id is not null
    and status = 'issued';

create or replace function public.issue_company_remito(
  p_company_slug text,
  p_company_name text,
  p_delivery_date date,
  p_order_ids uuid[] default array[]::uuid[],
  p_request_id text default null,
  p_snapshot jsonb default null,
  p_location_key text default ''
)
returns table (
  remito_id uuid,
  company_slug text,
  company_name text,
  remito_number integer,
  delivery_date date,
  issued_at timestamptz,
  reused boolean,
  status text,
  snapshot jsonb,
  issued_by_email text,
  issued_by_name text,
  location_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_existing public.company_remitos%rowtype;
  v_slug text;
  v_name text;
  v_range_start integer;
  v_range_end integer;
  v_last_number integer;
  v_number integer;
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_location_key text := trim(coalesce(p_location_key, ''));
  v_snapshot jsonb;
  v_actor_email text;
  v_actor_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_slug := public.normalize_company_remito_slug(p_company_slug);

  if nullif(v_slug, '') is null then
    raise exception 'company_required';
  end if;

  if not public.is_company_admin(v_slug) then
    raise exception 'not_authorized';
  end if;

  if v_slug = 'administracion_servifood' then
    raise exception 'company_remito_numbering_excluded';
  end if;

  if p_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;

  select
    case v_slug
      when 'ccp' then 10000
      when 'distro_cuyo' then 20000
      when 'epse' then 30000
      when 'genneia' then 40000
      when 'laja' then 50000
      when 'losberros' then 60000
      when 'padrebueno' then 70000
    end,
    case v_slug
      when 'ccp' then 19999
      when 'distro_cuyo' then 29999
      when 'epse' then 39999
      when 'genneia' then 49999
      when 'laja' then 59999
      when 'losberros' then 69999
      when 'padrebueno' then 79999
    end
  into v_range_start, v_range_end;

  if v_range_start is null or v_range_end is null then
    raise exception 'company_not_found';
  end if;

  select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
  into v_actor_email, v_actor_name
  from public.users u
  where u.id = auth.uid();

  v_name := coalesce(nullif(trim(p_company_name), ''), v_slug);

  insert into public.companies (slug, name, remito_start_number, remito_end_number, next_remito_number)
  values (v_slug, v_name, v_range_start, v_range_end, v_range_start)
  on conflict (slug) do update
  set name = coalesce(nullif(trim(excluded.name), ''), public.companies.name),
      remito_start_number = v_range_start,
      remito_end_number = v_range_end,
      next_remito_number = case
        when public.companies.next_remito_number between v_range_start and v_range_end + 1
          then public.companies.next_remito_number
        else v_range_start
      end,
      updated_at = now();

  select *
  into v_company
  from public.companies
  where companies.slug = v_slug
  for update;

  if v_request_id is not null then
    select *
    into v_existing
    from public.company_remitos
    where request_id = v_request_id
      and status = 'issued';

    if found then
      return query
      select
        v_existing.id,
        v_company.slug,
        v_company.name,
        v_existing.remito_number,
        v_existing.delivery_date,
        v_existing.issued_at,
        true,
        v_existing.status,
        v_existing.snapshot,
        v_actor_email,
        v_actor_name,
        v_existing.location_key;
      return;
    end if;
  end if;

  select *
  into v_existing
  from public.company_remitos
  where company_remitos.company_id = v_company.id
    and company_remitos.delivery_date = p_delivery_date
    and company_remitos.location_key = v_location_key
    and company_remitos.status = 'issued';

  if found then
    return query
    select
      v_existing.id,
      v_company.slug,
      v_company.name,
      v_existing.remito_number,
      v_existing.delivery_date,
      v_existing.issued_at,
      true,
      v_existing.status,
      v_existing.snapshot,
      v_actor_email,
      v_actor_name,
      v_existing.location_key;
    return;
  end if;

  select max(cr.remito_number)
  into v_last_number
  from public.company_remitos cr
  where cr.company_id = v_company.id
    and cr.remito_number between v_range_start and v_range_end;

  v_number := least(
    v_range_end + 1,
    greatest(
      case
        when v_company.next_remito_number between v_range_start and v_range_end + 1
          then v_company.next_remito_number
        else v_range_start
      end,
      coalesce(v_last_number + 1, v_range_start),
      v_range_start
    )
  );

  if v_number > v_range_end then
    raise exception 'company_remito_range_exhausted';
  end if;

  v_snapshot := coalesce(p_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'status', 'issued',
      'companySlug', v_company.slug,
      'companyName', v_company.name,
      'remitoNumber', v_number,
      'deliveryDate', p_delivery_date,
      'serviceDate', p_delivery_date,
      'issuedAt', now(),
      'issuedBy', jsonb_build_object(
        'id', auth.uid(),
        'email', v_actor_email,
        'name', v_actor_name
      ),
      'locationKey', v_location_key
    );

  insert into public.company_remitos (
    company_id,
    remito_number,
    delivery_date,
    order_ids,
    issued_by,
    status,
    snapshot,
    request_id,
    location_key
  )
  values (
    v_company.id,
    v_number,
    p_delivery_date,
    coalesce(p_order_ids, array[]::uuid[]),
    auth.uid(),
    'issued',
    v_snapshot,
    v_request_id,
    v_location_key
  )
  returning *
  into v_existing;

  update public.companies
  set remito_start_number = v_range_start,
      remito_end_number = v_range_end,
      next_remito_number = v_number + 1
  where companies.id = v_company.id;

  if to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs (
      action,
      details,
      actor_id,
      actor_email,
      actor_name,
      target_id,
      target_name,
      metadata,
      request_id,
      created_at
    )
    values (
      'company_remito_issued',
      'Remito emitido',
      auth.uid(),
      v_actor_email,
      v_actor_name,
      v_existing.id,
      v_company.name,
      jsonb_build_object(
        'company_slug', v_company.slug,
        'delivery_date', p_delivery_date,
        'issued_at', v_existing.issued_at,
        'remito_number', v_number,
        'location_key', v_location_key,
        'retroactive', p_delivery_date <> (now() at time zone 'America/Argentina/Buenos_Aires')::date
      ),
      v_request_id,
      now()
    )
    on conflict (request_id, action) where request_id is not null do nothing;
  end if;

  return query
  select
    v_existing.id,
    v_company.slug,
    v_company.name,
    v_existing.remito_number,
    v_existing.delivery_date,
    v_existing.issued_at,
    false,
    v_existing.status,
    v_existing.snapshot,
    v_actor_email,
    v_actor_name,
    v_existing.location_key;
end;
$$;

revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) to authenticated;

do $$
declare
  v_epse_id uuid;
  v_remito public.company_remitos%rowtype;
  v_target_count integer;
  v_snapshot_total_items integer;
  v_referenced_order_count integer;
  v_active_epse_remito_count integer;
  v_active_overlap_count integer;
begin
  select id
  into v_epse_id
  from public.companies
  where slug = 'epse';

  if v_epse_id is null then
    raise exception 'epse_company_not_found';
  end if;

  select count(*)
  into v_target_count
  from public.company_remitos cr
  where cr.company_id = v_epse_id
    and cr.remito_number = 30005
    and cr.delivery_date = date '2026-08-20'
    and cr.status = 'issued'
    and cardinality(coalesce(cr.order_ids, array[]::uuid[])) = 44
    and (
      case
        when coalesce(cr.snapshot->>'totalItems', cr.snapshot->>'totalMenus', '') ~ '^[0-9]+$'
          then coalesce(cr.snapshot->>'totalItems', cr.snapshot->>'totalMenus')::integer
        else cardinality(coalesce(cr.order_ids, array[]::uuid[]))
      end
    ) = 44;

  if v_target_count <> 1 then
    raise exception 'epse_remito_30005_guard_failed: expected exactly 1 row, found %', v_target_count;
  end if;

  select *
  into v_remito
  from public.company_remitos cr
  where cr.company_id = v_epse_id
    and cr.remito_number = 30005
    and cr.delivery_date = date '2026-08-20'
    and cr.status = 'issued'
  for update;

  v_snapshot_total_items := case
    when coalesce(v_remito.snapshot->>'totalItems', v_remito.snapshot->>'totalMenus', '') ~ '^[0-9]+$'
      then coalesce(v_remito.snapshot->>'totalItems', v_remito.snapshot->>'totalMenus')::integer
    else cardinality(coalesce(v_remito.order_ids, array[]::uuid[]))
  end;

  if cardinality(coalesce(v_remito.order_ids, array[]::uuid[])) <> 44
    or v_snapshot_total_items <> 44 then
    raise exception 'epse_remito_30005_total_items_guard_failed';
  end if;

  select count(*)
  into v_referenced_order_count
  from public.orders o
  where o.id = any(coalesce(v_remito.order_ids, array[]::uuid[]));

  if v_referenced_order_count <> 44 then
    raise exception 'epse_remito_30005_referenced_orders_guard_failed: found %', v_referenced_order_count;
  end if;

  update public.company_remitos
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = 'Cancelado por agrupamiento incorrecto de múltiples sedes EPSE',
      updated_at = now(),
      updated_by = auth.uid()
  where id = v_remito.id
    and company_id = v_epse_id
    and remito_number = 30005
    and delivery_date = date '2026-08-20'
    and status = 'issued'
    and cardinality(coalesce(order_ids, array[]::uuid[])) = 44;

  get diagnostics v_target_count = row_count;
  if v_target_count <> 1 then
    raise exception 'epse_remito_30005_cancel_failed: expected 1 updated row, updated %', v_target_count;
  end if;

  if exists (
    select 1
    from public.company_remitos cr
    where cr.id = v_remito.id
      and (
        cr.company_id is distinct from v_remito.company_id
        or cr.remito_number is distinct from v_remito.remito_number
        or cr.delivery_date is distinct from v_remito.delivery_date
        or cr.order_ids is distinct from v_remito.order_ids
        or cr.snapshot is distinct from v_remito.snapshot
        or cr.issued_by is distinct from v_remito.issued_by
        or cr.issued_at is distinct from v_remito.issued_at
        or cr.created_at is distinct from v_remito.created_at
      )
  ) then
    raise exception 'epse_remito_30005_audit_fields_changed';
  end if;

  select count(*)
  into v_referenced_order_count
  from public.orders o
  where o.id = any(coalesce(v_remito.order_ids, array[]::uuid[]));

  if v_referenced_order_count <> 44 then
    raise exception 'epse_remito_30005_referenced_orders_changed: found %', v_referenced_order_count;
  end if;

  select count(*)
  into v_active_epse_remito_count
  from public.company_remitos cr
  where cr.company_id = v_epse_id
    and cr.delivery_date = date '2026-08-20'
    and cr.status = 'issued';

  if v_active_epse_remito_count <> 0 then
    raise exception 'unexpected_active_epse_remitos_after_cancel: %', v_active_epse_remito_count;
  end if;

  select count(*)
  into v_active_overlap_count
  from (
    select order_id
    from public.company_remitos cr
    cross join unnest(coalesce(cr.order_ids, array[]::uuid[])) as order_id
    where cr.company_id = v_epse_id
      and cr.delivery_date = date '2026-08-20'
      and cr.status = 'issued'
    group by order_id
    having count(*) > 1
  ) duplicated_active_orders;

  if v_active_overlap_count <> 0 then
    raise exception 'active_epse_remitos_have_duplicate_orders: %', v_active_overlap_count;
  end if;

  if to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs (
      action,
      details,
      actor_id,
      actor_email,
      actor_name,
      target_id,
      target_name,
      metadata,
      request_id,
      created_at
    )
    select
      'company_remito_cancelled',
      'Remito cancelado por agrupamiento incorrecto',
      auth.uid(),
      u.email,
      coalesce(nullif(trim(u.full_name), ''), u.email),
      v_remito.id,
      'EPSE',
      jsonb_build_object(
        'company_slug', 'epse',
        'delivery_date', '2026-08-20',
        'remito_number', 30005,
        'total_items', 44,
        'order_ids_count', cardinality(coalesce(v_remito.order_ids, array[]::uuid[])),
        'reason', 'Cancelado por agrupamiento incorrecto de múltiples sedes EPSE',
        'preserved_snapshot', true,
        'orders_modified', false
      ),
      'cancel-epse-remito-30005-2026-08-20',
      now()
    from (select 1) seed
    left join public.users u on u.id = auth.uid()
    on conflict (request_id, action) where request_id is not null do nothing;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
