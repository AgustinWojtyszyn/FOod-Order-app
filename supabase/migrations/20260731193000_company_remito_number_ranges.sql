begin;

drop function if exists public.issue_company_remito(text, text, date, uuid[], integer);

do $$
begin
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
end $$;

alter table public.companies
  alter column remito_start_number drop default,
  alter column next_remito_number drop default;

with company_ranges(slug, start_number) as (
  values
    ('ccp', 10000),
    ('laja', 20000),
    ('padrebueno', 30000),
    ('losberros', 40000),
    ('genneia', 50000),
    ('distro_cuyo', 60000),
    ('epse', 70000),
    ('administracion_servifood', 80000)
)
update public.companies c
set remito_start_number = company_ranges.start_number,
    next_remito_number = coalesce((
      select max(cr.remito_number) + 1
      from public.company_remitos cr
      where cr.company_id = c.id
        and cr.remito_number >= company_ranges.start_number
        and cr.remito_number < company_ranges.start_number + 10000
    ), company_ranges.start_number)
from company_ranges
where c.slug = company_ranges.slug;

with company_ranges(slug, start_number) as (
  values
    ('ccp', 10000),
    ('laja', 20000),
    ('padrebueno', 30000),
    ('losberros', 40000),
    ('genneia', 50000),
    ('distro_cuyo', 60000),
    ('epse', 70000),
    ('administracion_servifood', 80000)
),
ordered_remitos as (
  select
    cr.id,
    company_ranges.start_number + row_number() over (
      partition by cr.company_id
      order by cr.delivery_date asc, cr.issued_at asc, cr.created_at asc, cr.id asc
    )::integer - 1 as ranged_number
  from public.company_remitos cr
  join public.companies c on c.id = cr.company_id
  join company_ranges on company_ranges.slug = c.slug
  where cr.remito_number < company_ranges.start_number
     or cr.remito_number >= company_ranges.start_number + 10000
)
update public.company_remitos cr
set remito_number = ordered_remitos.ranged_number
from ordered_remitos
where cr.id = ordered_remitos.id;

with company_ranges(slug, start_number) as (
  values
    ('ccp', 10000),
    ('laja', 20000),
    ('padrebueno', 30000),
    ('losberros', 40000),
    ('genneia', 50000),
    ('distro_cuyo', 60000),
    ('epse', 70000),
    ('administracion_servifood', 80000)
)
update public.companies c
set next_remito_number = coalesce((
      select max(cr.remito_number) + 1
      from public.company_remitos cr
      where cr.company_id = c.id
    ), company_ranges.start_number)
from company_ranges
where c.slug = company_ranges.slug;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_remito_start_number_key'
  ) then
    alter table public.companies add constraint companies_remito_start_number_key unique (remito_start_number);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_remito_start_positive'
  ) then
    alter table public.companies
      add constraint companies_remito_start_positive check (remito_start_number is null or remito_start_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_next_remito_positive'
  ) then
    alter table public.companies
      add constraint companies_next_remito_positive check (next_remito_number is null or next_remito_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_remitos'::regclass
      and conname = 'company_remitos_number_positive'
  ) then
    alter table public.company_remitos
      add constraint company_remitos_number_positive check (remito_number > 0);
  end if;
end $$;

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
declare
  v_company public.companies%rowtype;
  v_issued_count bigint;
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

  if p_remito_start_number is null or p_remito_start_number <= 0 then
    raise exception 'remito_start_number_must_be_positive';
  end if;

  select *
  into v_company
  from public.companies
  where slug = p_company_slug
  for update;

  if not found then
    raise exception 'company_not_found';
  end if;

  select count(*)
  into v_issued_count
  from public.company_remitos cr
  where cr.company_id = v_company.id;

  if v_issued_count > 0 and v_company.remito_start_number is distinct from p_remito_start_number then
    raise exception 'company_has_issued_remitos';
  end if;

  update public.companies
  set remito_start_number = p_remito_start_number,
      next_remito_number = case
        when v_issued_count = 0 then p_remito_start_number
        else next_remito_number
      end
  where public.companies.id = v_company.id;

  return query
  select cfg.*
  from public.get_companies_remito_config() cfg
  where cfg.slug = p_company_slug;
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
declare
  v_company public.companies%rowtype;
  v_existing public.company_remitos%rowtype;
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

  insert into public.companies (slug, name)
  values (p_company_slug, coalesce(nullif(trim(p_company_name), ''), p_company_slug))
  on conflict (slug) do update
  set name = coalesce(nullif(trim(excluded.name), ''), public.companies.name),
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

  if v_company.remito_start_number is null then
    raise exception 'remito_start_number_required';
  end if;

  v_number := coalesce(v_company.next_remito_number, v_company.remito_start_number);

  if v_number >= v_company.remito_start_number + 10000 then
    raise exception 'company_remito_range_exhausted';
  end if;

  insert into public.company_remitos (
    company_id,
    remito_number,
    delivery_date,
    order_ids,
    issued_by
  )
  values (
    v_company.id,
    v_number,
    p_delivery_date,
    coalesce(p_order_ids, array[]::uuid[]),
    auth.uid()
  )
  returning *
  into v_existing;

  update public.companies
  set next_remito_number = v_number + 1
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

revoke all on function public.issue_company_remito(text, text, date, uuid[]) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[]) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
