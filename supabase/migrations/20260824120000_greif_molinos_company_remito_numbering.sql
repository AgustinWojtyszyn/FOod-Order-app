begin;

create or replace function public.normalize_company_remito_slug(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with normalized as (
    select trim(both '_' from regexp_replace(
      translate(lower(trim(coalesce(p_value, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '_',
      'g'
    )) as slug
  )
  select case
    when slug = 'ccp' or slug like 'ccp_%' then 'ccp'
    when slug in ('distrocuyo', 'distro_cuyo') or slug like 'distrocuyo_%' or slug like 'distro_cuyo_%' then 'distro_cuyo'
    when slug = 'epse' or slug like 'epse_%' then 'epse'
    when slug = 'genneia' or slug like 'genneia_%' then 'genneia'
    when slug in ('la_laja', 'laja') or slug like 'la_laja_%' or slug like 'laja_%' then 'laja'
    when slug in ('los_berros', 'losberros') or slug like 'los_berros_%' or slug like 'losberros_%' then 'losberros'
    when slug in ('padre_bueno', 'padrebueno') or slug like 'padre_bueno_%' or slug like 'padrebueno_%' then 'padrebueno'
    when slug = 'greif' or slug like 'greif_%' then 'greif'
    when slug = 'molinos' or slug like 'molinos_%' then 'molinos'
    when slug in ('global', 'general') then 'global'
    when slug in (
      'administracion',
      'administracion_servifood',
      'administracion_servi_food',
      'admin_servifood',
      'admin_servi_food'
    ) then 'administracion_servifood'
    else slug
  end
  from normalized;
$$;

insert into public.companies (slug, name, remito_start_number, remito_end_number, next_remito_number)
values
  ('greif', 'Greif', 80000, 89999, 80000),
  ('molinos', 'Molinos', 90000, 99999, 90000)
on conflict (slug) do update
set name = coalesce(nullif(trim(excluded.name), ''), public.companies.name),
    remito_start_number = excluded.remito_start_number,
    remito_end_number = excluded.remito_end_number,
    next_remito_number = case
      when public.companies.next_remito_number between excluded.remito_start_number and excluded.remito_end_number + 1
        then public.companies.next_remito_number
      else excluded.next_remito_number
    end,
    updated_at = now();

create or replace function public.get_companies_remito_config()
returns table (
  id uuid,
  slug text,
  name text,
  remito_start_number integer,
  remito_end_number integer,
  next_remito_number integer,
  issued_count bigint,
  last_remito_number integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    c.id,
    c.slug,
    c.name,
    c.remito_start_number,
    c.remito_end_number,
    c.next_remito_number,
    count(cr.id)::bigint as issued_count,
    max(cr.remito_number)::integer as last_remito_number,
    c.updated_at
  from public.companies c
  left join public.company_remitos cr on cr.company_id = c.id
  where c.slug not in ('global', 'administracion_servifood')
    and (public.is_admin() or public.is_company_admin(c.slug))
  group by c.id, c.slug, c.name, c.remito_start_number, c.remito_end_number, c.next_remito_number, c.updated_at
  order by c.name asc;
end;
$$;

create or replace function public.update_company_remito_start(
  p_company_slug text,
  p_remito_start_number integer
)
returns table (
  id uuid,
  slug text,
  name text,
  remito_start_number integer,
  remito_end_number integer,
  next_remito_number integer,
  issued_count bigint,
  last_remito_number integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_slug text;
  v_next_number integer;
  v_issued_count bigint;
  v_last_number integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  v_slug := public.normalize_company_remito_slug(p_company_slug);

  if nullif(v_slug, '') is null then
    raise exception 'company_required';
  end if;

  if v_slug in ('global', 'administracion_servifood') then
    raise exception 'company_remito_numbering_excluded';
  end if;

  select c.*
  into v_company
  from public.companies as c
  where c.slug = v_slug
  for update;

  if not found then
    raise exception 'company_not_found';
  end if;

  if v_company.remito_start_number is null
    or v_company.remito_end_number is null
    or v_company.next_remito_number is null
    or v_company.remito_start_number <= 0
    or v_company.remito_end_number <= 0
    or v_company.next_remito_number <= 0
    or v_company.remito_start_number > v_company.remito_end_number
    or v_company.next_remito_number < v_company.remito_start_number
    or v_company.next_remito_number > v_company.remito_end_number + 1
  then
    raise exception 'company_remito_numbering_not_configured';
  end if;

  if p_remito_start_number is null or p_remito_start_number <> v_company.remito_start_number then
    raise exception 'remito_start_number_out_of_range';
  end if;

  select
    count(cr.id),
    max(cr.remito_number)
  into v_issued_count, v_last_number
  from public.company_remitos cr
  where cr.company_id = v_company.id
    and cr.remito_number between v_company.remito_start_number and v_company.remito_end_number;

  v_next_number := least(
    v_company.remito_end_number + 1,
    greatest(
      v_company.next_remito_number,
      coalesce(v_last_number + 1, v_company.remito_start_number),
      v_company.remito_start_number
    )
  );

  update public.companies as c
  set next_remito_number = v_next_number,
      updated_at = now()
  where c.id = v_company.id;

  return query
  select cfg.*
  from public.get_companies_remito_config() cfg
  where cfg.slug = v_slug;
end;
$$;

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

  if v_slug in ('global', 'administracion_servifood') then
    raise exception 'company_remito_numbering_excluded';
  end if;

  if p_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;

  select c.*
  into v_company
  from public.companies as c
  where c.slug = v_slug
  for update;

  if not found then
    raise exception 'company_not_found';
  end if;

  if not public.is_company_admin(v_company.slug) then
    raise exception 'not_authorized';
  end if;

  if v_company.remito_start_number is null
    or v_company.remito_end_number is null
    or v_company.next_remito_number is null
    or v_company.remito_start_number <= 0
    or v_company.remito_end_number <= 0
    or v_company.next_remito_number <= 0
    or v_company.remito_start_number > v_company.remito_end_number
    or v_company.next_remito_number < v_company.remito_start_number
    or v_company.next_remito_number > v_company.remito_end_number + 1
  then
    raise exception 'company_remito_numbering_not_configured';
  end if;

  select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
  into v_actor_email, v_actor_name
  from public.users as u
  where u.id = auth.uid();

  if v_request_id is not null then
    select cr.*
    into v_existing
    from public.company_remitos as cr
    where cr.request_id = v_request_id
      and cr.status = 'issued';

    if found then
      return query
      select
        v_existing.id as remito_id,
        v_company.slug as company_slug,
        v_company.name as company_name,
        v_existing.remito_number as remito_number,
        v_existing.delivery_date as delivery_date,
        v_existing.issued_at as issued_at,
        true as reused,
        v_existing.status as status,
        v_existing.snapshot as snapshot,
        v_actor_email as issued_by_email,
        v_actor_name as issued_by_name,
        v_existing.location_key as location_key;
      return;
    end if;
  end if;

  select cr.*
  into v_existing
  from public.company_remitos as cr
  where cr.company_id = v_company.id
    and cr.delivery_date = p_delivery_date
    and cr.location_key = v_location_key
    and cr.status = 'issued';

  if found then
    return query
    select
      v_existing.id as remito_id,
      v_company.slug as company_slug,
      v_company.name as company_name,
      v_existing.remito_number as remito_number,
      v_existing.delivery_date as delivery_date,
      v_existing.issued_at as issued_at,
      true as reused,
      v_existing.status as status,
      v_existing.snapshot as snapshot,
      v_actor_email as issued_by_email,
      v_actor_name as issued_by_name,
      v_existing.location_key as location_key;
    return;
  end if;

  select max(cr.remito_number)
  into v_last_number
  from public.company_remitos as cr
  where cr.company_id = v_company.id
    and cr.remito_number between v_company.remito_start_number and v_company.remito_end_number;

  v_number := least(
    v_company.remito_end_number + 1,
    greatest(
      v_company.next_remito_number,
      coalesce(v_last_number + 1, v_company.remito_start_number),
      v_company.remito_start_number
    )
  );

  if v_number > v_company.remito_end_number then
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
  returning public.company_remitos.*
  into v_existing;

  update public.companies as c
  set next_remito_number = v_number + 1,
      updated_at = now()
  where c.id = v_company.id;

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
    v_existing.id as remito_id,
    v_company.slug as company_slug,
    v_company.name as company_name,
    v_existing.remito_number as remito_number,
    v_existing.delivery_date as delivery_date,
    v_existing.issued_at as issued_at,
    false as reused,
    v_existing.status as status,
    v_existing.snapshot as snapshot,
    v_actor_email as issued_by_email,
    v_actor_name as issued_by_name,
    v_existing.location_key as location_key;
end;
$$;

revoke all on function public.normalize_company_remito_slug(text) from public;
revoke all on function public.normalize_company_remito_slug(text) from anon;

revoke all on function public.get_companies_remito_config() from public;
revoke all on function public.get_companies_remito_config() from anon;
grant execute on function public.get_companies_remito_config() to authenticated;

revoke all on function public.update_company_remito_start(text, integer) from public;
revoke all on function public.update_company_remito_start(text, integer) from anon;
grant execute on function public.update_company_remito_start(text, integer) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

commit;
