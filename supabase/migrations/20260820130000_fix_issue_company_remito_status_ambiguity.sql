begin;

-- Replace the active issue_company_remito implementation without changing its
-- public signature. The previous body had an unqualified status reference inside
-- PL/pgSQL, which conflicts with the RETURNS TABLE output column named status.
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
  from public.users as u
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

  select c.*
  into v_company
  from public.companies as c
  where c.slug = v_slug
  for update;

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
  returning public.company_remitos.*
  into v_existing;

  update public.companies as c
  set remito_start_number = v_range_start,
      remito_end_number = v_range_end,
      next_remito_number = v_number + 1
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

revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

commit;

