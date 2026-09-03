begin;

insert into public.company_admins (company_id, user_id)
select c.id, u.id
from public.companies c
cross join public.users u
where c.slug in ('igarreta', 'isemar')
  and lower(trim(u.email)) in (
    'lcorrea@imasa.com.ar',
    'ggalvarini@imasa.com.ar',
    'vcastilla@imasa.com.ar',
    'mborras@imasa.com.ar'
  )
on conflict (company_id, user_id) do nothing;

drop function if exists public.get_igarreta_isemar_consumption_report(date, date);

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
    and not public.is_admin()
    and not exists (
      select 1
      from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      where ca.user_id = auth.uid()
        and c.slug in ('igarreta', 'isemar')
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
        where c.slug in ('igarreta', 'isemar')
          and (loc.id = o.order_location_id or loc.id = o.delivery_order_location_id)
      )
      or public.normalize_company_remito_slug(o.company_slug) in ('igarreta', 'isemar')
      or public.normalize_company_remito_slug(o.organization) in ('igarreta', 'isemar')
      or public.normalize_company_remito_slug(o.company_name) in ('igarreta', 'isemar')
    )
  order by o.delivery_date, person_name, o.id;
end;
$$;

revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from public;
grant execute on function public.get_igarreta_isemar_consumption_report(date, date) to authenticated;

commit;