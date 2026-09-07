begin;

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
      when lower(coalesce(o.order_origin, 'user')) = 'admin_extra' then 'admin_extra'
      else coalesce(
        o.user_id::text,
        nullif(lower(trim(o.customer_email)), ''),
        nullif(lower(trim(o.customer_name)), '')
      )
    end,
    case
      when lower(coalesce(o.order_origin, 'user')) = 'admin_extra' then 'Pedido extra administrativo'
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

revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from public;
revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from anon;
grant execute on function public.get_igarreta_isemar_consumption_report(date, date) to authenticated;

commit;
