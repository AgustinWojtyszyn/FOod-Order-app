-- Stabilize admin extra orders, admin user listing and order editing data reads.
-- Idempotent by design: safe to apply after previous admin-extra migrations.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

alter table public.orders
  add column if not exists order_origin text not null default 'user',
  add column if not exists company_slug text,
  add column if not exists company_name text,
  add column if not exists created_by_admin_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_admin_email text,
  add column if not exists created_by_admin_name text,
  add column if not exists admin_extra_reason text,
  add column if not exists admin_extra_comment text,
  add column if not exists admin_extra_outside_window boolean not null default false,
  add column if not exists admin_extra_duplicate_confirmed boolean not null default false,
  add column if not exists admin_extra_created_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table public.orders alter column user_id drop not null;
  end if;
end $$;

drop view if exists public.orders_count_by_person;
drop view if exists public.orders_with_person_key;

create view public.orders_with_person_key as
select
  o.*,
  coalesce(
    u.email,
    o.customer_email,
    case
      when lower(coalesce(o.order_origin, 'user')) = 'admin_extra'
        or o.created_by_admin_id is not null
        or o.admin_extra_created_at is not null
      then 'admin_extra:' || o.id::text
      else 'unknown:' || o.id::text
    end
  ) as person_key,
  u.email as user_email,
  u.full_name as user_full_name,
  u.role as user_role
from public.orders o
left join public.users u on u.id = o.user_id;

create view public.orders_count_by_person as
select
  coalesce(
    u.email,
    o.customer_email,
    case
      when lower(coalesce(o.order_origin, 'user')) = 'admin_extra'
        or o.created_by_admin_id is not null
        or o.admin_extra_created_at is not null
      then 'admin_extra:' || o.id::text
      else 'unknown:' || o.id::text
    end
  ) as person_key,
  count(*)::bigint as total_orders,
  min(o.created_at) as first_created,
  max(o.created_at) as last_created
from public.orders o
left join public.users u on u.id = o.user_id
group by coalesce(
  u.email,
  o.customer_email,
  case
    when lower(coalesce(o.order_origin, 'user')) = 'admin_extra'
      or o.created_by_admin_id is not null
      or o.admin_extra_created_at is not null
    then 'admin_extra:' || o.id::text
    else 'unknown:' || o.id::text
  end
);

create or replace function public.normalize_admin_search_text(p_value text)
returns text
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select regexp_replace(
    lower(extensions.unaccent(coalesce(p_value, ''))),
    '[^a-z0-9@._+-]+',
    ' ',
    'g'
  );
$$;

create or replace function public.get_admin_people_page(
  p_search text default '',
  p_role text default 'all',
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_search text := trim(coalesce(p_search, ''));
  v_search_normalized text := public.normalize_admin_search_text(p_search);
  v_role text := lower(trim(coalesce(p_role, 'all')));
  v_sort text := lower(trim(coalesce(p_sort, 'name_asc')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 40), 1), 200);
  v_offset integer;
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_role not in ('all', 'admin', 'user') then
    v_role := 'all';
  end if;

  if v_sort not in ('name_asc', 'name_desc', 'newest', 'oldest') then
    v_sort := 'name_asc';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  with visible_users as (
    select
      u.id,
      u.email,
      u.full_name,
      u.role,
      u.created_at,
      (
        u.role = 'admin'
        or lower(coalesce(u.email, '')) = 'agustinwojtyszyn99@gmail.com'
      ) as is_global_admin,
      exists (
        select 1
        from public.company_admins target_ca
        where target_ca.user_id = u.id
      ) as is_company_admin
    from public.users u
    where public.is_admin()
      or u.id = auth.uid()
      or exists (
        select 1
        from public.company_admins actor_ca
        join public.company_admins target_ca on target_ca.company_id = actor_ca.company_id
        where actor_ca.user_id = auth.uid()
          and target_ca.user_id = u.id
      )
  ),
  filtered as (
    select *
    from visible_users vu
    where (
      v_role = 'all'
      or (v_role = 'admin' and (vu.is_global_admin or vu.is_company_admin))
      or (v_role = 'user' and not (vu.is_global_admin or vu.is_company_admin))
    )
      and (
        v_search = ''
        or public.normalize_admin_search_text(
          concat_ws(' ', vu.full_name, vu.email)
        ) like '%' || v_search_normalized || '%'
      )
  )
  select count(*)::integer
  into v_total
  from filtered;

  with visible_users as (
    select
      u.id,
      u.email,
      u.full_name,
      u.role,
      u.created_at,
      (
        u.role = 'admin'
        or lower(coalesce(u.email, '')) = 'agustinwojtyszyn99@gmail.com'
      ) as is_global_admin,
      exists (
        select 1
        from public.company_admins target_ca
        where target_ca.user_id = u.id
      ) as is_company_admin
    from public.users u
    where public.is_admin()
      or u.id = auth.uid()
      or exists (
        select 1
        from public.company_admins actor_ca
        join public.company_admins target_ca on target_ca.company_id = actor_ca.company_id
        where actor_ca.user_id = auth.uid()
          and target_ca.user_id = u.id
      )
  ),
  filtered as (
    select *
    from visible_users vu
    where (
      v_role = 'all'
      or (v_role = 'admin' and (vu.is_global_admin or vu.is_company_admin))
      or (v_role = 'user' and not (vu.is_global_admin or vu.is_company_admin))
    )
      and (
        v_search = ''
        or public.normalize_admin_search_text(
          concat_ws(' ', vu.full_name, vu.email)
        ) like '%' || v_search_normalized || '%'
      )
  ),
  ordered as (
    select *
    from filtered
    order by
      case when v_sort = 'name_asc' then public.normalize_admin_search_text(coalesce(nullif(full_name, ''), email)) end asc,
      case when v_sort = 'name_desc' then public.normalize_admin_search_text(coalesce(nullif(full_name, ''), email)) end desc,
      case when v_sort = 'newest' then created_at end desc,
      case when v_sort = 'oldest' then created_at end asc,
      id asc
    limit v_page_size
    offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id::text,
    'person_id', id::text,
    'group_id', null,
    'display_name', coalesce(nullif(trim(full_name), ''), email, 'Sin nombre'),
    'full_name', coalesce(nullif(trim(full_name), ''), email, 'Sin nombre'),
    'email', coalesce(email, ''),
    'emails', case when email is null or trim(email) = '' then '[]'::jsonb else jsonb_build_array(email) end,
    'user_ids', jsonb_build_array(id),
    'primary_user_id', id,
    'members_count', 1,
    'first_created', created_at,
    'last_created', created_at,
    'created_at', created_at,
    'is_grouped', false,
    'role', case when is_global_admin or is_company_admin then 'admin' else coalesce(role, 'user') end,
    'is_global_admin', is_global_admin,
    'is_company_admin', is_company_admin,
    'accounts', jsonb_build_array(jsonb_build_object(
      'id', id,
      'email', email,
      'full_name', full_name,
      'role', role,
      'created_at', created_at,
      'is_global_admin', is_global_admin,
      'is_company_admin', is_company_admin
    ))
  )), '[]'::jsonb)
  into v_items
  from ordered;

  return jsonb_build_object(
    'items', v_items,
    'total_count', v_total,
    'total_pages', greatest(ceil(v_total::numeric / v_page_size)::integer, 1),
    'page', v_page,
    'page_size', v_page_size
  );
end;
$$;

revoke all on function public.normalize_admin_search_text(text) from public;
revoke all on function public.normalize_admin_search_text(text) from anon;
grant execute on function public.normalize_admin_search_text(text) to authenticated;

revoke all on function public.get_admin_people_page(text, text, text, integer, integer) from public;
revoke all on function public.get_admin_people_page(text, text, text, integer, integer) from anon;
grant execute on function public.get_admin_people_page(text, text, text, integer, integer) to authenticated;
