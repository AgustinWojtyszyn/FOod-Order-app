create or replace function public.search_historical_daily_orders(
  p_search text default '',
  p_email text default '',
  p_company_slug text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_remito_number integer default null,
  p_status text default null,
  p_origin text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  user_id uuid,
  delivery_date date,
  created_at timestamptz,
  status text,
  order_origin text,
  person_name text,
  person_email text,
  company_slug text,
  company_name text,
  organization text,
  location text,
  delivery_location text,
  service text,
  items jsonb,
  custom_responses jsonb,
  total_items integer,
  customer_name text,
  customer_email text,
  created_by_admin_id uuid,
  created_by_admin_email text,
  created_by_admin_name text,
  admin_extra_created_at timestamptz,
  remito_number integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_search text := public.normalize_admin_search_text(p_search);
  v_email text := public.normalize_admin_search_text(p_email);
  v_company_slug text := lower(nullif(trim(coalesce(p_company_slug, '')), ''));
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
  v_origin text := lower(nullif(trim(coalesce(p_origin, '')), ''));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_offset integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_status is not null and v_status not in ('pending', 'archived', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  if v_origin = 'normal' then
    v_origin := 'user';
  end if;

  if v_origin is not null and v_origin not in ('user', 'admin_extra') then
    raise exception 'invalid_origin';
  end if;

  if p_remito_number is not null and p_remito_number <= 0 then
    raise exception 'invalid_remito_number';
  end if;

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  if v_company_slug is not null and not public.is_company_admin(v_company_slug) then
    raise exception 'not_authorized';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  return query
  with scoped_orders as (
    select o.*
    from public.orders o
    where (v_status is null or lower(coalesce(o.status, '')) = v_status)
      and (v_origin is null or coalesce(nullif(lower(o.order_origin), ''), 'user') = v_origin)
      and (p_from_date is null or o.delivery_date >= p_from_date)
      and (p_to_date is null or o.delivery_date <= p_to_date)
      and (
        v_company_slug is null
        or o.company_slug = v_company_slug
        or public.admin_extra_company_location_allowed(v_company_slug, coalesce(o.location, o.delivery_location, ''))
      )
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = o.company_slug
              or public.admin_extra_company_location_allowed(c.slug, coalesce(o.location, o.delivery_location, ''))
            )
        )
      )
  ),
  enriched as (
    select
      o.*,
      coalesce(nullif(trim(o.customer_name), ''), nullif(trim(u.full_name), ''), nullif(trim(o.customer_email), ''), nullif(trim(u.email), '')) as resolved_person_name,
      coalesce(nullif(trim(o.customer_email), ''), nullif(trim(u.email), '')) as resolved_person_email,
      remito.remito_number
    from scoped_orders o
    left join public.users u on u.id = o.user_id
    left join lateral (
      select cr.remito_number
      from public.company_remitos cr
      join public.companies c on c.id = cr.company_id
      where o.id = any(cr.order_ids)
        and (p_remito_number is null or cr.remito_number = p_remito_number)
      order by cr.issued_at desc, cr.created_at desc
      limit 1
    ) remito on true
    where (p_remito_number is null or remito.remito_number is not null)
      and (
        v_search = ''
        or public.normalize_admin_search_text(coalesce(o.customer_name, u.full_name, '')) like '%' || v_search || '%'
      )
      and (
        v_email = ''
        or public.normalize_admin_search_text(coalesce(o.customer_email, u.email, '')) like '%' || v_email || '%'
      )
  ),
  counted as (
    select enriched.*, count(*) over() as total_count
    from enriched
  )
  select
    counted.id,
    counted.user_id,
    counted.delivery_date,
    counted.created_at,
    counted.status,
    coalesce(nullif(counted.order_origin, ''), 'user') as order_origin,
    counted.resolved_person_name as person_name,
    counted.resolved_person_email as person_email,
    counted.company_slug,
    counted.company_name,
    counted.organization,
    counted.location,
    counted.delivery_location,
    counted.service,
    counted.items,
    counted.custom_responses,
    counted.total_items,
    counted.customer_name,
    counted.customer_email,
    counted.created_by_admin_id,
    counted.created_by_admin_email,
    counted.created_by_admin_name,
    counted.admin_extra_created_at,
    counted.remito_number,
    counted.total_count
  from counted
  order by counted.delivery_date desc nulls last, counted.created_at desc
  limit v_page_size
  offset v_offset;
end;
$$;

revoke all on function public.search_historical_daily_orders(text, text, text, date, date, integer, text, text, integer, integer) from public;
revoke all on function public.search_historical_daily_orders(text, text, text, date, date, integer, text, text, integer, integer) from anon;
grant execute on function public.search_historical_daily_orders(text, text, text, date, date, integer, text, text, integer, integer) to authenticated;
