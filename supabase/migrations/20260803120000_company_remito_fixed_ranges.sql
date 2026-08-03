alter table public.companies
  add column if not exists remito_end_number integer;

alter table public.companies
  drop constraint if exists companies_remito_start_zero;

alter table public.companies
  drop constraint if exists companies_next_remito_zero;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%remito_start_number%'
        or pg_get_constraintdef(oid) ilike '%next_remito_number%'
        or pg_get_constraintdef(oid) ilike '%remito_end_number%'
      )
      and conname not in (
        'companies_remito_start_positive',
        'companies_next_remito_positive',
        'companies_next_after_start',
        'companies_remito_end_positive',
        'companies_remito_start_before_end',
        'companies_next_within_remito_range'
      )
  loop
    execute format('alter table public.companies drop constraint if exists %I', v_constraint.conname);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_remito_end_positive'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_remito_end_positive
      check (remito_end_number is null or remito_end_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_remito_start_before_end'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_remito_start_before_end
      check (
        remito_start_number is null
        or remito_end_number is null
        or remito_start_number <= remito_end_number
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_next_within_remito_range'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_next_within_remito_range
      check (
        next_remito_number is null
        or remito_start_number is null
        or remito_end_number is null
        or (
          next_remito_number >= remito_start_number
          and next_remito_number <= remito_end_number + 1
        )
      );
  end if;
end;
$$;

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
  ('ccp', 'CCP', 10000, 19999, 10000),
  ('distro_cuyo', 'DistroCuyo', 20000, 29999, 20000),
  ('epse', 'EPSE', 30000, 39999, 30000),
  ('genneia', 'Genneia', 40000, 49999, 40000),
  ('laja', 'La Laja', 50000, 59999, 50000),
  ('losberros', 'Los Berros', 60000, 69999, 60000),
  ('padrebueno', 'Padre Bueno', 70000, 79999, 70000)
on conflict (slug) do update
set name = excluded.name,
    remito_start_number = excluded.remito_start_number,
    remito_end_number = excluded.remito_end_number,
    next_remito_number = case
      when public.companies.next_remito_number between excluded.remito_start_number and excluded.remito_end_number + 1
        then public.companies.next_remito_number
      else excluded.next_remito_number
    end,
    updated_at = now();

insert into public.companies (slug, name, remito_start_number, remito_end_number, next_remito_number)
values ('administracion_servifood', 'Administración ServiFood', null, null, null)
on conflict (slug) do update
set name = excluded.name,
    remito_start_number = null,
    remito_end_number = null,
    next_remito_number = null,
    updated_at = now();

with ranges(slug, range_start, range_end) as (
  values
    ('ccp', 10000, 19999),
    ('distro_cuyo', 20000, 29999),
    ('epse', 30000, 39999),
    ('genneia', 40000, 49999),
    ('laja', 50000, 59999),
    ('losberros', 60000, 69999),
    ('padrebueno', 70000, 79999)
),
issued as (
  select
    c.slug,
    count(cr.id) as issued_count,
    max(cr.remito_number) as last_remito_number
  from public.companies c
  join ranges r on r.slug = c.slug
  left join public.company_remitos cr
    on cr.company_id = c.id
   and cr.remito_number between r.range_start and r.range_end
  group by c.slug
)
update public.companies c
set remito_start_number = r.range_start,
    remito_end_number = r.range_end,
    next_remito_number = least(
      r.range_end + 1,
      case
        when coalesce(i.issued_count, 0) > 0 then greatest(
          case
            when c.next_remito_number between r.range_start and r.range_end + 1
              then c.next_remito_number
            else r.range_start
          end,
          coalesce(i.last_remito_number + 1, r.range_start),
          r.range_start
        )
        else r.range_start
      end
    ),
    updated_at = now()
from ranges r
left join issued i on i.slug = r.slug
where c.slug = r.slug;

drop function if exists public.update_company_remito_start(text, integer);
drop function if exists public.get_companies_remito_config();

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

  if not public.is_admin() then
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
  where c.slug <> 'administracion_servifood'
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
  v_range_start integer;
  v_range_end integer;
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

  if v_slug = 'administracion_servifood' then
    raise exception 'company_remito_numbering_excluded';
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

  if p_remito_start_number is null or p_remito_start_number <> v_range_start then
    raise exception 'remito_start_number_out_of_range';
  end if;

  select *
  into v_company
  from public.companies
  where companies.slug = v_slug
  for update;

  if not found then
    insert into public.companies (slug, name, remito_start_number, remito_end_number, next_remito_number)
    values (v_slug, v_slug, v_range_start, v_range_end, v_range_start)
    returning *
    into v_company;
  end if;

  select
    count(cr.id),
    max(cr.remito_number)
  into v_issued_count, v_last_number
  from public.company_remitos cr
  where cr.company_id = v_company.id
    and cr.remito_number between v_range_start and v_range_end;

  v_next_number := least(
    v_range_end + 1,
    case
      when coalesce(v_issued_count, 0) > 0 then greatest(
        case
          when v_company.next_remito_number between v_range_start and v_range_end + 1
            then v_company.next_remito_number
          else v_range_start
        end,
        coalesce(v_last_number + 1, v_range_start),
        v_range_start
      )
      else v_range_start
    end
  );

  update public.companies
  set remito_start_number = v_range_start,
      remito_end_number = v_range_end,
      next_remito_number = v_next_number
  where public.companies.id = v_company.id;

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
  v_slug text;
  v_name text;
  v_range_start integer;
  v_range_end integer;
  v_number integer;
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

  select *
  into v_existing
  from public.company_remitos
  where company_remitos.company_id = v_company.id
    and company_remitos.delivery_date = p_delivery_date;

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

  if v_company.next_remito_number is null
     or v_company.next_remito_number < v_range_start
     or v_company.next_remito_number > v_range_end + 1 then
    select least(
      v_range_end + 1,
      coalesce(max(cr.remito_number) + 1, v_range_start)
    )
    into v_number
    from public.company_remitos cr
    where cr.company_id = v_company.id
      and cr.remito_number between v_range_start and v_range_end;
  else
    v_number := v_company.next_remito_number;
  end if;

  if v_number > v_range_end then
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
  set remito_start_number = v_range_start,
      remito_end_number = v_range_end,
      next_remito_number = v_number + 1
  where companies.id = v_company.id;

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

revoke all on function public.normalize_company_remito_slug(text) from public;
revoke all on function public.normalize_company_remito_slug(text) from anon;

revoke all on function public.get_companies_remito_config() from public;
revoke all on function public.get_companies_remito_config() from anon;
grant execute on function public.get_companies_remito_config() to authenticated;

revoke all on function public.update_company_remito_start(text, integer) from public;
revoke all on function public.update_company_remito_start(text, integer) from anon;
grant execute on function public.update_company_remito_start(text, integer) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[]) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[]) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[]) to authenticated;
