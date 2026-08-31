-- EPSE organizations, locations, authorized contacts and delivery snapshots.
-- Keeps public.orders.location as the historical requesting location.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (lower(email));
create index if not exists users_role_idx on public.users (role);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  );
$$;

create table if not exists public.user_features (
  user_id uuid not null references public.users(id) on delete cascade,
  feature text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

drop trigger if exists trg_user_features_updated_at on public.user_features;
create trigger trg_user_features_updated_at
before update on public.user_features
for each row execute function public.set_updated_at();

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  location text,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  comments text,
  delivery_date date,
  status text not null default 'pending' check (status in ('pending','archived','cancelled')),
  total_items integer not null default 0,
  custom_responses jsonb not null default '[]'::jsonb,
  idempotency_key text,
  service text not null default 'lunch',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_delivery_date_idx on public.orders (delivery_date);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create table if not exists public.order_organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.order_organizations(id) on delete cascade,
  code text not null unique,
  slug text not null unique,
  display_name text not null,
  active boolean not null default true,
  default_delivery_location_id uuid references public.order_locations(id),
  usual_weekday_quantity integer,
  usual_weekend_quantity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_locations_usual_weekday_nonnegative check (usual_weekday_quantity is null or usual_weekday_quantity >= 0),
  constraint order_locations_usual_weekend_nonnegative check (usual_weekend_quantity is null or usual_weekend_quantity >= 0)
);

create table if not exists public.authorized_order_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  phone text,
  organization_id uuid not null references public.order_organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'linked', 'disabled')),
  linked_user_id uuid references public.users(id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authorized_order_contact_locations (
  contact_id uuid not null references public.authorized_order_contacts(id) on delete cascade,
  location_id uuid not null references public.order_locations(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (contact_id, location_id)
);

create table if not exists public.user_order_locations (
  user_id uuid not null references public.users(id) on delete cascade,
  location_id uuid not null references public.order_locations(id) on delete cascade,
  source_contact_id uuid references public.authorized_order_contacts(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create unique index if not exists authorized_order_contacts_email_org_uniq
  on public.authorized_order_contacts (lower(trim(email)), organization_id);

create index if not exists order_locations_org_idx on public.order_locations (organization_id);
create index if not exists order_locations_display_name_idx on public.order_locations (display_name);
create index if not exists authorized_order_contacts_linked_user_idx on public.authorized_order_contacts (linked_user_id);
create index if not exists user_order_locations_user_active_idx on public.user_order_locations (user_id, active);

alter table public.orders
  add column if not exists organization text,
  add column if not exists requesting_location_code text,
  add column if not exists delivery_location text,
  add column if not exists delivery_location_code text,
  add column if not exists order_location_id uuid references public.order_locations(id),
  add column if not exists delivery_order_location_id uuid references public.order_locations(id);

create index if not exists orders_order_location_id_idx on public.orders (order_location_id);
create index if not exists orders_delivery_order_location_id_idx on public.orders (delivery_order_location_id);
create index if not exists orders_delivery_location_idx on public.orders (delivery_location);
create index if not exists orders_organization_idx on public.orders (organization);

drop trigger if exists trg_order_organizations_updated_at on public.order_organizations;
create trigger trg_order_organizations_updated_at
before update on public.order_organizations
for each row execute function public.set_updated_at();

drop trigger if exists trg_order_locations_updated_at on public.order_locations;
create trigger trg_order_locations_updated_at
before update on public.order_locations
for each row execute function public.set_updated_at();

drop trigger if exists trg_authorized_order_contacts_updated_at on public.authorized_order_contacts;
create trigger trg_authorized_order_contacts_updated_at
before update on public.authorized_order_contacts
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_order_locations_updated_at on public.user_order_locations;
create trigger trg_user_order_locations_updated_at
before update on public.user_order_locations
for each row execute function public.set_updated_at();

create or replace function public.normalize_contact_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_email, '')));
$$;

insert into public.order_organizations (code, name, active)
values ('EPSE', 'EPSE', true)
on conflict (code) do update
set name = excluded.name,
    active = true,
    updated_at = now();

with epse as (
  select id from public.order_organizations where code = 'EPSE'
), location_seed(code, slug, display_name, weekday_qty, weekend_qty) as (
  values
    ('EPSE_QUEBRADA_ULLUM', 'epse_quebrada_ullum', 'EPSE – Quebrada de Ullum', 14, 2),
    ('EPSE_ANCHIPURAC', 'epse_anchipurac', 'EPSE – Anchipurac', 3, 0),
    ('EPSE_PLANTA_FOTOVOLTAICA', 'epse_planta_fotovoltaica', 'EPSE – Planta Fotovoltaica', 6, 0),
    ('EPSE_ESTACION_TRANSFORMADORA', 'epse_estacion_transformadora', 'EPSE – Estación Transformadora', 5, 0),
    ('EPSE_PUNTA_NEGRA', 'epse_punta_negra', 'EPSE – Punta Negra', 22, 2),
    ('EPSE_LOS_CARACOLES', 'epse_los_caracoles', 'EPSE – Los Caracoles', null::integer, 4),
    ('EPSE_OBRA_LINEA_ALTA_TENSION', 'epse_obra_linea_alta_tension', 'EPSE – Obra Línea de Alta Tensión', null::integer, null::integer)
)
insert into public.order_locations (
  organization_id,
  code,
  slug,
  display_name,
  active,
  usual_weekday_quantity,
  usual_weekend_quantity
)
select epse.id, s.code, s.slug, s.display_name, true, s.weekday_qty, s.weekend_qty
from location_seed s
cross join epse
on conflict (code) do update
set organization_id = excluded.organization_id,
    slug = excluded.slug,
    display_name = excluded.display_name,
    active = true,
    usual_weekday_quantity = excluded.usual_weekday_quantity,
    usual_weekend_quantity = excluded.usual_weekend_quantity,
    updated_at = now();

update public.order_locations loc
set default_delivery_location_id = delivery.id,
    updated_at = now()
from public.order_locations delivery
where loc.code in ('EPSE_ESTACION_TRANSFORMADORA', 'EPSE_OBRA_LINEA_ALTA_TENSION')
  and delivery.code = 'EPSE_PLANTA_FOTOVOLTAICA';

update public.order_locations loc
set default_delivery_location_id = loc.id,
    updated_at = now()
where loc.code in (
  'EPSE_QUEBRADA_ULLUM',
  'EPSE_ANCHIPURAC',
  'EPSE_PLANTA_FOTOVOLTAICA',
  'EPSE_PUNTA_NEGRA',
  'EPSE_LOS_CARACOLES'
);

with epse as (
  select id from public.order_organizations where code = 'EPSE'
), contact_seed(email, full_name, phone) as (
  values
    ('jandrada@epse.com.ar', 'José Andrada', '2644640890'),
    ('fnavas@epse.com.ar', 'Francisco Navas', '2644122062'),
    ('mstrada@epse.com.ar', 'Mauro Strada', '2644469353'),
    ('rfernandez@epse.com.ar', 'Roberto Fernández', '2645310344'),
    ('ghidalgo@epse.com.ar', 'Gustavo Hidalgo', '2645067229'),
    ('smachado@epse.com.ar', 'Sergio Leonardo Machado Guirado', '2644586753'),
    ('fzovak@epse.com.ar', 'Fabián Zovak', '2645238881'),
    ('lperrotat@epse.com.ar', 'Luis Alberto Perrotat Domínguez', '2645281732'),
    ('aibazeta@epse.com.ar', 'Alfredo Ibazeta', '2645430364')
)
insert into public.authorized_order_contacts (
  email,
  full_name,
  phone,
  organization_id,
  status
)
select public.normalize_contact_email(s.email), s.full_name, s.phone, epse.id, 'pending'
from contact_seed s
cross join epse
on conflict (lower(trim(email)), organization_id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    status = case
      when public.authorized_order_contacts.status = 'disabled' then public.authorized_order_contacts.status
      else public.authorized_order_contacts.status
    end,
    updated_at = now();

with assignments(email, code) as (
  values
    ('jandrada@epse.com.ar', 'EPSE_QUEBRADA_ULLUM'),
    ('fnavas@epse.com.ar', 'EPSE_QUEBRADA_ULLUM'),
    ('mstrada@epse.com.ar', 'EPSE_ANCHIPURAC'),
    ('rfernandez@epse.com.ar', 'EPSE_ANCHIPURAC'),
    ('rfernandez@epse.com.ar', 'EPSE_PLANTA_FOTOVOLTAICA'),
    ('rfernandez@epse.com.ar', 'EPSE_ESTACION_TRANSFORMADORA'),
    ('ghidalgo@epse.com.ar', 'EPSE_PLANTA_FOTOVOLTAICA'),
    ('ghidalgo@epse.com.ar', 'EPSE_ESTACION_TRANSFORMADORA'),
    ('smachado@epse.com.ar', 'EPSE_PUNTA_NEGRA'),
    ('smachado@epse.com.ar', 'EPSE_LOS_CARACOLES'),
    ('fzovak@epse.com.ar', 'EPSE_PUNTA_NEGRA'),
    ('fzovak@epse.com.ar', 'EPSE_LOS_CARACOLES'),
    ('lperrotat@epse.com.ar', 'EPSE_PUNTA_NEGRA'),
    ('lperrotat@epse.com.ar', 'EPSE_LOS_CARACOLES'),
    ('aibazeta@epse.com.ar', 'EPSE_OBRA_LINEA_ALTA_TENSION')
)
insert into public.authorized_order_contact_locations (contact_id, location_id, active)
select c.id, l.id, true
from assignments a
join public.authorized_order_contacts c on public.normalize_contact_email(c.email) = public.normalize_contact_email(a.email)
join public.order_locations l on l.code = a.code
on conflict (contact_id, location_id) do update
set active = true,
    created_at = public.authorized_order_contact_locations.created_at;

create or replace function public.sync_authorized_order_locations_for_user(p_user_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_linked integer := 0;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;

  if v_actor is not null and v_actor <> p_user_id and not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select public.normalize_contact_email(u.email)
  into v_email
  from public.users u
  where u.id = p_user_id;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  insert into public.user_order_locations (user_id, location_id, source_contact_id, active, created_at, updated_at)
  select p_user_id, acl.location_id, c.id, true, now(), now()
  from public.authorized_order_contacts c
  join public.authorized_order_contact_locations acl on acl.contact_id = c.id and acl.active = true
  where public.normalize_contact_email(c.email) = v_email
    and c.status <> 'disabled'
  on conflict (user_id, location_id) do update
  set source_contact_id = excluded.source_contact_id,
      active = true,
      updated_at = now();

  get diagnostics v_linked = row_count;

  update public.authorized_order_contacts c
  set linked_user_id = p_user_id,
      linked_at = coalesce(c.linked_at, now()),
      status = case when c.status = 'disabled' then c.status else 'linked' end,
      updated_at = now()
  where public.normalize_contact_email(c.email) = v_email
    and c.status <> 'disabled';

  return v_linked;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, full_name, role, created_at, updated_at)
  values (
    new.id,
    public.normalize_contact_email(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email),
    'user',
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name),
        updated_at = now();

  perform public.sync_authorized_order_locations_for_user(new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_authorized_order_locations_after_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_authorized_order_locations_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_authorized_order_locations_after_profile_change on public.users;
create trigger trg_sync_authorized_order_locations_after_profile_change
after insert or update of email on public.users
for each row execute function public.sync_authorized_order_locations_after_profile_change();

select public.sync_authorized_order_locations_for_user(u.id)
from public.users u
where exists (
  select 1
  from public.authorized_order_contacts c
  where public.normalize_contact_email(c.email) = public.normalize_contact_email(u.email)
);

create or replace function public.get_user_order_locations(p_company_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company_slug text := lower(trim(coalesce(p_company_slug, '')));
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform public.sync_authorized_order_locations_for_user(v_uid);

  if v_company_slug <> 'epse' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', loc.code,
      'slug', loc.slug,
      'name', loc.display_name,
      'organization', org.name,
      'delivery_code', delivery.code,
      'delivery_name', delivery.display_name,
      'usual_weekday_quantity', loc.usual_weekday_quantity,
      'usual_weekend_quantity', loc.usual_weekend_quantity
    )
    order by loc.display_name
  ), '[]'::jsonb)
  into v_result
  from public.user_order_locations uol
  join public.order_locations loc on loc.id = uol.location_id and loc.active = true
  join public.order_organizations org on org.id = loc.organization_id and org.active = true
  left join public.order_locations delivery on delivery.id = coalesce(loc.default_delivery_location_id, loc.id)
  where uol.user_id = v_uid
    and uol.active = true
    and org.code = 'EPSE';

  if public.is_admin() then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'code', loc.code,
        'slug', loc.slug,
        'name', loc.display_name,
        'organization', org.name,
        'delivery_code', delivery.code,
        'delivery_name', delivery.display_name,
        'usual_weekday_quantity', loc.usual_weekday_quantity,
        'usual_weekend_quantity', loc.usual_weekend_quantity
      )
      order by loc.display_name
    ), '[]'::jsonb)
    into v_result
    from public.order_locations loc
    join public.order_organizations org on org.id = loc.organization_id and org.active = true
    left join public.order_locations delivery on delivery.id = coalesce(loc.default_delivery_location_id, loc.id)
    where loc.active = true
      and org.code = 'EPSE';
  end if;

  return v_result;
end;
$$;

create or replace function public.create_order_idempotent(
  p_user_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_items jsonb;
  v_delivery_date date;
  v_service text;
  v_constraint text;
  v_ba_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_ba_hour integer := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::integer;
  v_requested_location text;
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if p_user_id <> v_uid and not public.is_admin() then
    raise exception 'user_id_not_allowed';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key_required';
  end if;

  select *
  into v_order
  from public.orders
  where idempotency_key = p_idempotency_key;

  if v_order.id is not null then
    if v_order.user_id <> p_user_id then
      raise exception 'idempotency_key_conflict';
    end if;

    return v_order;
  end if;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  v_delivery_date := coalesce((p_payload->>'delivery_date')::date, v_ba_now::date);
  v_service := coalesce(nullif(lower(p_payload->>'service'), ''), 'lunch');
  v_requested_location := nullif(trim(coalesce(p_payload->>'location', '')), '');

  if v_requested_location is null then
    raise exception 'location_required';
  end if;

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items_required';
  end if;

  if v_delivery_date < v_ba_now::date then
    raise exception 'invalid_delivery_date';
  end if;

  if v_ba_hour < 9 or v_ba_hour >= 22 then
    raise exception 'order_window_closed';
  end if;

  if v_service = 'dinner' and not public.is_admin() and not exists (
    select 1
    from public.user_features uf
    where uf.user_id = p_user_id
      and uf.feature = 'dinner'
      and uf.enabled = true
  ) then
    raise exception 'dinner_not_enabled';
  end if;

  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(v_requested_location)
      or lower(loc.code) = lower(v_requested_location)
      or lower(loc.slug) = lower(v_requested_location)
    )
  limit 1;

  if v_location.id is not null then
    if not public.is_admin() and not exists (
      select 1
      from public.user_order_locations uol
      where uol.user_id = p_user_id
        and uol.location_id = v_location.id
        and uol.active = true
    ) then
      perform public.sync_authorized_order_locations_for_user(p_user_id);
      if not exists (
        select 1
        from public.user_order_locations uol
        where uol.user_id = p_user_id
          and uol.location_id = v_location.id
          and uol.active = true
      ) then
        raise exception 'location_not_allowed';
      end if;
    end if;

    select *
    into v_delivery_location
    from public.order_locations
    where id = coalesce(v_location.default_delivery_location_id, v_location.id);

    select *
    into v_organization
    from public.order_organizations
    where id = v_location.organization_id;
  end if;

  if exists (
    select 1
    from public.orders
    where user_id = p_user_id
      and delivery_date = v_delivery_date
      and coalesce(nullif(lower(service), ''), 'lunch') = v_service
      and status = 'pending'
  ) then
    raise exception 'duplicate_active_order';
  end if;

  insert into public.orders (
    user_id,
    idempotency_key,
    location,
    organization,
    requesting_location_code,
    order_location_id,
    delivery_location,
    delivery_location_code,
    delivery_order_location_id,
    service,
    items,
    status,
    total_items,
    custom_responses,
    customer_name,
    customer_email,
    customer_phone,
    comments,
    delivery_date
  )
  values (
    p_user_id,
    p_idempotency_key,
    coalesce(v_location.display_name, v_requested_location),
    v_organization.name,
    v_location.code,
    v_location.id,
    coalesce(v_delivery_location.display_name, v_requested_location),
    v_delivery_location.code,
    v_delivery_location.id,
    v_service,
    v_items,
    'pending',
    coalesce((p_payload->>'total_items')::integer, jsonb_array_length(v_items), 0),
    coalesce(p_payload->'custom_responses', '[]'::jsonb),
    coalesce(p_payload->>'customer_name', null),
    coalesce(p_payload->>'customer_email', null),
    coalesce(p_payload->>'customer_phone', null),
    coalesce(p_payload->>'comments', null),
    v_delivery_date
  )
  returning *
  into v_order;

  return v_order;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'orders_active_user_delivery_service_uniq' then
      raise exception 'duplicate_active_order';
    end if;
    raise;
end;
$$;

create or replace function public.resolve_order_delivery_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
begin
  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(trim(coalesce(new.location, '')))
      or lower(loc.code) = lower(trim(coalesce(new.location, '')))
      or lower(loc.slug) = lower(trim(coalesce(new.location, '')))
    )
  limit 1;

  if v_location.id is null then
    if tg_op = 'UPDATE' and old.order_location_id is not null and not public.is_admin() then
      raise exception 'location_not_allowed';
    end if;

    new.organization = null;
    new.requesting_location_code = null;
    new.order_location_id = null;
    new.delivery_location = coalesce(nullif(trim(new.delivery_location), ''), new.location);
    new.delivery_location_code = null;
    new.delivery_order_location_id = null;
    return new;
  end if;

  if not public.is_admin() then
    perform public.sync_authorized_order_locations_for_user(new.user_id);
  end if;

  if not public.is_admin() and not exists (
    select 1
    from public.user_order_locations uol
    where uol.user_id = new.user_id
      and uol.location_id = v_location.id
      and uol.active = true
  ) then
    raise exception 'location_not_allowed';
  end if;

  select *
  into v_delivery_location
  from public.order_locations
  where id = coalesce(v_location.default_delivery_location_id, v_location.id);

  select *
  into v_organization
  from public.order_organizations
  where id = v_location.organization_id;

  new.location = v_location.display_name;
  new.organization = v_organization.name;
  new.requesting_location_code = v_location.code;
  new.order_location_id = v_location.id;
  new.delivery_location = coalesce(v_delivery_location.display_name, v_location.display_name);
  new.delivery_location_code = coalesce(v_delivery_location.code, v_location.code);
  new.delivery_order_location_id = coalesce(v_delivery_location.id, v_location.id);
  return new;
end;
$$;

drop trigger if exists trg_resolve_order_delivery_snapshot on public.orders;
create trigger trg_resolve_order_delivery_snapshot
before insert or update of location, user_id on public.orders
for each row execute function public.resolve_order_delivery_snapshot();

update public.orders o
set delivery_location = coalesce(o.delivery_location, o.location)
where o.delivery_location is null
  and o.location is not null;

grant select on public.order_organizations, public.order_locations, public.user_order_locations to authenticated;
grant select on public.authorized_order_contacts, public.authorized_order_contact_locations to authenticated;
grant insert, update, delete on public.user_order_locations to authenticated;
grant insert, update, delete on public.authorized_order_contacts, public.authorized_order_contact_locations to authenticated;
grant select on public.users, public.orders, public.user_features to authenticated;
grant insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.user_features to authenticated;
grant update (full_name) on public.users to authenticated;

revoke all on function public.sync_authorized_order_locations_for_user(uuid) from public;
revoke all on function public.sync_authorized_order_locations_for_user(uuid) from anon;
grant execute on function public.sync_authorized_order_locations_for_user(uuid) to authenticated;

revoke all on function public.get_user_order_locations(text) from public;
revoke all on function public.get_user_order_locations(text) from anon;
grant execute on function public.get_user_order_locations(text) to authenticated;

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.users enable row level security;
alter table public.orders enable row level security;
alter table public.user_features enable row level security;
alter table public.order_organizations enable row level security;
alter table public.order_locations enable row level security;
alter table public.authorized_order_contacts enable row level security;
alter table public.authorized_order_contact_locations enable row level security;
alter table public.user_order_locations enable row level security;

drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin on public.users
for select to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists users_update_self_profile on public.users;
create policy users_update_self_profile on public.users
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists orders_select_owner_or_admin on public.orders;
create policy orders_select_owner_or_admin on public.orders
for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists orders_insert_owner_or_admin on public.orders;
create policy orders_insert_owner_or_admin on public.orders
for insert to authenticated
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists orders_update_admin_all on public.orders;
create policy orders_update_admin_all on public.orders
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists orders_update_owner_pending_edit_window on public.orders;
create policy orders_update_owner_pending_edit_window on public.orders
for update to authenticated
using (
  auth.uid() = user_id
  and status = 'pending'
  and created_at >= now() - interval '15 minutes'
)
with check (
  auth.uid() = user_id
  and status = 'pending'
  and created_at >= now() - interval '15 minutes'
);

drop policy if exists user_features_select_self_or_admin on public.user_features;
create policy user_features_select_self_or_admin on public.user_features
for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists order_organizations_select_auth on public.order_organizations;
create policy order_organizations_select_auth on public.order_organizations
for select to authenticated
using (active = true or public.is_admin());

drop policy if exists order_locations_select_auth on public.order_locations;
create policy order_locations_select_auth on public.order_locations
for select to authenticated
using (active = true or public.is_admin());

drop policy if exists user_order_locations_select_self_or_admin on public.user_order_locations;
create policy user_order_locations_select_self_or_admin on public.user_order_locations
for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists user_order_locations_admin_write on public.user_order_locations;
create policy user_order_locations_admin_write on public.user_order_locations
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists authorized_order_contacts_admin_select on public.authorized_order_contacts;
create policy authorized_order_contacts_admin_select on public.authorized_order_contacts
for select to authenticated
using (public.is_admin());

drop policy if exists authorized_order_contacts_admin_write on public.authorized_order_contacts;
create policy authorized_order_contacts_admin_write on public.authorized_order_contacts
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists authorized_order_contact_locations_admin_select on public.authorized_order_contact_locations;
create policy authorized_order_contact_locations_admin_select on public.authorized_order_contact_locations
for select to authenticated
using (public.is_admin());

drop policy if exists authorized_order_contact_locations_admin_write on public.authorized_order_contact_locations;
create policy authorized_order_contact_locations_admin_write on public.authorized_order_contact_locations
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
