insert into public.companies (slug, name)
values ('global', 'Todas las empresas')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();

alter table public.menu_items
  add column if not exists company_slug text;

update public.menu_items
set company_slug = 'global'
where company_slug is null or trim(company_slug) = '';

alter table public.menu_items
  alter column company_slug set default 'global';

alter table public.menu_items
  alter column company_slug set not null;

create index if not exists menu_items_company_date_idx
  on public.menu_items (company_slug, menu_date);

create table if not exists public.company_admins (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists company_admins_user_id_idx
  on public.company_admins (user_id);

alter table public.company_admins enable row level security;

grant select on public.company_admins to authenticated;
grant insert, update, delete on public.menu_items, public.dinner_menu_by_date to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        u.role = 'admin'
        or lower(u.email) = 'agustinwojtyszyn99@gmail.com'
      )
  );
$$;

create or replace function public.is_company_admin(
  p_company_slug text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1
      from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      where ca.user_id = p_user_id
        and c.slug = nullif(trim(coalesce(p_company_slug, '')), '')
    );
$$;

create or replace function public.has_company_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1
      from public.company_admins ca
      where ca.user_id = auth.uid()
    );
$$;

create or replace function public.get_admin_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_global boolean := false;
  v_companies jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_is_global := public.is_admin();

  if v_is_global then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.companies c
    where c.slug <> 'global';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and c.slug <> 'global';
  end if;

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'companies', v_companies
  );
end;
$$;

create or replace function public.get_company_admin_assignments()
returns table (
  company_slug text,
  company_name text,
  user_id uuid,
  email text,
  full_name text,
  assigned_at timestamptz
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
    c.slug,
    c.name,
    u.id,
    u.email,
    u.full_name,
    ca.assigned_at
  from public.company_admins ca
  join public.companies c on c.id = ca.company_id
  join public.users u on u.id = ca.user_id
  where c.slug <> 'global'
  order by c.name, u.email;
end;
$$;

create or replace function public.assign_company_admin_by_email(
  p_company_slug text,
  p_email text
)
returns table (
  company_slug text,
  company_name text,
  user_id uuid,
  email text,
  full_name text,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
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

  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'email_required';
  end if;

  select c.id
  into v_company_id
  from public.companies c
  where c.slug = p_company_slug
    and c.slug <> 'global';

  if v_company_id is null then
    raise exception 'company_not_found';
  end if;

  select u.id
  into v_user_id
  from public.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  insert into public.company_admins (company_id, user_id, assigned_by)
  values (v_company_id, v_user_id, auth.uid())
  on conflict (company_id, user_id) do nothing;

  return query
  select *
  from public.get_company_admin_assignments()
  where get_company_admin_assignments.company_slug = p_company_slug
    and get_company_admin_assignments.user_id = v_user_id;
end;
$$;

create or replace function public.remove_company_admin(
  p_company_slug text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_user_id is null then
    raise exception 'user_required';
  end if;

  select c.id
  into v_company_id
  from public.companies c
  where c.slug = p_company_slug
    and c.slug <> 'global';

  if v_company_id is null then
    raise exception 'company_not_found';
  end if;

  delete from public.company_admins
  where company_id = v_company_id
    and user_id = p_user_id;
end;
$$;

drop policy if exists company_admins_select_global on public.company_admins;
create policy company_admins_select_global
on public.company_admins
for select
to authenticated
using (public.is_admin());

drop policy if exists company_admins_write_global on public.company_admins;
create policy company_admins_write_global
on public.company_admins
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_admin_select on public.companies;
create policy companies_admin_select
on public.companies
for select
to authenticated
using (
  public.is_admin()
  or public.is_company_admin(companies.slug)
);

drop policy if exists menu_items_select_all_auth on public.menu_items;
create policy menu_items_select_all_auth
on public.menu_items
for select
to authenticated
using (
  company_slug = 'global'
  or public.is_company_admin(company_slug)
);

drop policy if exists menu_items_admin_write on public.menu_items;
create policy menu_items_admin_write
on public.menu_items
for all
to authenticated
using (public.is_company_admin(company_slug))
with check (public.is_company_admin(company_slug));

drop policy if exists dinner_menu_select_all_auth on public.dinner_menu_by_date;
create policy dinner_menu_select_all_auth
on public.dinner_menu_by_date
for select
to authenticated
using (
  company is null
  or company = ''
  or public.is_company_admin(company)
);

drop policy if exists dinner_menu_admin_write on public.dinner_menu_by_date;
create policy dinner_menu_admin_write
on public.dinner_menu_by_date
for all
to authenticated
using (public.is_company_admin(coalesce(nullif(company, ''), 'global')))
with check (public.is_company_admin(coalesce(nullif(company, ''), 'global')));

revoke all on function public.is_company_admin(text, uuid) from public;
revoke all on function public.is_company_admin(text, uuid) from anon;
grant execute on function public.is_company_admin(text, uuid) to authenticated;

revoke all on function public.has_company_admin_access() from public;
revoke all on function public.has_company_admin_access() from anon;
grant execute on function public.has_company_admin_access() to authenticated;

revoke all on function public.get_admin_access_context() from public;
revoke all on function public.get_admin_access_context() from anon;
grant execute on function public.get_admin_access_context() to authenticated;

revoke all on function public.get_company_admin_assignments() from public;
revoke all on function public.get_company_admin_assignments() from anon;
grant execute on function public.get_company_admin_assignments() to authenticated;

revoke all on function public.assign_company_admin_by_email(text, text) from public;
revoke all on function public.assign_company_admin_by_email(text, text) from anon;
grant execute on function public.assign_company_admin_by_email(text, text) to authenticated;

revoke all on function public.remove_company_admin(text, uuid) from public;
revoke all on function public.remove_company_admin(text, uuid) from anon;
grant execute on function public.remove_company_admin(text, uuid) to authenticated;
