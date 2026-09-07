begin;

-- The four Igarreta/ISEMAR report viewers are intentionally NOT company admins.
-- Grant the narrow consumption-report permission for both companies instead.
insert into public.user_permissions (user_id, permission, company_slug)
select u.id, 'consumption_report_viewer', c.slug
from public.users u
cross join public.companies c
where lower(trim(u.email)) in (
  'lcorrea@imasa.com.ar',
  'ggalvarini@imasa.com.ar',
  'vcastilla@imasa.com.ar',
  'mborras@imasa.com.ar'
)
  and c.slug in ('igarreta', 'isemar')
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
  where c.slug in ('igarreta', 'isemar')
    and public.has_consumption_report_access(c.slug);

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'companies', v_companies,
    'can_view_consumption_report', jsonb_array_length(v_consumption_report_companies) > 0,
    'consumption_report_companies', v_consumption_report_companies,
    'can_manage_late_extra_history', public.can_manage_late_extra_history(auth.uid()),
    'can_create_late_admin_extra_order', public.is_late_admin_extra_order_authorized(auth.uid()),
    'can_manage_order_discounts', public.can_manage_order_discounts(auth.uid())
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
  company_slug text,
  company_name text,
  organization text,
  location text,
  delivery_location text,
  requesting_location_code text,
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
    and not (
      public.has_consumption_report_access('igarreta')
      or public.has_consumption_report_access('isemar')
    )
  then
    raise exception 'not_authorized';
  end if;

  if p_month_start is null or p_month_end is null or p_month_end < p_month_start
    or p_month_end - p_month_start > 31
  then
    raise exception 'invalid_consumption_report_range';
  end if;

  return query
  with allowed_companies as (
    select c.slug
    from public.companies c
    where c.slug in ('igarreta', 'isemar')
      and (
        auth.role() = 'service_role'
        or public.has_consumption_report_access(c.slug)
      )
  )
  select
    o.id,
    o.delivery_date,
    case
      when lower(coalesce(o.order_origin, 'user')) = 'admin_extra' then
        'admin_extra:' || lower(coalesce(nullif(trim(o.customer_name), ''), 'varios'))
      else coalesce(
        o.user_id::text,
        nullif(lower(trim(o.customer_email)), ''),
        nullif(lower(trim(o.customer_name)), '')
      )
    end,
    case
      when lower(coalesce(o.order_origin, 'user')) = 'admin_extra' then
        coalesce(nullif(trim(o.customer_name), ''), 'Varios')
      else coalesce(
        nullif(trim(o.customer_name), ''),
        nullif(trim(u.full_name), ''),
        nullif(trim(o.customer_email), ''),
        nullif(trim(u.email), ''),
        'Sin nombre'
      )
    end,
    o.customer_name,
    o.customer_email,
    u.full_name,
    u.email,
    o.company_slug,
    o.company_name,
    o.organization,
    o.location,
    o.delivery_location,
    o.requesting_location_code,
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
        join allowed_companies ac on ac.slug = c.slug
        where loc.id = o.order_location_id
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
      or public.normalize_company_remito_slug(o.company_slug) in (select slug from allowed_companies)
      or public.normalize_company_remito_slug(o.organization) in (select slug from allowed_companies)
      or public.normalize_company_remito_slug(o.company_name) in (select slug from allowed_companies)
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
