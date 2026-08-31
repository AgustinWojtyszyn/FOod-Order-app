-- Retroactive remitos inside Pedidos Diarios.
-- Extends the existing company_remitos model with immutable snapshots and idempotent issuance.

alter table public.company_remitos
  add column if not exists status text not null default 'issued',
  add column if not exists snapshot jsonb,
  add column if not exists request_id text,
  add column if not exists location_key text not null default '',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text;

update public.company_remitos
set status = 'issued'
where status is null or trim(status) = '';

update public.company_remitos
set location_key = ''
where location_key is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_remitos'::regclass
      and conname = 'company_remitos_status_check'
  ) then
    alter table public.company_remitos
      add constraint company_remitos_status_check
      check (status in ('issued', 'cancelled'));
  end if;
end $$;

alter table public.company_remitos
  drop constraint if exists company_remitos_company_date_unique;

create unique index if not exists company_remitos_company_date_location_unique
  on public.company_remitos (company_id, delivery_date, location_key);

create unique index if not exists company_remitos_request_id_unique
  on public.company_remitos (request_id)
  where request_id is not null;

create index if not exists company_remitos_delivery_date_idx
  on public.company_remitos (delivery_date);

create index if not exists company_remitos_status_idx
  on public.company_remitos (status);

create or replace function public.prevent_issued_remito_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'issued' and (
    old.company_id is distinct from new.company_id
    or old.remito_number is distinct from new.remito_number
    or old.delivery_date is distinct from new.delivery_date
    or old.order_ids is distinct from new.order_ids
    or old.snapshot is distinct from new.snapshot
    or old.location_key is distinct from new.location_key
  ) then
    raise exception 'issued_remito_snapshot_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_issued_remito_snapshot_mutation on public.company_remitos;
create trigger trg_prevent_issued_remito_snapshot_mutation
before update on public.company_remitos
for each row execute function public.prevent_issued_remito_snapshot_mutation();

drop policy if exists company_remitos_admin_select on public.company_remitos;
create policy company_remitos_admin_select
on public.company_remitos
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.companies c
    where c.id = company_remitos.company_id
      and public.is_company_admin(c.slug)
  )
);

drop policy if exists company_remitos_admin_insert on public.company_remitos;
create policy company_remitos_admin_insert
on public.company_remitos
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.companies c
    where c.id = company_remitos.company_id
      and public.is_company_admin(c.slug)
  )
);

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
  location_key text
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
    u.email,
    coalesce(nullif(trim(u.full_name), ''), u.email),
    cr.status,
    cr.order_ids,
    cr.snapshot,
    cr.request_id,
    cr.location_key
  from public.company_remitos cr
  join public.companies c on c.id = cr.company_id
  left join public.users u on u.id = cr.issued_by
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

drop function if exists public.issue_company_remito(text, text, date, uuid[]);

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
    where request_id = v_request_id;

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

revoke all on function public.get_company_remitos_for_date(date, text, text) from public;
revoke all on function public.get_company_remitos_for_date(date, text, text) from anon;
grant execute on function public.get_company_remitos_for_date(date, text, text) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[]) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[]) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[]) to authenticated;
