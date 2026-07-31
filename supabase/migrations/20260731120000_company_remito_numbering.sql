create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  remito_start_number integer unique,
  next_remito_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_remito_start_positive check (remito_start_number is null or remito_start_number > 0),
  constraint companies_next_remito_positive check (next_remito_number is null or next_remito_number > 0),
  constraint companies_next_after_start check (
    remito_start_number is null
    or next_remito_number is null
    or next_remito_number >= remito_start_number
  )
);

create table if not exists public.company_remitos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  remito_number integer not null,
  delivery_date date not null,
  order_ids uuid[] not null default array[]::uuid[],
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint company_remitos_number_positive check (remito_number > 0),
  constraint company_remitos_company_number_unique unique (company_id, remito_number),
  constraint company_remitos_company_date_unique unique (company_id, delivery_date)
);

create index if not exists company_remitos_company_id_idx
  on public.company_remitos (company_id);

insert into public.companies (slug, name)
values
  ('ccp', 'Ccp'),
  ('laja', 'La Laja'),
  ('padrebueno', 'Padre Bueno'),
  ('losberros', 'Los Berros'),
  ('genneia', 'Genneia'),
  ('distro_cuyo', 'DistroCuyo'),
  ('epse', 'EPSE'),
  ('administracion_servifood', 'Administración ServiFood')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();

create or replace function public.set_companies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_companies_updated_at();

alter table public.companies enable row level security;
alter table public.company_remitos enable row level security;

drop policy if exists companies_admin_select on public.companies;
create policy companies_admin_select
on public.companies
for select
to authenticated
using (public.is_admin());

drop policy if exists company_remitos_admin_select on public.company_remitos;
create policy company_remitos_admin_select
on public.company_remitos
for select
to authenticated
using (public.is_admin());

create or replace function public.get_companies_remito_config()
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

  return query
  select
    c.id,
    c.slug,
    c.name,
    c.remito_start_number,
    c.next_remito_number,
    count(cr.id)::bigint as issued_count,
    max(cr.remito_number)::integer as last_remito_number,
    c.updated_at
  from public.companies c
  left join public.company_remitos cr on cr.company_id = c.id
  group by c.id, c.slug, c.name, c.remito_start_number, c.next_remito_number, c.updated_at
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
  from public.company_remitos
  where company_id = v_company.id;

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
  from public.company_remitos
  where company_id = v_company.id
    and delivery_date = p_delivery_date;

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

revoke all on function public.get_companies_remito_config() from public;
revoke all on function public.get_companies_remito_config() from anon;
grant execute on function public.get_companies_remito_config() to authenticated;

revoke all on function public.update_company_remito_start(text, integer) from public;
revoke all on function public.update_company_remito_start(text, integer) from anon;
grant execute on function public.update_company_remito_start(text, integer) to authenticated;

revoke all on function public.issue_company_remito(text, text, date, uuid[]) from public;
revoke all on function public.issue_company_remito(text, text, date, uuid[]) from anon;
grant execute on function public.issue_company_remito(text, text, date, uuid[]) to authenticated;
