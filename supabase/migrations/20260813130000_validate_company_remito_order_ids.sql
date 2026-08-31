-- Validate remito issuance order_ids server-side before consuming numbering.

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
  v_current_order_ids uuid[];
  v_requested_order_ids uuid[];
  v_snapshot_order_ids uuid[];
  v_snapshot_source_order_ids uuid[];
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
    where request_id = v_request_id;

    if found then
      if v_existing.company_id <> v_company.id
        or v_existing.delivery_date <> p_delivery_date
        or v_existing.location_key <> v_location_key then
        raise exception 'remito_request_mismatch';
      end if;

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

  if p_snapshot is not null and jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'snapshot_invalid';
  end if;

  if p_snapshot is not null
    and nullif(p_snapshot->>'companySlug', '') is not null
    and public.normalize_company_remito_slug(p_snapshot->>'companySlug') <> v_company.slug then
    raise exception 'snapshot_company_mismatch';
  end if;

  if p_snapshot is not null
    and nullif(p_snapshot->>'deliveryDate', '') is not null
    and (p_snapshot->>'deliveryDate')::date <> p_delivery_date then
    raise exception 'snapshot_delivery_date_mismatch';
  end if;

  if p_snapshot is not null
    and nullif(p_snapshot->>'locationKey', '') is not null
    and (p_snapshot->>'locationKey') <> v_location_key then
    raise exception 'snapshot_location_mismatch';
  end if;

  select coalesce(array_agg(o.id order by o.id), array[]::uuid[])
  into v_current_order_ids
  from public.orders o
  where o.delivery_date = p_delivery_date
    and o.status = any(array['pending', 'archived'])
    and (
      public.normalize_company_remito_slug(coalesce(o.company_slug, '')) = v_company.slug
      or public.normalize_company_remito_slug(coalesce(o.company_name, '')) = v_company.slug
      or public.normalize_company_remito_slug(coalesce(o.location, o.delivery_location, '')) = v_company.slug
      or public.admin_extra_company_location_allowed(v_company.slug, coalesce(o.location, o.delivery_location, ''))
    )
    and (
      v_location_key = ''
      or trim(both '_' from regexp_replace(
        translate(lower(trim(coalesce(o.location, o.delivery_location, ''))), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]+',
        '_',
        'g'
      )) = v_location_key
    );

  select coalesce(array_agg(order_id order by order_id), array[]::uuid[])
  into v_requested_order_ids
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as order_id;

  if v_requested_order_ids <> v_current_order_ids then
    raise exception 'remito_orders_mismatch';
  end if;

  if p_snapshot is not null then
    select coalesce(array_agg(order_id order by order_id), array[]::uuid[])
    into v_snapshot_order_ids
    from (
      select value::uuid as order_id
      from jsonb_array_elements_text(coalesce(p_snapshot->'orderIds', '[]'::jsonb)) as value
    ) ids;

    select coalesce(array_agg(order_id order by order_id), array[]::uuid[])
    into v_snapshot_source_order_ids
    from (
      select (source_order->>'id')::uuid as order_id
      from jsonb_array_elements(coalesce(p_snapshot->'sourceOrders', '[]'::jsonb)) as source_order
      where nullif(source_order->>'id', '') is not null
    ) ids;

    if v_snapshot_order_ids <> v_current_order_ids
      or v_snapshot_source_order_ids <> v_current_order_ids then
      raise exception 'remito_orders_mismatch';
    end if;
  end if;

  select *
  into v_existing
  from public.company_remitos
  where company_remitos.company_id = v_company.id
    and company_remitos.delivery_date = p_delivery_date
    and company_remitos.location_key = v_location_key;

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
        'order_ids', coalesce(p_order_ids, array[]::uuid[]),
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

create or replace function public.issue_company_remito(
  p_company_slug text,
  p_company_name text,
  p_delivery_date date,
  p_order_ids uuid[] default array[]::uuid[]
)
returns table (
  remito_id uuid,
  company_slug text,
  company_name text,
  remito_number integer,
  delivery_date date,
  issued_at timestamptz,
  reused boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    remito_id,
    company_slug,
    company_name,
    remito_number,
    delivery_date,
    issued_at,
    reused
  from public.issue_company_remito(
    p_company_slug,
    p_company_name,
    p_delivery_date,
    p_order_ids,
    null,
    null,
    ''
  );
$$;

revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[]) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[]) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[]) to authenticated;
