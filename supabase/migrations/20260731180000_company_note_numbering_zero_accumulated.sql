begin;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_remito_start_number_key'
  ) then
    alter table public.companies drop constraint companies_remito_start_number_key;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_remito_start_positive'
  ) then
    alter table public.companies drop constraint companies_remito_start_positive;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_next_remito_positive'
  ) then
    alter table public.companies drop constraint companies_next_remito_positive;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_remitos'::regclass
      and conname = 'company_remitos_number_positive'
  ) then
    alter table public.company_remitos drop constraint company_remitos_number_positive;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_remito_start_zero'
  ) then
    alter table public.companies drop constraint companies_remito_start_zero;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_next_remito_non_negative'
  ) then
    alter table public.companies drop constraint companies_next_remito_non_negative;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_remitos'::regclass
      and conname = 'company_remitos_number_non_negative'
  ) then
    alter table public.company_remitos drop constraint company_remitos_number_non_negative;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_remitos'::regclass
      and conname = 'company_remitos_total_items_non_negative'
  ) then
    alter table public.company_remitos drop constraint company_remitos_total_items_non_negative;
  end if;
end $$;

alter table public.companies
  alter column remito_start_number set default 0,
  alter column next_remito_number set default 0;

update public.companies
set remito_start_number = 0,
    next_remito_number = coalesce(next_remito_number, 0)
where remito_start_number is null
   or remito_start_number <> 0
   or next_remito_number is null;

alter table public.companies
  add constraint companies_remito_start_zero check (remito_start_number = 0),
  add constraint companies_next_remito_non_negative check (next_remito_number >= 0);

alter table public.company_remitos
  add column if not exists total_items integer not null default 0,
  add constraint company_remitos_number_non_negative check (remito_number >= 0),
  add constraint company_remitos_total_items_non_negative check (total_items >= 0);

update public.company_remitos
set total_items = greatest(coalesce(total_items, 0), cardinality(coalesce(order_ids, array[]::uuid[])));

with ordered_remitos as (
  select
    id,
    sum(total_items) over (
      partition by company_id
      order by delivery_date asc, issued_at asc, created_at asc, id asc
    )::integer as accumulated_number
  from public.company_remitos
)
update public.company_remitos cr
set remito_number = ordered_remitos.accumulated_number
from ordered_remitos
where cr.id = ordered_remitos.id;

update public.companies c
set remito_start_number = 0,
    next_remito_number = coalesce((
      select sum(cr.total_items)::integer
      from public.company_remitos cr
      where cr.company_id = c.id
    ), 0);

create or replace function public.update_company_remito_start(
  p_company_slug text,
  p_remito_start_number integer
)
returns table (
  id uuid,
  slug text,
  name text,
  remito_start_number integer,
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

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if nullif(trim(coalesce(p_company_slug, '')), '') is null then
    raise exception 'company_required';
  end if;

  if coalesce(p_remito_start_number, 0) <> 0 then
    raise exception 'remito_start_number_must_be_zero';
  end if;

  update public.companies
  set remito_start_number = 0,
      next_remito_number = coalesce(next_remito_number, 0)
  where public.companies.slug = p_company_slug;

  if not found then
    raise exception 'company_not_found';
  end if;

  return query
  select cfg.*
  from public.get_companies_remito_config() cfg
  where cfg.slug = p_company_slug;
end;
$$;

drop function if exists public.issue_company_remito(text, text, date, uuid[], integer);

create or replace function public.issue_company_remito(
  p_company_slug text,
  p_company_name text,
  p_delivery_date date,
  p_order_ids uuid[],
  p_increment integer
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_existing public.company_remitos%rowtype;
  v_increment integer;
  v_delta integer;
  v_number integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if nullif(trim(coalesce(p_company_slug, '')), '') is null then
    raise exception 'company_required';
  end if;

  if p_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;

  v_increment := greatest(
    coalesce(p_increment, 0),
    cardinality(coalesce(p_order_ids, array[]::uuid[])),
    0
  );

  insert into public.companies (slug, name, remito_start_number, next_remito_number)
  values (p_company_slug, coalesce(nullif(trim(p_company_name), ''), p_company_slug), 0, 0)
  on conflict (slug) do update
  set name = coalesce(nullif(trim(excluded.name), ''), public.companies.name),
      remito_start_number = 0,
      next_remito_number = coalesce(public.companies.next_remito_number, 0),
      updated_at = now();

  select *
  into v_company
  from public.companies
  where slug = p_company_slug
  for update;

  select *
  into v_existing
  from public.company_remitos cr
  where cr.company_id = v_company.id
    and cr.delivery_date = p_delivery_date
  for update;

  if found then
    v_delta := greatest(v_increment - coalesce(v_existing.total_items, 0), 0);

    if v_delta > 0 then
      update public.company_remitos
      set remito_number = v_existing.remito_number + v_delta,
          total_items = v_increment,
          order_ids = coalesce(p_order_ids, array[]::uuid[]),
          issued_by = auth.uid(),
          issued_at = now()
      where id = v_existing.id
      returning *
      into v_existing;

      update public.companies
      set next_remito_number = coalesce(next_remito_number, 0) + v_delta
      where id = v_company.id;
    end if;

    return query
    select
      v_existing.id,
      v_company.slug,
      v_company.name,
      v_existing.remito_number,
      v_existing.delivery_date,
      v_existing.issued_at,
      true;
    return;
  end if;

  v_number := coalesce(v_company.next_remito_number, 0) + v_increment;

  insert into public.company_remitos (
    company_id,
    remito_number,
    delivery_date,
    order_ids,
    total_items,
    issued_by
  )
  values (
    v_company.id,
    v_number,
    p_delivery_date,
    coalesce(p_order_ids, array[]::uuid[]),
    v_increment,
    auth.uid()
  )
  returning *
  into v_existing;

  update public.companies
  set remito_start_number = 0,
      next_remito_number = v_number
  where id = v_company.id;

  return query
  select
    v_existing.id,
    v_company.slug,
    v_company.name,
    v_existing.remito_number,
    v_existing.delivery_date,
    v_existing.issued_at,
    false;
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    issued.remito_id,
    issued.company_slug,
    issued.company_name,
    issued.remito_number,
    issued.delivery_date,
    issued.issued_at,
    issued.reused
  from public.issue_company_remito(
    p_company_slug,
    p_company_name,
    p_delivery_date,
    coalesce(p_order_ids, array[]::uuid[]),
    cardinality(coalesce(p_order_ids, array[]::uuid[]))
  ) as issued;
end;
$$;

revoke all on function public.issue_company_remito(text, text, date, uuid[]) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[]) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[]) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[], integer) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[], integer) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[], integer) to authenticated;

notify pgrst, 'reload schema';

commit;
