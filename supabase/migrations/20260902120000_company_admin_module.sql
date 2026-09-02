begin;

alter table public.companies
  add column if not exists active boolean not null default true,
  add column if not exists visibility text not null default 'public',
  add column if not exists description text,
  add column if not exists subtitle text,
  add column if not exists options_source_slug text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists label_settings jsonb not null default '{}'::jsonb,
  add column if not exists integration_settings jsonb not null default '{}'::jsonb,
  add column if not exists remito_end_number integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_visibility_valid'
  ) then
    alter table public.companies
      add constraint companies_visibility_valid check (visibility in ('admins', 'public'));
  end if;
end $$;

alter table public.order_locations
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists delivery_name text,
  add column if not exists schedule_mode text not null default 'inherit',
  add column if not exists schedule_flow text references public.order_schedule_flows(flow) on update cascade on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_locations'::regclass
      and conname = 'order_locations_schedule_mode_valid'
  ) then
    alter table public.order_locations
      add constraint order_locations_schedule_mode_valid check (schedule_mode in ('inherit', 'standard', 'extended', 'custom'));
  end if;
end $$;

create index if not exists order_locations_company_id_idx on public.order_locations(company_id);

insert into public.order_organizations (code, name, active)
values ('GENERAL', 'General', true)
on conflict (code) do update
set name = excluded.name,
    active = true,
    updated_at = now();

create table if not exists public.company_services (
  company_id uuid not null references public.companies(id) on delete cascade,
  service text not null check (service in ('lunch', 'dinner')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, service)
);

create table if not exists public.company_schedule_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  mode text not null default 'standard' check (mode in ('standard', 'extended', 'custom')),
  opens_at time not null default time '06:00:00',
  closes_at time not null default time '14:00:00',
  timezone text not null default 'America/Argentina/San_Juan',
  per_location boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_schedule_settings_distinct_times check (opens_at <> closes_at)
);

create table if not exists public.company_menu_item_settings (
  company_id uuid not null references public.companies(id) on delete cascade,
  menu_item_key text not null,
  enabled boolean not null default true,
  display_label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, menu_item_key)
);

create table if not exists public.company_rule_settings (
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_key text not null,
  enabled boolean not null default false,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, rule_key)
);

alter table public.company_services enable row level security;
alter table public.company_schedule_settings enable row level security;
alter table public.company_menu_item_settings enable row level security;
alter table public.company_rule_settings enable row level security;

drop policy if exists companies_visible_or_admin_select on public.companies;
create policy companies_visible_or_admin_select
on public.companies
for select
to authenticated
using (
  public.is_admin()
  or public.is_company_admin(companies.slug)
  or (active = true and visibility = 'public')
);

drop policy if exists companies_admin_select on public.companies;

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write
on public.companies
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_services_select_visible on public.company_services;
create policy company_services_select_visible
on public.company_services
for select
to authenticated
using (
  exists (
    select 1 from public.companies c
    where c.id = company_services.company_id
      and (public.is_admin() or public.is_company_admin(c.slug) or (c.active = true and c.visibility = 'public'))
  )
);

drop policy if exists company_services_admin_write on public.company_services;
create policy company_services_admin_write
on public.company_services
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_schedule_select_visible on public.company_schedule_settings;
create policy company_schedule_select_visible
on public.company_schedule_settings
for select
to authenticated
using (
  exists (
    select 1 from public.companies c
    where c.id = company_schedule_settings.company_id
      and (public.is_admin() or public.is_company_admin(c.slug) or (c.active = true and c.visibility = 'public'))
  )
);

drop policy if exists company_schedule_admin_write on public.company_schedule_settings;
create policy company_schedule_admin_write
on public.company_schedule_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_menu_settings_select_visible on public.company_menu_item_settings;
create policy company_menu_settings_select_visible
on public.company_menu_item_settings
for select
to authenticated
using (
  exists (
    select 1 from public.companies c
    where c.id = company_menu_item_settings.company_id
      and (public.is_admin() or public.is_company_admin(c.slug) or (c.active = true and c.visibility = 'public'))
  )
);

drop policy if exists company_menu_settings_admin_write on public.company_menu_item_settings;
create policy company_menu_settings_admin_write
on public.company_menu_item_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_rule_settings_select_visible on public.company_rule_settings;
create policy company_rule_settings_select_visible
on public.company_rule_settings
for select
to authenticated
using (
  exists (
    select 1 from public.companies c
    where c.id = company_rule_settings.company_id
      and (public.is_admin() or public.is_company_admin(c.slug) or (c.active = true and c.visibility = 'public'))
  )
);

drop policy if exists company_rule_settings_admin_write on public.company_rule_settings;
create policy company_rule_settings_admin_write
on public.company_rule_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists menu_items_select_all_auth on public.menu_items;
create policy menu_items_select_all_auth
on public.menu_items
for select
to authenticated
using (
  company_slug = 'global'
  or public.is_admin()
  or public.is_company_admin(company_slug)
  or exists (
    select 1
    from public.companies c
    where c.slug = menu_items.company_slug
      and c.active = true
      and c.visibility = 'public'
  )
);

drop policy if exists dinner_menu_select_all_auth on public.dinner_menu_by_date;
create policy dinner_menu_select_all_auth
on public.dinner_menu_by_date
for select
to authenticated
using (
  company is null
  or company = ''
  or public.is_admin()
  or public.is_company_admin(company)
  or exists (
    select 1
    from public.companies c
    where c.slug = dinner_menu_by_date.company
      and c.active = true
      and c.visibility = 'public'
  )
);

drop policy if exists custom_options_select_auth on public.custom_options;
create policy custom_options_select_auth
on public.custom_options
for select
to authenticated
using (
  company is null
  or company = ''
  or public.is_admin()
  or public.is_company_admin(company)
  or exists (
    select 1
    from public.companies c
    where c.slug = custom_options.company
      and c.active = true
      and c.visibility = 'public'
  )
);

update public.companies
set active = true,
    visibility = case when slug = 'administracion_servifood' then 'admins' else 'public' end,
    options_source_slug = coalesce(options_source_slug, case
      when slug in ('ccp', 'padrebueno', 'losberros', 'greif', 'molinos', 'igarreta', 'isemar') then 'laja'
      else slug
    end),
    settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'requiresAuthorizedLocations', slug in ('epse', 'isemar')
    ),
    label_settings = coalesce(nullif(label_settings, '{}'::jsonb), jsonb_build_object(
      'showCompany', true,
      'showLocation', true,
      'showName', true,
      'showMenu', true,
      'showSide', true,
      'showBeverage', slug <> 'epse',
      'showNotes', true
    )),
    integration_settings = coalesce(nullif(integration_settings, '{}'::jsonb), jsonb_build_object(
      'dailyReport', true,
      'totalizer', true,
      'excel', true,
      'monthlyPanel', true,
      'extraOrders', true
    )),
    updated_at = now();

insert into public.company_services (company_id, service, enabled)
select c.id, v.service, v.enabled
from public.companies c
cross join (values ('lunch', true), ('dinner', false)) as v(service, enabled)
on conflict (company_id, service) do nothing;

create or replace function public.normalize_company_admin_slug(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(trim(both '_' from regexp_replace(
    translate(lower(trim(coalesce(p_value, ''))), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+',
    '_',
    'g'
  )), '');
$$;

insert into public.company_schedule_settings (company_id, mode, opens_at, closes_at, per_location)
select
  c.id,
  case when c.slug in ('laja', 'ccp', 'padrebueno', 'losberros', 'administracion_servifood') then 'extended' else 'standard' end,
  case when c.slug in ('laja', 'ccp', 'padrebueno', 'losberros', 'administracion_servifood') then time '09:00:00' else time '06:00:00' end,
  case when c.slug in ('laja', 'ccp', 'padrebueno', 'losberros', 'administracion_servifood') then time '22:00:00' else time '14:00:00' end,
  false
from public.companies c
on conflict (company_id) do nothing;

with organization_company_map(organization_code, company_slug) as (
  values
    ('CCP', 'ccp'),
    ('LAJA', 'laja'),
    ('LA_LAJA', 'laja'),
    ('PADREBUENO', 'padrebueno'),
    ('PADRE_BUENO', 'padrebueno'),
    ('LOSBERROS', 'losberros'),
    ('LOS_BERROS', 'losberros'),
    ('EPSE', 'epse'),
    ('ISEMAR', 'isemar'),
    ('GREIF', 'greif'),
    ('MOLINOS', 'molinos'),
    ('PLACO', 'placo'),
    ('IGARRETA', 'igarreta'),
    ('IGARRETA_MAQUINAS', 'igarreta'),
    ('IGARRETA_MAQUINAS_SA', 'igarreta'),
    ('GENNEIA', 'genneia'),
    ('DISTRO_CUYO', 'distro_cuyo'),
    ('DISTROCUYO', 'distro_cuyo'),
    ('ADMINISTRACION_SERVIFOOD', 'administracion_servifood'),
    ('ADMINISTRACION', 'administracion_servifood')
)
update public.order_locations loc
set company_id = c.id,
    updated_at = now()
from public.order_organizations org
join organization_company_map map on map.organization_code = upper(trim(org.code))
join public.companies c on c.slug = map.company_slug
where loc.company_id is null
  and loc.organization_id = org.id;

update public.order_locations loc
set company_id = c.id,
    updated_at = now()
from public.order_organizations org
join public.companies c on c.slug = public.normalize_company_remito_slug(org.code)
where loc.company_id is null
  and loc.organization_id = org.id
  and c.slug <> 'global';

with location_company_map(location_code, location_slug, company_slug) as (
  values
    ('CCP', 'ccp', 'ccp'),
    ('LAJA', 'laja', 'laja'),
    ('LA_LAJA', 'la_laja', 'laja'),
    ('PADREBUENO', 'padrebueno', 'padrebueno'),
    ('PADRE_BUENO', 'padre_bueno', 'padrebueno'),
    ('LOSBERROS', 'losberros', 'losberros'),
    ('LOS_BERROS', 'los_berros', 'losberros'),
    ('EPSE_QUEBRADA_ULLUM', 'epse_quebrada_ullum', 'epse'),
    ('EPSE_ANCHIPURAC', 'epse_anchipurac', 'epse'),
    ('EPSE_PLANTA_FOTOVOLTAICA', 'epse_planta_fotovoltaica', 'epse'),
    ('EPSE_ESTACION_TRANSFORMADORA', 'epse_estacion_transformadora', 'epse'),
    ('EPSE_PUNTA_NEGRA', 'epse_punta_negra', 'epse'),
    ('EPSE_LOS_CARACOLES', 'epse_los_caracoles', 'epse'),
    ('EPSE_OBRA_LINEA_ALTA_TENSION', 'epse_obra_linea_alta_tension', 'epse'),
    ('EPSE_FABRICA_PANELES_SOLARES', 'epse-fabrica-paneles-solares', 'epse'),
    ('ISEMAR_PREDIO_1', 'isemar_predio_1', 'isemar'),
    ('ISEMAR_PREDIO_2', 'isemar_predio_2', 'isemar'),
    ('GREIF', 'greif', 'greif'),
    ('MOLINOS', 'molinos', 'molinos'),
    ('PLACO', 'placo', 'placo'),
    ('IGARRETA', 'igarreta', 'igarreta'),
    ('IGARRETA_MAQUINAS', 'igarreta_maquinas', 'igarreta'),
    ('IGARRETA_MAQUINAS_SA', 'igarreta_maquinas_sa', 'igarreta'),
    ('GENNEIA', 'genneia', 'genneia'),
    ('DISTRO_CUYO', 'distro_cuyo', 'distro_cuyo'),
    ('DISTROCUYO', 'distrocuyo', 'distro_cuyo'),
    ('ADMINISTRACION_SERVIFOOD', 'administracion_servifood', 'administracion_servifood'),
    ('ADMINISTRACION', 'administracion', 'administracion_servifood')
)
update public.order_locations loc
set company_id = c.id,
    updated_at = now()
from location_company_map map
join public.companies c on c.slug = map.company_slug
where loc.company_id is null
  and (
    upper(trim(loc.code)) = map.location_code
    or loc.slug = map.location_slug
  );

update public.order_locations loc
set company_id = c.id,
    updated_at = now()
from public.companies c
where loc.company_id is null
  and c.slug <> 'global'
  and c.slug = public.normalize_company_remito_slug(coalesce(nullif(loc.code, ''), loc.slug));

create or replace function public.assert_company_order_allowed(p_company_slug text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_company public.companies%rowtype;
begin
  v_slug := public.normalize_company_admin_slug(p_company_slug);
  if v_slug is null then
    return;
  end if;

  select *
  into v_company
  from public.companies c
  where c.slug = v_slug;

  if not found then
    return;
  end if;

  if not coalesce(v_company.active, true) then
    raise exception 'company_inactive';
  end if;

  if coalesce(v_company.visibility, 'public') <> 'public'
    and not public.is_admin()
    and not public.is_company_admin(v_company.slug)
  then
    raise exception 'company_admins_only';
  end if;
end;
$$;

create or replace function public.check_order_company_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload_slug text;
  v_location_slug text;
begin
  if tg_op = 'INSERT' or (
    tg_op = 'UPDATE' and (
      coalesce(new.company_slug, '') is distinct from coalesce(old.company_slug, '')
      or new.order_location_id is distinct from old.order_location_id
      or coalesce(new.location, '') is distinct from coalesce(old.location, '')
      or coalesce(new.requesting_location_code, '') is distinct from coalesce(old.requesting_location_code, '')
    )
  )
  then
    v_payload_slug := public.normalize_company_admin_slug(new.company_slug);

    select c.slug
    into v_location_slug
    from public.order_locations loc
    join public.companies c on c.id = loc.company_id
    where (
      new.order_location_id is not null
      and loc.id = new.order_location_id
    ) or (
      nullif(trim(coalesce(new.location, new.requesting_location_code, '')), '') is not null
      and public.normalize_order_schedule_location_key(coalesce(new.location, new.requesting_location_code)) in (
        public.normalize_order_schedule_location_key(loc.display_name),
        public.normalize_order_schedule_location_key(loc.code),
        public.normalize_order_schedule_location_key(loc.slug)
      )
    )
    order by case when loc.id = new.order_location_id then 0 else 1 end
    limit 1;

    if v_payload_slug is not null
      and exists (select 1 from public.companies c where c.slug = v_payload_slug)
      and v_location_slug is not null
      and v_payload_slug <> v_location_slug
    then
      raise exception 'order_company_location_mismatch';
    end if;

    if v_payload_slug is not null and not exists (select 1 from public.companies c where c.slug = v_payload_slug) then
      v_payload_slug := null;
    end if;

    perform public.assert_company_order_allowed(coalesce(v_location_slug, v_payload_slug));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_company_visibility on public.orders;
create trigger trg_orders_company_visibility
before insert or update on public.orders
for each row execute function public.check_order_company_visibility();

create or replace function public.get_order_schedule_context(
  p_location text,
  p_at timestamptz default now()
)
returns table (
  flow text,
  timezone text,
  opens_at text,
  closes_at text,
  is_open boolean,
  state text,
  next_transition_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with input as (
    select
      public.normalize_order_schedule_location_key(p_location) as location_key,
      coalesce(p_at, now()) as evaluated_at
  ),
  resolved_location as (
    select
      i.evaluated_at,
      coalesce(public.normalize_order_schedule_location_key(loc.display_name), i.location_key) as schedule_location_key,
      loc.id as location_id,
      loc.company_id,
      loc.schedule_mode,
      loc.schedule_flow
    from input i
    left join lateral (
      select loc.*
      from public.order_locations loc
      where loc.active = true
        and i.location_key in (
          public.normalize_order_schedule_location_key(loc.display_name),
          public.normalize_order_schedule_location_key(loc.code),
          public.normalize_order_schedule_location_key(loc.slug)
        )
      order by
        case
          when i.location_key = public.normalize_order_schedule_location_key(loc.display_name) then 1
          when i.location_key = public.normalize_order_schedule_location_key(loc.code) then 2
          when i.location_key = public.normalize_order_schedule_location_key(loc.slug) then 3
          else 4
        end
      limit 1
    ) loc on true
  ),
  company_schedule as (
    select
      r.evaluated_at,
      r.schedule_location_key,
      case
        when r.schedule_mode in ('standard', 'extended') then r.schedule_mode
        when r.schedule_flow in ('standard', 'extended') then r.schedule_flow
        when cs.mode in ('standard', 'extended') then cs.mode
        when cs.mode = 'custom' then 'custom'
        else null
      end as mode,
      cs.opens_at as custom_opens_at,
      cs.closes_at as custom_closes_at,
      cs.timezone as custom_timezone
    from resolved_location r
    left join public.company_schedule_settings cs on cs.company_id = r.company_id
  ),
  legacy_override as (
    select f.*, cs.evaluated_at
    from company_schedule cs
    join public.order_schedule_location_overrides o on o.location_key = cs.schedule_location_key
    join public.order_schedule_flows f on f.flow = o.flow
    where cs.mode is null

    union all

    select f.*, cs.evaluated_at
    from company_schedule cs
    join public.order_schedule_flows f on f.is_default = true
    where cs.mode is null
      and not exists (
        select 1
        from public.order_schedule_location_overrides o
        where o.location_key = cs.schedule_location_key
      )
    limit 1
  ),
  selected_schedule as (
    select
      case when cs.mode = 'custom' then 'custom' else f.flow end as flow,
      coalesce(cs.custom_timezone, f.timezone, 'America/Argentina/San_Juan') as timezone,
      case when cs.mode = 'custom' then cs.custom_opens_at else f.opens_at end as opens_at,
      case when cs.mode = 'custom' then cs.custom_closes_at else f.closes_at end as closes_at,
      cs.evaluated_at
    from company_schedule cs
    left join public.order_schedule_flows f on f.flow = cs.mode
    where cs.mode is not null

    union all

    select flow, timezone, opens_at, closes_at, evaluated_at
    from legacy_override
    limit 1
  ),
  evaluated as (
    select
      ss.*,
      ss.evaluated_at at time zone ss.timezone as local_ts
    from selected_schedule ss
  ),
  classified as (
    select
      e.*,
      e.local_ts::date as local_date,
      e.local_ts::time as local_time,
      case
        when e.local_ts::time < e.opens_at then 'before_open'
        when e.local_ts::time >= e.opens_at and e.local_ts::time < e.closes_at then 'open'
        else 'after_close'
      end as state
    from evaluated e
  )
  select
    c.flow,
    c.timezone,
    to_char(c.opens_at, 'HH24:MI') as opens_at,
    to_char(c.closes_at, 'HH24:MI') as closes_at,
    c.state = 'open' as is_open,
    c.state,
    (
      case
        when c.state = 'before_open' then c.local_date + c.opens_at
        when c.state = 'open' then c.local_date + c.closes_at
        else c.local_date + interval '1 day' + c.opens_at
      end
    ) at time zone c.timezone as next_transition_at
  from classified c;
$$;

create or replace function public.get_visible_custom_options(
  p_company text,
  p_meal text,
  p_date date,
  p_country_code text default 'AR'
)
returns setof public.custom_options
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select co.*
  from public.custom_options co
  left join public.custom_option_overrides ovr
    on ovr.option_id = co.id
   and ovr.date = p_date
  where coalesce((to_jsonb(co)->>'enabled')::boolean, (to_jsonb(co)->>'active')::boolean, true) = true
    and (
      coalesce(to_jsonb(co)->>'meal_scope', to_jsonb(co)->>'meal', 'both') = 'both'
      or coalesce(to_jsonb(co)->>'meal_scope', to_jsonb(co)->>'meal') = p_meal
    )
    and (co.company is null or co.company = p_company)
    and (
      co.company is null
      or co.company = ''
      or public.is_admin()
      or public.is_company_admin(co.company)
      or exists (
        select 1
        from public.companies c
        where c.slug = co.company
          and c.active = true
          and c.visibility = 'public'
      )
    )
    and coalesce(ovr.enabled, true) = true
  order by co.order_position asc, co.created_at asc;
$$;

create or replace function public.get_company_admin_catalog()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_is_admin := public.is_admin();

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'description', c.description,
      'subtitle', c.subtitle,
      'active', c.active,
      'visibility', c.visibility,
      'optionsSourceSlug', c.options_source_slug,
      'settings', c.settings,
      'labelSettings', c.label_settings,
      'integrationSettings', c.integration_settings,
      'remitoStartNumber', c.remito_start_number,
      'remitoEndNumber', c.remito_end_number,
      'nextRemitoNumber', c.next_remito_number,
      'issuedCount', coalesce(r.issued_count, 0),
      'lastRemitoNumber', r.last_remito_number,
      'services', coalesce(s.services, '[]'::jsonb),
      'schedule', coalesce(to_jsonb(cs), '{}'::jsonb) - 'company_id' - 'created_at' - 'updated_at',
      'locations', coalesce(l.locations, '[]'::jsonb),
      'rules', coalesce(rs.rules, '{}'::jsonb),
      'menuItems', coalesce(mi.menu_items, '[]'::jsonb)
    )
    order by c.name asc
  ), '[]'::jsonb)
  into v_result
  from public.companies c
  left join lateral (
    select count(cr.id)::bigint issued_count, max(cr.remito_number)::integer last_remito_number
    from public.company_remitos cr
    where cr.company_id = c.id
  ) r on true
  left join public.company_schedule_settings cs on cs.company_id = c.id
  left join lateral (
    select jsonb_agg(jsonb_build_object('service', service, 'enabled', enabled) order by service) services
    from public.company_services svc
    where svc.company_id = c.id
  ) s on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', loc.id,
      'name', loc.display_name,
      'code', loc.code,
      'slug', loc.slug,
      'active', loc.active,
      'deliveryName', coalesce(loc.delivery_name, loc.display_name),
      'scheduleMode', loc.schedule_mode,
      'scheduleFlow', loc.schedule_flow
    ) order by loc.display_name) locations
    from public.order_locations loc
    where loc.company_id = c.id
  ) l on true
  left join lateral (
    select jsonb_object_agg(rule_key, jsonb_build_object('enabled', enabled, 'value', value)) rules
    from public.company_rule_settings crs
    where crs.company_id = c.id
  ) rs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'key', menu_item_key,
      'enabled', enabled,
      'displayLabel', display_label,
      'sortOrder', sort_order
    ) order by sort_order, menu_item_key) menu_items
    from public.company_menu_item_settings cmis
    where cmis.company_id = c.id
  ) mi on true
  where v_is_admin
    or public.is_company_admin(c.slug);

  return v_result;
end;
$$;

create or replace function public.validate_company_admin_payload(p_company jsonb, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_name text;
  v_active boolean;
  v_visibility text;
  v_locations jsonb;
  v_services jsonb;
  v_schedule jsonb;
  v_remitos jsonb;
  v_uses_remitos boolean;
  v_company_id_text text;
  v_existing_slug text;
  v_start integer;
  v_end integer;
  v_errors text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  v_name := nullif(trim(coalesce(p_company->>'name', '')), '');
  v_slug := public.normalize_company_admin_slug(coalesce(p_company->>'slug', v_name));
  v_active := coalesce((p_company->>'active')::boolean, true);
  v_visibility := coalesce(nullif(p_company->>'visibility', ''), 'admins');
  v_locations := coalesce(p_company->'locations', '[]'::jsonb);
  v_services := coalesce(p_company->'services', '[]'::jsonb);
  v_schedule := coalesce(p_company->'schedule', '{}'::jsonb);
  v_remitos := coalesce(p_company->'remitos', '{}'::jsonb);
  v_uses_remitos := coalesce((v_remitos->>'enabled')::boolean, false);
  v_company_id_text := nullif(p_company->>'id', '');

  if v_name is null then v_errors := array_append(v_errors, 'Ingresá el nombre de la empresa.'); end if;
  if v_slug is null then v_errors := array_append(v_errors, 'Definí un slug válido.'); end if;
  if v_company_id_text is not null and v_slug is not null then
    select c.slug
    into v_existing_slug
    from public.companies c
    where c.id::text = v_company_id_text
    limit 1;

    if not found then
      v_errors := array_append(v_errors, 'La empresa que intentás editar no existe.');
    elsif v_existing_slug <> v_slug then
      v_errors := array_append(v_errors, 'No se puede cambiar el slug de una empresa existente para no romper históricos.');
    end if;
  elsif v_slug is not null and exists (
    select 1 from public.companies c where c.slug = v_slug
  ) then
    v_errors := array_append(v_errors, 'Ya existe una empresa con ese slug.');
  end if;
  if v_visibility not in ('admins', 'public') then v_errors := array_append(v_errors, 'La visibilidad no es válida.'); end if;
  if jsonb_typeof(v_locations) <> 'array' then
    v_errors := array_append(v_errors, 'Las sedes deben ser una lista.');
    v_locations := '[]'::jsonb;
  end if;
  if jsonb_typeof(v_services) <> 'array' then
    v_errors := array_append(v_errors, 'Los servicios deben ser una lista.');
    v_services := '[]'::jsonb;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_services) svc where coalesce((svc->>'enabled')::boolean, false)
  ) then
    v_errors := array_append(v_errors, 'Habilitá al menos un servicio.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_services) svc
    where svc->>'service' not in ('lunch', 'dinner')
  ) then
    v_errors := array_append(v_errors, 'Hay un servicio inválido.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_locations) loc
    where nullif(trim(coalesce(loc->>'name', '')), '') is null
  ) then
    v_errors := array_append(v_errors, 'Todas las sedes cargadas deben tener nombre.');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_locations) loc
    join public.order_locations existing
      on existing.slug = coalesce(nullif(loc->>'slug', ''), public.normalize_company_admin_slug(loc->>'name'))
    where existing.company_id is not null
      and (v_company_id_text is null or existing.company_id::text <> v_company_id_text)
  ) then
    v_errors := array_append(v_errors, 'Una o más sedes usan un slug que ya pertenece a otra empresa.');
  end if;
  if coalesce(v_schedule->>'mode', 'standard') not in ('standard', 'extended', 'custom') then
    v_errors := array_append(v_errors, 'El horario no es válido.');
  end if;
  if coalesce(v_schedule->>'mode', 'standard') = 'custom'
    and (nullif(v_schedule->>'opensAt', '') is null or nullif(v_schedule->>'closesAt', '') is null) then
    v_errors := array_append(v_errors, 'Completá apertura y cierre para el horario personalizado.');
  end if;
  if v_uses_remitos then
    if nullif(v_remitos->>'startNumber', '') is null then
      v_errors := array_append(v_errors, 'Configurá el número inicial de remitos.');
    end if;
    if nullif(v_remitos->>'endNumber', '') is not null
      and (v_remitos->>'endNumber')::integer < (v_remitos->>'startNumber')::integer then
      v_errors := array_append(v_errors, 'El número final de remitos no puede ser menor al inicial.');
    end if;
    v_start := nullif(v_remitos->>'startNumber', '')::integer;
    v_end := nullif(v_remitos->>'endNumber', '')::integer;
    if v_start is not null
      and (v_end is null or v_end >= v_start)
      and exists (
        select 1
        from public.companies c
        where c.remito_start_number is not null
          and (v_company_id_text is null or c.id::text <> v_company_id_text)
          and int4range(
            c.remito_start_number,
            case when c.remito_end_number is null then null else c.remito_end_number + 1 end,
            '[)'
          ) && int4range(
            v_start,
            case when v_end is null then null else v_end + 1 end,
            '[)'
          )
      )
    then
      v_errors := array_append(v_errors, 'El rango de remitos se superpone con otra empresa.');
    end if;
  end if;
  if p_publish and not v_active then
    v_errors := array_append(v_errors, 'Para publicar, la empresa debe estar activa.');
  end if;

  return jsonb_build_object('ok', array_length(v_errors, 1) is null, 'errors', to_jsonb(v_errors));
end;
$$;

create or replace function public.save_company_admin_config(p_company jsonb, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_validation jsonb;
  v_errors jsonb;
  v_company_id uuid;
  v_slug text;
  v_name text;
  v_visibility text;
  v_schedule jsonb;
  v_remitos jsonb;
  v_settings jsonb;
  v_label_settings jsonb;
  v_integration_settings jsonb;
  v_start integer;
  v_end integer;
  v_next integer;
  v_locations jsonb;
  v_services jsonb;
  v_rules jsonb;
  v_menu_items jsonb;
  v_item jsonb;
  v_mode text;
  v_existing_company public.companies%rowtype;
  v_is_existing_company boolean := false;
  v_location public.order_locations%rowtype;
  v_location_id_text text;
  v_location_slug text;
  v_location_code text;
  v_issued_count bigint := 0;
begin
  v_validation := public.validate_company_admin_payload(p_company, p_publish);
  v_errors := v_validation->'errors';
  if coalesce((v_validation->>'ok')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  v_name := trim(p_company->>'name');
  v_slug := public.normalize_company_admin_slug(coalesce(p_company->>'slug', v_name));
  v_visibility := case when p_publish then 'public' else coalesce(nullif(p_company->>'visibility', ''), 'admins') end;
  v_schedule := coalesce(p_company->'schedule', '{}'::jsonb);
  v_remitos := coalesce(p_company->'remitos', '{}'::jsonb);
  v_settings := coalesce(p_company->'settings', '{}'::jsonb);
  v_label_settings := coalesce(p_company->'labelSettings', '{}'::jsonb);
  v_integration_settings := coalesce(p_company->'integrationSettings', '{}'::jsonb);
  v_locations := coalesce(p_company->'locations', '[]'::jsonb);
  v_services := coalesce(p_company->'services', '[]'::jsonb);
  v_rules := coalesce(p_company->'rules', '{}'::jsonb);
  v_menu_items := coalesce(p_company->'menuItems', '[]'::jsonb);

  if coalesce((v_remitos->>'enabled')::boolean, false) then
    v_start := nullif(v_remitos->>'startNumber', '')::integer;
    v_end := nullif(v_remitos->>'endNumber', '')::integer;
    v_next := coalesce(nullif(v_remitos->>'nextNumber', '')::integer, v_start);
  else
    v_start := null;
    v_end := null;
    v_next := null;
  end if;

  if nullif(p_company->>'id', '') is not null then
    select *
    into v_existing_company
    from public.companies
    where id::text = p_company->>'id'
    for update;

    if not found then
      raise exception 'company_not_found';
    elsif v_existing_company.slug <> v_slug then
      raise exception 'company_slug_change_not_supported';
    end if;
    v_is_existing_company := true;
  else
    select *
    into v_existing_company
    from public.companies
    where slug = v_slug
    for update;

    if found then
      raise exception 'company_slug_already_exists';
    end if;
  end if;

  if v_is_existing_company then
    select count(*)
    into v_issued_count
    from public.company_remitos cr
    where cr.company_id = v_existing_company.id;

    if v_issued_count > 0 and (
      v_start is distinct from v_existing_company.remito_start_number
      or v_end is distinct from v_existing_company.remito_end_number
    ) then
      raise exception 'company_has_issued_remitos';
    end if;

    if v_issued_count > 0 and v_next is not null then
      v_next := greatest(v_next, coalesce(v_existing_company.next_remito_number, v_next));
    end if;
  end if;

  if v_is_existing_company then
    update public.companies
    set name = v_name,
        description = nullif(p_company->>'description', ''),
        subtitle = nullif(p_company->>'subtitle', ''),
        active = coalesce((p_company->>'active')::boolean, true),
        visibility = v_visibility,
        options_source_slug = nullif(public.normalize_company_admin_slug(coalesce(p_company->>'optionsSourceSlug', v_slug)), ''),
        settings = v_settings,
        label_settings = v_label_settings,
        integration_settings = v_integration_settings,
        remito_start_number = v_start,
        remito_end_number = v_end,
        next_remito_number = case
          when next_remito_number is null then v_next
          when v_next is null then null
          else greatest(next_remito_number, v_next)
        end,
        updated_at = now()
    where id = v_existing_company.id
    returning id into v_company_id;
  else
    insert into public.companies (
      slug, name, description, subtitle, active, visibility, options_source_slug,
      settings, label_settings, integration_settings,
      remito_start_number, remito_end_number, next_remito_number
    )
    values (
      v_slug,
      v_name,
      nullif(p_company->>'description', ''),
      nullif(p_company->>'subtitle', ''),
      coalesce((p_company->>'active')::boolean, true),
      v_visibility,
      nullif(public.normalize_company_admin_slug(coalesce(p_company->>'optionsSourceSlug', v_slug)), ''),
      v_settings,
      v_label_settings,
      v_integration_settings,
      v_start,
      v_end,
      v_next
    )
    returning id into v_company_id;
  end if;

  v_mode := coalesce(v_schedule->>'mode', 'standard');
  insert into public.company_schedule_settings (company_id, mode, opens_at, closes_at, timezone, per_location)
  values (
    v_company_id,
    v_mode,
    coalesce(nullif(v_schedule->>'opensAt', '')::time, case when v_mode = 'extended' then time '09:00:00' else time '06:00:00' end),
    coalesce(nullif(v_schedule->>'closesAt', '')::time, case when v_mode = 'extended' then time '22:00:00' else time '14:00:00' end),
    coalesce(nullif(v_schedule->>'timezone', ''), 'America/Argentina/San_Juan'),
    coalesce((v_schedule->>'perLocation')::boolean, false)
  )
  on conflict (company_id) do update
  set mode = excluded.mode,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      timezone = excluded.timezone,
      per_location = excluded.per_location,
      updated_at = now();

  delete from public.company_services where company_id = v_company_id;
  for v_item in select * from jsonb_array_elements(v_services) loop
    insert into public.company_services (company_id, service, enabled)
    values (v_company_id, v_item->>'service', coalesce((v_item->>'enabled')::boolean, false))
    on conflict (company_id, service) do update set enabled = excluded.enabled, updated_at = now();
  end loop;

  delete from public.company_rule_settings where company_id = v_company_id;
  for v_item in
    select jsonb_build_object('key', key, 'data', value)
    from jsonb_each(v_rules)
  loop
    insert into public.company_rule_settings (company_id, rule_key, enabled, value)
    values (
      v_company_id,
      v_item->>'key',
      coalesce(((v_item->'data')->>'enabled')::boolean, false),
      coalesce((v_item->'data')->'value', '{}'::jsonb)
    );
  end loop;

  delete from public.company_menu_item_settings where company_id = v_company_id;
  for v_item in select * from jsonb_array_elements(v_menu_items) loop
    insert into public.company_menu_item_settings (company_id, menu_item_key, enabled, display_label, sort_order)
    values (
      v_company_id,
      coalesce(v_item->>'key', v_item->>'menuItemKey'),
      coalesce((v_item->>'enabled')::boolean, true),
      nullif(v_item->>'displayLabel', ''),
      coalesce(nullif(v_item->>'sortOrder', '')::integer, 0)
    );
  end loop;

  update public.order_locations
  set company_id = null,
      updated_at = now()
  where company_id = v_company_id;

  for v_item in select * from jsonb_array_elements(v_locations) loop
    v_location_id_text := nullif(v_item->>'id', '');
    v_location_slug := coalesce(nullif(v_item->>'slug', ''), public.normalize_company_admin_slug(v_item->>'name'));
    v_location_code := coalesce(nullif(v_item->>'code', ''), upper(v_slug || '_' || public.normalize_company_admin_slug(v_item->>'name')));

    if v_location_id_text is not null then
      select *
      into v_location
      from public.order_locations
      where id::text = v_location_id_text
        and (company_id = v_company_id or company_id is null)
      for update;

      if not found then
        raise exception 'company_location_not_found';
      end if;

      if exists (
        select 1
        from public.order_locations loc
        where loc.slug = v_location_slug
          and loc.id <> v_location.id
          and loc.company_id is not null
          and loc.company_id <> v_company_id
      ) then
        raise exception 'company_location_slug_conflict';
      end if;

      update public.order_locations
      set company_id = v_company_id,
          organization_id = coalesce(
            (select id from public.order_organizations where code = upper(v_slug) limit 1),
            (select id from public.order_organizations where code = 'GENERAL' limit 1),
            (select id from public.order_organizations order by created_at limit 1)
          ),
          code = v_location_code,
          slug = v_location_slug,
          display_name = v_item->>'name',
          active = coalesce((v_item->>'active')::boolean, true),
          delivery_name = nullif(v_item->>'deliveryName', ''),
          schedule_mode = coalesce(nullif(v_item->>'scheduleMode', ''), 'inherit'),
          schedule_flow = nullif(v_item->>'scheduleFlow', ''),
          updated_at = now()
      where id = v_location.id;
    else
      select *
      into v_location
      from public.order_locations
      where slug = v_location_slug
      for update;

      if found and v_location.company_id is not null and v_location.company_id <> v_company_id then
        raise exception 'company_location_slug_conflict';
      end if;

      if found then
        update public.order_locations
        set company_id = v_company_id,
            organization_id = coalesce(
              (select id from public.order_organizations where code = upper(v_slug) limit 1),
              (select id from public.order_organizations where code = 'GENERAL' limit 1),
              (select id from public.order_organizations order by created_at limit 1)
            ),
            code = v_location_code,
            display_name = v_item->>'name',
            active = coalesce((v_item->>'active')::boolean, true),
            delivery_name = nullif(v_item->>'deliveryName', ''),
            schedule_mode = coalesce(nullif(v_item->>'scheduleMode', ''), 'inherit'),
            schedule_flow = nullif(v_item->>'scheduleFlow', ''),
            updated_at = now()
        where id = v_location.id;
      else
        insert into public.order_locations (
          company_id,
          organization_id,
          code,
          slug,
          display_name,
          active,
          delivery_name,
          schedule_mode,
          schedule_flow
        )
        values (
          v_company_id,
          coalesce(
            (select id from public.order_organizations where code = upper(v_slug) limit 1),
            (select id from public.order_organizations where code = 'GENERAL' limit 1),
            (select id from public.order_organizations order by created_at limit 1)
          ),
          v_location_code,
          v_location_slug,
          v_item->>'name',
          coalesce((v_item->>'active')::boolean, true),
          nullif(v_item->>'deliveryName', ''),
          coalesce(nullif(v_item->>'scheduleMode', ''), 'inherit'),
          nullif(v_item->>'scheduleFlow', '')
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'errors', '[]'::jsonb, 'company', (
    select value from jsonb_array_elements(public.get_company_admin_catalog()) value
    where value->>'slug' = v_slug
    limit 1
  ));
end;
$$;

create or replace function public.duplicate_company_admin_config(p_source_slug text, p_new_name text, p_new_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source jsonb;
  v_payload jsonb;
  v_new_slug text;
  v_locations jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  select value
  into v_source
  from jsonb_array_elements(public.get_company_admin_catalog()) value
  where value->>'slug' = public.normalize_company_admin_slug(p_source_slug)
  limit 1;

  if v_source is null then
    raise exception 'company_not_found';
  end if;

  v_new_slug := public.normalize_company_admin_slug(coalesce(p_new_slug, p_new_name));
  select coalesce(jsonb_agg(
    location
    || jsonb_build_object(
      'id', null,
      'name', location->>'name',
      'code', upper(v_new_slug || '_' || coalesce(nullif(public.normalize_company_admin_slug(location->>'code'), ''), public.normalize_company_admin_slug(location->>'name'), 'sede')),
      'slug', public.normalize_company_admin_slug(v_new_slug || '_' || coalesce(nullif(location->>'slug', ''), location->>'name', 'sede'))
    )
  ), '[]'::jsonb)
  into v_locations
  from jsonb_array_elements(coalesce(v_source->'locations', '[]'::jsonb)) location;

  v_payload := v_source
    || jsonb_build_object(
      'id', null,
      'name', p_new_name,
      'slug', v_new_slug,
      'active', true,
      'visibility', 'admins',
      'locations', v_locations,
      'remitos', jsonb_build_object('enabled', false),
      'remitoStartNumber', null,
      'remitoEndNumber', null,
      'nextRemitoNumber', null
    );

  return public.save_company_admin_config(v_payload, false);
end;
$$;

create or replace function public.get_public_company_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'description', c.description,
    'subtitle', c.subtitle,
    'active', c.active,
    'visibility', c.visibility,
    'optionsSourceSlug', c.options_source_slug,
    'settings', c.settings,
    'labelSettings', c.label_settings,
    'integrationSettings', c.integration_settings,
    'services', coalesce(s.services, '[]'::jsonb),
    'schedule', coalesce(to_jsonb(cs), '{}'::jsonb) - 'company_id' - 'created_at' - 'updated_at',
    'locations', coalesce(l.locations, '[]'::jsonb),
    'rules', coalesce(rs.rules, '{}'::jsonb),
    'menuItems', coalesce(mi.menu_items, '[]'::jsonb)
  ) order by c.name), '[]'::jsonb)
  from public.companies c
  left join public.company_schedule_settings cs on cs.company_id = c.id
  left join lateral (
    select jsonb_agg(jsonb_build_object('service', service, 'enabled', enabled) order by service) services
    from public.company_services svc
    where svc.company_id = c.id and svc.enabled = true
  ) s on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', loc.id,
      'name', loc.display_name,
      'code', loc.code,
      'slug', loc.slug,
      'active', loc.active,
      'deliveryName', coalesce(loc.delivery_name, loc.display_name),
      'scheduleMode', loc.schedule_mode,
      'scheduleFlow', loc.schedule_flow
    ) order by loc.display_name) locations
    from public.order_locations loc
    where loc.company_id = c.id and loc.active = true
  ) l on true
  left join lateral (
    select jsonb_object_agg(rule_key, jsonb_build_object('enabled', enabled, 'value', value)) rules
    from public.company_rule_settings crs
    where crs.company_id = c.id
  ) rs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'key', menu_item_key,
      'enabled', enabled,
      'displayLabel', display_label,
      'sortOrder', sort_order
    ) order by sort_order, menu_item_key) menu_items
    from public.company_menu_item_settings cmis
    where cmis.company_id = c.id and cmis.enabled = true
  ) mi on true
  where c.active = true and c.visibility = 'public';
$$;

revoke all on function public.normalize_company_admin_slug(text) from public;
revoke all on function public.normalize_company_admin_slug(text) from anon;
grant execute on function public.normalize_company_admin_slug(text) to authenticated;

revoke all on function public.assert_company_order_allowed(text) from public;
revoke all on function public.assert_company_order_allowed(text) from anon;
grant execute on function public.assert_company_order_allowed(text) to authenticated;

revoke all on function public.get_order_schedule_context(text, timestamptz) from public;
revoke all on function public.get_order_schedule_context(text, timestamptz) from anon;
grant execute on function public.get_order_schedule_context(text, timestamptz) to authenticated;

revoke all on function public.get_visible_custom_options(text, text, date, text) from public;
revoke all on function public.get_visible_custom_options(text, text, date, text) from anon;
grant execute on function public.get_visible_custom_options(text, text, date, text) to authenticated;

revoke all on function public.get_company_admin_catalog() from public;
revoke all on function public.get_company_admin_catalog() from anon;
grant execute on function public.get_company_admin_catalog() to authenticated;

revoke all on function public.validate_company_admin_payload(jsonb, boolean) from public;
revoke all on function public.validate_company_admin_payload(jsonb, boolean) from anon;
grant execute on function public.validate_company_admin_payload(jsonb, boolean) to authenticated;

revoke all on function public.save_company_admin_config(jsonb, boolean) from public;
revoke all on function public.save_company_admin_config(jsonb, boolean) from anon;
grant execute on function public.save_company_admin_config(jsonb, boolean) to authenticated;

revoke all on function public.duplicate_company_admin_config(text, text, text) from public;
revoke all on function public.duplicate_company_admin_config(text, text, text) from anon;
grant execute on function public.duplicate_company_admin_config(text, text, text) to authenticated;

revoke all on function public.get_public_company_catalog() from public;
revoke all on function public.get_public_company_catalog() from anon;
grant execute on function public.get_public_company_catalog() to authenticated;

commit;
