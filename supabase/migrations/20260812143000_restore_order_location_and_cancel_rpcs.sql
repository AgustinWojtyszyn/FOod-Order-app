-- Restores RPCs required by the order form and own pending-order cancellation.

alter table if exists public.order_locations
  add column if not exists usual_weekday_quantity integer,
  add column if not exists usual_weekend_quantity integer;

drop function if exists public.get_company_order_locations(text);

create or replace function public.get_company_order_locations(p_company_slug text default null)
returns table (
  id uuid,
  code text,
  slug text,
  name text,
  display_name text,
  organization text,
  organization_code text,
  delivery_code text,
  delivery_slug text,
  delivery_name text,
  usual_weekday_quantity integer,
  usual_weekend_quantity integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company_code text := upper(trim(coalesce(p_company_slug, '')));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_company_code = '' then
    return;
  end if;

  return query
  select
    loc.id,
    loc.code,
    loc.slug,
    loc.display_name as name,
    loc.display_name,
    org.name as organization,
    org.code as organization_code,
    delivery.code as delivery_code,
    delivery.slug as delivery_slug,
    delivery.display_name as delivery_name,
    loc.usual_weekday_quantity,
    loc.usual_weekend_quantity
  from public.order_locations loc
  join public.order_organizations org
    on org.id = loc.organization_id
   and org.active = true
  left join public.order_locations delivery
    on delivery.id = coalesce(loc.default_delivery_location_id, loc.id)
  where loc.active = true
    and upper(org.code) = v_company_code
  order by loc.display_name;
end;
$$;

drop function if exists public.cancel_own_pending_order(uuid);

create or replace function public.cancel_own_pending_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if order_id is null then
    raise exception 'order_required';
  end if;

  select *
  into v_order
  from public.orders
  where id = order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.user_id is distinct from v_uid then
    raise exception 'not_authorized';
  end if;

  if lower(coalesce(v_order.status, '')) <> 'pending' then
    raise exception 'order_not_pending';
  end if;

  delete from public.orders
  where id = order_id
    and user_id = v_uid
    and lower(coalesce(status, '')) = 'pending'
  returning *
  into v_order;

  return v_order;
end;
$$;

revoke all on function public.get_company_order_locations(text) from public;
revoke all on function public.get_company_order_locations(text) from anon;
grant execute on function public.get_company_order_locations(text) to authenticated;

revoke all on function public.cancel_own_pending_order(uuid) from public;
revoke all on function public.cancel_own_pending_order(uuid) from anon;
grant execute on function public.cancel_own_pending_order(uuid) to authenticated;

notify pgrst, 'reload schema';
