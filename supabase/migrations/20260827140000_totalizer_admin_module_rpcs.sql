begin;

drop function if exists public.totalizer_get_daily_payload(date, text);
drop function if exists public.totalizer_upsert_value(date, uuid, text, uuid, text, numeric);
drop function if exists public.totalizer_create_manual_account(text, integer, boolean);
drop function if exists public.totalizer_create_concept(text, text, text, boolean, integer, boolean);
drop function if exists public.totalizer_create_mapping(uuid, text, text, text, text, text, integer);
drop function if exists public.totalizer_save_order_note(uuid, text);

create or replace function public.totalizer_get_summary(
  p_from_date date,
  p_to_date date,
  p_service text default 'all',
  p_company_slugs text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service text := lower(trim(coalesce(p_service, 'all')));
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'invalid_date_range';
  end if;

  if v_service not in ('all', 'almuerzo', 'cena') then
    raise exception 'invalid_service';
  end if;

  with filtered_orders as (
    select
      o.id,
      o.delivery_date::date as delivery_date,
      coalesce(nullif(lower(trim(o.company_slug)), ''), 'sin_empresa') as company_slug,
      coalesce(nullif(trim(o.company_name), ''), nullif(trim(o.location), ''), nullif(trim(o.company_slug), ''), 'Sin empresa') as company_name,
      coalesce(nullif(lower(trim(o.service)), ''), 'lunch') as service,
      greatest(coalesce(o.total_items, 0), 0)::numeric as total_items,
      coalesce(o.items, '[]'::jsonb) as items,
      coalesce(o.custom_responses, '[]'::jsonb) as custom_responses
    from public.orders o
    where o.delivery_date::date between p_from_date and p_to_date
      and o.status in ('pending', 'archived', 'post_report_extra')
      and (
        v_service = 'all'
        or (v_service = 'almuerzo' and coalesce(nullif(lower(trim(o.service)), ''), 'lunch') <> 'dinner')
        or (v_service = 'cena' and coalesce(nullif(lower(trim(o.service)), ''), 'lunch') = 'dinner')
      )
      and (
        p_company_slugs is null
        or cardinality(p_company_slugs) = 0
        or coalesce(nullif(lower(trim(o.company_slug)), ''), 'sin_empresa') = any(p_company_slugs)
      )
  ),
  item_events as (
    select
      fo.delivery_date,
      fo.company_slug,
      fo.company_name,
      lower(concat_ws(' ',
        item->>'name',
        item->>'title',
        item->>'menu',
        item->>'option',
        item->>'selected_option',
        item->>'choice'
      )) as label,
      greatest(coalesce(
        case when coalesce(item->>'quantity', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'quantity')::numeric end,
        case when coalesce(item->>'qty', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'qty')::numeric end,
        1
      ), 0) as quantity
    from filtered_orders fo
    cross join lateral jsonb_array_elements(fo.items) item
  ),
  response_events as (
    select
      fo.delivery_date,
      fo.company_slug,
      fo.company_name,
      lower(concat_ws(' ',
        response->>'title',
        response->>'label',
        response->>'response',
        response->>'answer',
        response->>'value'
      )) as label,
      greatest(coalesce(
        case when coalesce(response->>'quantity', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (response->>'quantity')::numeric end,
        case when coalesce(response->>'qty', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (response->>'qty')::numeric end,
        case when coalesce(response->>'count', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (response->>'count')::numeric end,
        fo.total_items,
        1
      ), 0) as quantity
    from filtered_orders fo
    cross join lateral jsonb_array_elements(fo.custom_responses) response
  ),
  classified_events as (
    select
      delivery_date,
      company_slug,
      company_name,
      case
        when label ~ 'opci[oó]n[[:space:]]*1|opcion_1' then 'opcion_1'
        when label ~ 'opci[oó]n[[:space:]]*2|opcion_2' then 'opcion_2'
        when label ~ 'opci[oó]n[[:space:]]*3|opcion_3' then 'opcion_3'
        when label ~ 'cel[ií]ac|sin[[:space:]]*tacc' then 'celiacos'
        when label ~ 'dieta|diet[eé]tico|hipos[oó]dico|vegetariano|vegano' then 'dieta'
        when label ~ 'bife.*lomo|lomo' then 'bife_lomo'
        when label ~ 'bife.*pollo' then 'bife_pollo'
        when label ~ 'men[uú][[:space:]]*principal|menu[[:space:]]*principal|plato[[:space:]]*principal|principal' then 'menu_principal'
        when label ~ 'opci[oó]n|menu|men[uú]|cena|almuerzo' then 'otros_menus'
        else null
      end as concept_code,
      quantity
    from item_events
    union all
    select
      delivery_date,
      company_slug,
      company_name,
      case
        when label ~ 'guarnici[oó]n|guarnicion|acompa[nñ]amiento' then 'guarniciones'
        when label ~ 'opci[oó]n[[:space:]]*1|opcion_1' then 'opcion_1'
        when label ~ 'opci[oó]n[[:space:]]*2|opcion_2' then 'opcion_2'
        when label ~ 'opci[oó]n[[:space:]]*3|opcion_3' then 'opcion_3'
        when label ~ 'cel[ií]ac|sin[[:space:]]*tacc' then 'celiacos'
        when label ~ 'dieta|diet[eé]tico|hipos[oó]dico|vegetariano|vegano' then 'dieta'
        when label ~ 'bife.*lomo|lomo' then 'bife_lomo'
        when label ~ 'bife.*pollo' then 'bife_pollo'
        when label ~ 'men[uú][[:space:]]*principal|menu[[:space:]]*principal|plato[[:space:]]*principal|principal' then 'menu_principal'
        when label ~ 'opci[oó]n|menu|men[uú]|cena|almuerzo' then 'otros_menus'
        else null
      end as concept_code,
      quantity
    from response_events
  ),
  concept_totals as (
    select
      delivery_date,
      company_slug,
      max(company_name) as company_name,
      concept_code,
      case concept_code
        when 'menu_principal' then 'Menú principal'
        when 'opcion_1' then 'Opción 1'
        when 'opcion_2' then 'Opción 2'
        when 'opcion_3' then 'Opción 3'
        when 'otros_menus' then 'Otros menús'
        when 'dieta' then 'Dieta'
        when 'celiacos' then 'Celíacos'
        when 'bife_lomo' then 'Bife de lomo'
        when 'bife_pollo' then 'Bife de pollo'
        when 'guarniciones' then 'Guarniciones'
      end as concept_label,
      sum(quantity)::numeric as quantity
    from classified_events
    where concept_code is not null
    group by delivery_date, company_slug, concept_code
  ),
  companies_seen as (
    select
      company_slug,
      max(company_name) as company_name,
      min(case company_slug
        when 'ccp' then 10
        when 'laja' then 20
        when 'padrebueno' then 30
        when 'losberros' then 40
        when 'genneia' then 50
        when 'distro_cuyo' then 60
        when 'epse' then 70
        when 'greif' then 80
        when 'placo' then 90
        when 'molinos' then 100
        else 1000
      end) as sort_order
    from filtered_orders
    group by company_slug
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(ct) order by ct.delivery_date, ct.company_name, ct.concept_code) from concept_totals ct), '[]'::jsonb),
    'companies', coalesce((select jsonb_agg(to_jsonb(cs) order by cs.sort_order, cs.company_name) from companies_seen cs), '[]'::jsonb),
    'dates', coalesce((
      select jsonb_agg(day::date order by day)
      from generate_series(p_from_date, p_to_date, interval '1 day') day
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$$;

revoke execute on function public.totalizer_get_summary(date, date, text, text[]) from public, anon;
grant execute on function public.totalizer_get_summary(date, date, text, text[]) to authenticated;

notify pgrst, 'reload schema';

commit;
