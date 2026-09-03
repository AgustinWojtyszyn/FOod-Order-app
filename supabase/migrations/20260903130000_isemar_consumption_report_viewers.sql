begin;

create table if not exists public.user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  permission text not null,
  company_slug text not null references public.companies(slug) on update cascade on delete cascade,
  granted_by uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, permission, company_slug)
);

create index if not exists user_permissions_lookup_idx
  on public.user_permissions (permission, company_slug, user_id);

alter table public.user_permissions enable row level security;

revoke all on public.user_permissions from public;
revoke all on public.user_permissions from anon;
revoke all on public.user_permissions from authenticated;

delete from public.company_admins ca
using public.companies c, public.users u
where ca.company_id = c.id
  and ca.user_id = u.id
  and c.slug in ('igarreta', 'isemar')
  and lower(trim(u.email)) in (
    'lcorrea@imasa.com.ar',
    'ggalvarini@imasa.com.ar',
    'vcastilla@imasa.com.ar',
    'mborras@imasa.com.ar'
  );

insert into public.user_permissions (user_id, permission, company_slug)
select u.id, 'consumption_report_viewer', 'isemar'
from public.users u
where lower(trim(u.email)) in (
  'lcorrea@imasa.com.ar',
  'ggalvarini@imasa.com.ar',
  'vcastilla@imasa.com.ar',
  'mborras@imasa.com.ar',
  'wsjofre85@gmail.com'
)
on conflict (user_id, permission, company_slug) do nothing;

create or replace function public.has_consumption_report_access(
  p_company_slug text default 'isemar'
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
      from public.user_permissions up
      where up.user_id = auth.uid()
        and up.permission = 'consumption_report_viewer'
        and up.company_slug = nullif(trim(coalesce(p_company_slug, '')), '')
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
  v_consumption_report_companies jsonb := '[]'::jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', c.slug,
    'name', c.name
  ) order by c.name), '[]'::jsonb)
  into v_consumption_report_companies
  from public.companies c
  where c.slug = 'isemar'
    and public.has_consumption_report_access(c.slug);

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'companies', v_companies,
    'can_view_consumption_report', jsonb_array_length(v_consumption_report_companies) > 0,
    'consumption_report_companies', v_consumption_report_companies
  );
end;
$$;

create or replace function public.get_igarreta_isemar_consumption_report(
  p_month_start date,
  p_month_end date
)
returns table (
  order_id uuid,
  delivery_date date,
  person_key text,
  person_name text,
  customer_name text,
  customer_email text,
  user_full_name text,
  user_email text,
  status text,
  items jsonb,
  total_items integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'not_authenticated';
  end if;

  if auth.role() <> 'service_role'
    and not public.has_consumption_report_access('isemar')
  then
    raise exception 'not_authorized';
  end if;

  if p_month_start is null or p_month_end is null or p_month_end < p_month_start
    or p_month_end - p_month_start > 31
  then
    raise exception 'invalid_consumption_report_range';
  end if;

  return query
  select
    o.id,
    o.delivery_date,
    coalesce(o.user_id::text, nullif(lower(trim(o.customer_email)), ''), nullif(lower(trim(o.customer_name)), '')),
    coalesce(nullif(trim(o.customer_name), ''), nullif(trim(u.full_name), ''), nullif(trim(o.customer_email), ''), nullif(trim(u.email), ''), 'Sin nombre'),
    o.customer_name,
    o.customer_email,
    u.full_name,
    u.email,
    o.status,
    o.items,
    o.total_items
  from public.orders o
  left join public.users u on u.id = o.user_id
  where o.delivery_date between p_month_start and p_month_end
    and o.status in ('pending', 'archived', 'post_report_extra')
    and (
      exists (
        select 1
        from public.order_locations loc
        join public.companies c on c.id = loc.company_id
        where c.slug = 'isemar'
          and (
            loc.id = o.order_location_id
            or loc.id = o.delivery_order_location_id
            or public.normalize_order_schedule_location_key(coalesce(o.requesting_location_code, '')) in (
              public.normalize_order_schedule_location_key(loc.code),
              public.normalize_order_schedule_location_key(loc.slug),
              public.normalize_order_schedule_location_key(loc.display_name)
            )
            or public.normalize_order_schedule_location_key(coalesce(o.location, '')) in (
              public.normalize_order_schedule_location_key(loc.code),
              public.normalize_order_schedule_location_key(loc.slug),
              public.normalize_order_schedule_location_key(loc.display_name)
            )
            or public.normalize_order_schedule_location_key(coalesce(o.delivery_location_code, '')) in (
              public.normalize_order_schedule_location_key(loc.code),
              public.normalize_order_schedule_location_key(loc.slug),
              public.normalize_order_schedule_location_key(loc.display_name)
            )
            or public.normalize_order_schedule_location_key(coalesce(o.delivery_location, '')) in (
              public.normalize_order_schedule_location_key(loc.code),
              public.normalize_order_schedule_location_key(loc.slug),
              public.normalize_order_schedule_location_key(loc.display_name)
            )
          )
      )
      or public.normalize_company_remito_slug(o.company_slug) = 'isemar'
      or public.normalize_company_remito_slug(o.organization) = 'isemar'
      or public.normalize_company_remito_slug(o.company_name) = 'isemar'
    )
  order by o.delivery_date, person_name, o.id;
end;
$$;

revoke all on function public.has_consumption_report_access(text) from public;
revoke all on function public.has_consumption_report_access(text) from anon;
grant execute on function public.has_consumption_report_access(text) to authenticated;

revoke all on function public.get_admin_access_context() from public;
revoke all on function public.get_admin_access_context() from anon;
grant execute on function public.get_admin_access_context() to authenticated;

revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from public;
revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from anon;
grant execute on function public.get_igarreta_isemar_consumption_report(date, date) to authenticated;

commit;
