-- Allows an issued remito snapshot to be refreshed explicitly without consuming a new number.

alter table public.company_remitos
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists snapshot_version integer not null default 1;

create or replace function public.prevent_issued_remito_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_allow_refresh boolean := coalesce(current_setting('app.allow_issued_remito_snapshot_refresh', true), '') = 'on';
begin
  if old.status = 'issued' then
    if old.company_id is distinct from new.company_id
      or old.remito_number is distinct from new.remito_number
      or old.delivery_date is distinct from new.delivery_date
      or old.location_key is distinct from new.location_key then
      raise exception 'issued_remito_snapshot_immutable';
    end if;

    if not v_allow_refresh and (
      old.order_ids is distinct from new.order_ids
      or old.snapshot is distinct from new.snapshot
    ) then
      raise exception 'issued_remito_snapshot_immutable';
    end if;
  end if;

  return new;
end;
$$;

drop function if exists public.get_company_remitos_for_date(date, text, text);

create or replace function public.get_company_remitos_for_date(
  p_delivery_date date,
  p_company_slug text default null,
  p_location_key text default null
)
returns table (
  remito_id uuid,
  company_slug text,
  company_name text,
  remito_number integer,
  delivery_date date,
  issued_at timestamptz,
  issued_by uuid,
  issued_by_email text,
  issued_by_name text,
  status text,
  order_ids uuid[],
  snapshot jsonb,
  request_id text,
  location_key text,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_email text,
  updated_by_name text,
  snapshot_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := public.normalize_company_remito_slug(coalesce(p_company_slug, ''));
  v_location_key text := nullif(trim(coalesce(p_location_key, '')), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    cr.id,
    c.slug,
    c.name,
    cr.remito_number,
    cr.delivery_date,
    cr.issued_at,
    cr.issued_by,
    issuer.email,
    coalesce(nullif(trim(issuer.full_name), ''), issuer.email),
    cr.status,
    cr.order_ids,
    cr.snapshot,
    cr.request_id,
    cr.location_key,
    cr.updated_at,
    cr.updated_by,
    updater.email,
    coalesce(nullif(trim(updater.full_name), ''), updater.email),
    cr.snapshot_version
  from public.company_remitos cr
  join public.companies c on c.id = cr.company_id
  left join public.users issuer on issuer.id = cr.issued_by
  left join public.users updater on updater.id = cr.updated_by
  where cr.delivery_date = p_delivery_date
    and (v_slug = '' or c.slug = v_slug)
    and (v_location_key is null or cr.location_key = v_location_key)
    and (
      public.is_admin()
      or public.is_company_admin(c.slug)
    )
  order by c.name, cr.location_key, cr.remito_number;
end;
$$;

create or replace function public.refresh_company_remito_snapshot(
  p_remito_id uuid,
  p_order_ids uuid[] default array[]::uuid[],
  p_snapshot jsonb default null,
  p_request_id text default null
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
  location_key text,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_email text,
  updated_by_name text,
  snapshot_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_existing public.company_remitos%rowtype;
  v_snapshot jsonb;
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_actor_email text;
  v_actor_name text;
  v_issued_by_email text;
  v_issued_by_name text;
  v_current_order_ids uuid[];
  v_requested_order_ids uuid[];
  v_snapshot_order_ids uuid[];
  v_snapshot_source_order_ids uuid[];
  v_old_totals jsonb;
  v_new_totals jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_remito_id is null then
    raise exception 'remito_required';
  end if;

  select *
  into v_existing
  from public.company_remitos
  where id = p_remito_id
  for update;

  if not found then
    raise exception 'remito_not_found';
  end if;

  select *
  into v_company
  from public.companies
  where id = v_existing.company_id;

  if not found then
    raise exception 'company_not_found';
  end if;

  if not public.is_company_admin(v_company.slug) then
    raise exception 'not_authorized';
  end if;

  if v_existing.status <> 'issued' then
    raise exception 'remito_not_refreshable';
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'snapshot_required';
  end if;

  if nullif(p_snapshot->>'companySlug', '') is not null
    and public.normalize_company_remito_slug(p_snapshot->>'companySlug') <> v_company.slug then
    raise exception 'snapshot_company_mismatch';
  end if;

  if nullif(p_snapshot->>'deliveryDate', '') is not null
    and (p_snapshot->>'deliveryDate')::date <> v_existing.delivery_date then
    raise exception 'snapshot_delivery_date_mismatch';
  end if;

  if nullif(p_snapshot->>'remitoNumber', '') is not null
    and (
      (p_snapshot->>'remitoNumber') !~ '^[0-9]+$'
      or (p_snapshot->>'remitoNumber')::integer <> v_existing.remito_number
    ) then
    raise exception 'snapshot_remito_number_mismatch';
  end if;

  if nullif(p_snapshot->>'locationKey', '') is not null
    and (p_snapshot->>'locationKey') <> v_existing.location_key then
    raise exception 'snapshot_location_mismatch';
  end if;

  select coalesce(array_agg(o.id order by o.id), array[]::uuid[])
  into v_current_order_ids
  from public.orders o
  where o.delivery_date = v_existing.delivery_date
    and o.status = any(array['pending', 'archived'])
    and (
      public.normalize_company_remito_slug(coalesce(o.company_slug, '')) = v_company.slug
      or public.normalize_company_remito_slug(coalesce(o.company_name, '')) = v_company.slug
      or public.normalize_company_remito_slug(coalesce(o.location, o.delivery_location, '')) = v_company.slug
      or public.admin_extra_company_location_allowed(v_company.slug, coalesce(o.location, o.delivery_location, ''))
    )
    and (
      v_existing.location_key = ''
      or trim(both '_' from regexp_replace(
        translate(lower(trim(coalesce(o.location, o.delivery_location, ''))), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]+',
        '_',
        'g'
      )) = v_existing.location_key
    );

  select coalesce(array_agg(order_id order by order_id), array[]::uuid[])
  into v_requested_order_ids
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as order_id;

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

  if v_requested_order_ids <> v_current_order_ids
    or v_snapshot_order_ids <> v_current_order_ids
    or v_snapshot_source_order_ids <> v_current_order_ids then
    raise exception 'remito_orders_mismatch';
  end if;

  select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
  into v_actor_email, v_actor_name
  from public.users u
  where u.id = auth.uid();

  select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
  into v_issued_by_email, v_issued_by_name
  from public.users u
  where u.id = v_existing.issued_by;

  v_snapshot := coalesce(p_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'status', 'issued',
      'companySlug', v_company.slug,
      'companyName', v_company.name,
      'remitoNumber', v_existing.remito_number,
      'deliveryDate', v_existing.delivery_date,
      'serviceDate', v_existing.delivery_date,
      'issuedAt', v_existing.issued_at,
      'issuedBy', coalesce(
        v_existing.snapshot->'issuedBy',
        jsonb_build_object(
          'id', v_existing.issued_by,
          'email', v_issued_by_email,
          'name', v_issued_by_name
        )
      ),
      'locationKey', v_existing.location_key,
      'updatedAt', now(),
      'updatedBy', jsonb_build_object(
        'id', auth.uid(),
        'email', v_actor_email,
        'name', v_actor_name
      ),
      'snapshotVersion', coalesce(v_existing.snapshot_version, 1) + 1
    );

  v_old_totals := jsonb_build_object(
    'ordersCount', v_existing.snapshot->'ordersCount',
    'totalItems', v_existing.snapshot->'totalItems',
    'totalMenus', v_existing.snapshot->'totalMenus',
    'totalBeverages', v_existing.snapshot->'totalBeverages',
    'totalDesserts', v_existing.snapshot->'totalDesserts'
  );

  v_new_totals := jsonb_build_object(
    'ordersCount', v_snapshot->'ordersCount',
    'totalItems', v_snapshot->'totalItems',
    'totalMenus', v_snapshot->'totalMenus',
    'totalBeverages', v_snapshot->'totalBeverages',
    'totalDesserts', v_snapshot->'totalDesserts'
  );

  perform set_config('app.allow_issued_remito_snapshot_refresh', 'on', true);

  update public.company_remitos
  set order_ids = coalesce(p_order_ids, array[]::uuid[]),
      snapshot = v_snapshot,
      updated_at = now(),
      updated_by = auth.uid(),
      snapshot_version = coalesce(snapshot_version, 1) + 1
  where id = v_existing.id
  returning *
  into v_existing;

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
      'delivery_note_updated',
      'Remito actualizado',
      auth.uid(),
      v_actor_email,
      v_actor_name,
      v_existing.id,
      v_company.name,
      jsonb_build_object(
        'company_slug', v_company.slug,
        'delivery_date', v_existing.delivery_date,
        'remito_number', v_existing.remito_number,
        'location_key', v_existing.location_key,
        'order_ids', coalesce(p_order_ids, array[]::uuid[]),
        'previous_totals', v_old_totals,
        'new_totals', v_new_totals,
        'snapshot_version', v_existing.snapshot_version
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
    true,
    v_existing.status,
    v_existing.snapshot,
    v_issued_by_email,
    v_issued_by_name,
    v_existing.location_key,
    v_existing.updated_at,
    v_existing.updated_by,
    v_actor_email,
    v_actor_name,
    v_existing.snapshot_version;
end;
$$;

revoke all on function public.get_company_remitos_for_date(date, text, text) from public;
revoke all on function public.get_company_remitos_for_date(date, text, text) from anon;
grant execute on function public.get_company_remitos_for_date(date, text, text) to authenticated;

revoke all on function public.refresh_company_remito_snapshot(uuid, uuid[], jsonb, text) from public;
revoke all on function public.refresh_company_remito_snapshot(uuid, uuid[], jsonb, text) from anon;
grant execute on function public.refresh_company_remito_snapshot(uuid, uuid[], jsonb, text) to authenticated;
