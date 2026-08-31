-- Local bootstrap schema for development/testing.
-- This migration exists because the repository only contains incremental migrations.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Core profile table synchronized with auth.users
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- Orders
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
  status text not null default 'pending' check (status in ('pending','archived')),
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

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  menu_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_items_menu_date_idx on public.menu_items (menu_date);

create table if not exists public.dinner_menu_by_date (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  company text null,
  title text not null,
  options text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_date, company)
);

create index if not exists dinner_menu_by_date_delivery_idx
  on public.dinner_menu_by_date (delivery_date);

create index if not exists dinner_menu_by_date_company_idx
  on public.dinner_menu_by_date (company);

create table if not exists public.user_features (
  user_id uuid not null references public.users(id) on delete cascade,
  feature text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text,
  actor_id uuid,
  actor_email text,
  actor_name text,
  target_id uuid,
  target_email text,
  target_name text,
  metadata jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create unique index if not exists audit_logs_request_action_uniq on public.audit_logs (request_id, action) where request_id is not null;

create table if not exists public.custom_options (
  id uuid primary key default gen_random_uuid(),
  name text,
  label text,
  type text,
  meal text,
  company text,
  enabled boolean not null default true,
  required boolean not null default false,
  order_position integer not null default 0,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_option_overrides (
  option_id uuid not null references public.custom_options(id) on delete cascade,
  date date not null,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (option_id, date)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  filename text,
  results jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cafeteria_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total_items integer not null default 0,
  status text not null default 'pending',
  company_slug text,
  company_name text,
  admin_name text,
  admin_email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_metrics (
  id bigint generated always as identity primary key,
  op text not null,
  ok boolean not null,
  duration_ms integer,
  screen text,
  error_code text,
  meta jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- Shared updated_at triggers
drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_dinner_menu_by_date_updated_at on public.dinner_menu_by_date;
create trigger trg_dinner_menu_by_date_updated_at
before update on public.dinner_menu_by_date
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_features_updated_at on public.user_features;
create trigger trg_user_features_updated_at
before update on public.user_features
for each row execute function public.set_updated_at();

drop trigger if exists trg_custom_options_updated_at on public.custom_options;
create trigger trg_custom_options_updated_at
before update on public.custom_options
for each row execute function public.set_updated_at();

drop trigger if exists trg_custom_option_overrides_updated_at on public.custom_option_overrides;
create trigger trg_custom_option_overrides_updated_at
before update on public.custom_option_overrides
for each row execute function public.set_updated_at();

drop trigger if exists trg_cafeteria_orders_updated_at on public.cafeteria_orders;
create trigger trg_cafeteria_orders_updated_at
before update on public.cafeteria_orders
for each row execute function public.set_updated_at();

-- Helper views expected by services
create or replace view public.orders_with_person_key as
select
  o.*,
  coalesce(u.email, o.customer_email, 'unknown') as person_key,
  u.email as user_email,
  u.full_name as user_full_name,
  u.role as user_role
from public.orders o
left join public.users u on u.id = o.user_id;

create or replace view public.orders_count_by_person as
select
  coalesce(u.email, o.customer_email, 'unknown') as person_key,
  count(*)::bigint as total_orders,
  min(o.created_at) as first_created,
  max(o.created_at) as last_created
from public.orders o
left join public.users u on u.id = o.user_id
group by coalesce(u.email, o.customer_email, 'unknown');

create or replace view public.admin_people_unified as
select
  u.id::text as person_id,
  null::text as group_id,
  coalesce(nullif(u.full_name, ''), u.email) as display_name,
  array[u.email]::text[] as emails,
  array[u.id]::uuid[] as user_ids,
  1::bigint as members_count,
  u.created_at as first_created,
  u.created_at as last_created,
  false as is_grouped
from public.users u;

-- RPCs used by app
create or replace function public.enable_feature(p_user uuid, p_feature text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_features (user_id, feature, enabled)
  values (p_user, p_feature, p_enabled)
  on conflict (user_id, feature)
  do update set enabled = excluded.enabled, updated_at = now();
end;
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
set search_path = public
as $$
  select co.*
  from public.custom_options co
  left join public.custom_option_overrides ovr
    on ovr.option_id = co.id
   and ovr.date = p_date
  where co.enabled = true
    and (co.meal is null or co.meal = p_meal)
    and (co.company is null or co.company = p_company)
    and coalesce(ovr.enabled, true) = true
  order by co.order_position asc, co.created_at asc;
$$;

create or replace function public.log_metric(
  p_op text,
  p_ok boolean,
  p_duration_ms integer,
  p_screen text,
  p_error_code text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_metrics (op, ok, duration_ms, screen, error_code, meta, user_id)
  values (p_op, p_ok, p_duration_ms, p_screen, p_error_code, p_meta, auth.uid());
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

  v_items := coalesce(p_payload->'items', '[]'::jsonb);

  insert into public.orders (
    user_id,
    idempotency_key,
    location,
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
    coalesce(p_payload->>'location', null),
    coalesce(p_payload->>'service', 'lunch'),
    v_items,
    'pending',
    coalesce((p_payload->>'total_items')::integer, jsonb_array_length(v_items), 0),
    coalesce(p_payload->'custom_responses', '[]'::jsonb),
    coalesce(p_payload->>'customer_name', null),
    coalesce(p_payload->>'customer_email', null),
    coalesce(p_payload->>'customer_phone', null),
    coalesce(p_payload->>'comments', null),
    coalesce((p_payload->>'delivery_date')::date, current_date)
  )
  on conflict (idempotency_key)
  do update set
    idempotency_key = public.orders.idempotency_key
  where public.orders.user_id = p_user_id
  returning *
  into v_order;

  if v_order.id is null then
    raise exception 'idempotency_key_conflict';
  end if;

  return v_order;
end;
$$;

-- Grants
grant usage on schema public to anon, authenticated;
grant select on public.menu_items, public.dinner_menu_by_date to anon, authenticated;
grant select on public.users, public.orders, public.user_features, public.audit_logs,
  public.custom_options, public.custom_option_overrides, public.notifications,
  public.analysis_history, public.cafeteria_orders, public.orders_with_person_key,
  public.orders_count_by_person, public.admin_people_unified, public.app_metrics
  to authenticated;
grant insert, update, delete on public.orders, public.custom_options, public.custom_option_overrides,
  public.notifications, public.cafeteria_orders to authenticated;
grant insert on public.audit_logs, public.app_metrics to authenticated;
grant update on public.users, public.user_features, public.menu_items, public.dinner_menu_by_date to authenticated;
grant delete on public.menu_items, public.dinner_menu_by_date to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.enable_feature(uuid, text, boolean) to authenticated;
grant execute on function public.get_visible_custom_options(text, text, date, text) to authenticated;
grant execute on function public.log_metric(text, boolean, integer, text, text, jsonb) to authenticated;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;

-- RLS
alter table public.users enable row level security;
alter table public.orders enable row level security;
alter table public.menu_items enable row level security;
alter table public.user_features enable row level security;
alter table public.audit_logs enable row level security;
alter table public.custom_options enable row level security;
alter table public.custom_option_overrides enable row level security;
alter table public.notifications enable row level security;
alter table public.analysis_history enable row level security;
alter table public.cafeteria_orders enable row level security;
alter table public.app_metrics enable row level security;

-- users
 drop policy if exists users_select_auth on public.users;
create policy users_select_auth on public.users
for select to authenticated
using (true);

 drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
for update to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

-- orders
 drop policy if exists orders_select_owner_or_admin on public.orders;
create policy orders_select_owner_or_admin on public.orders
for select to authenticated
using (auth.uid() = user_id or public.is_admin());

 drop policy if exists orders_insert_owner_or_admin on public.orders;
create policy orders_insert_owner_or_admin on public.orders
for insert to authenticated
with check (auth.uid() = user_id or public.is_admin());

 drop policy if exists orders_update_owner_or_admin on public.orders;
 drop policy if exists orders_update_admin_all on public.orders;
create policy orders_update_admin_all on public.orders
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

 drop policy if exists orders_update_owner_pending_within_window on public.orders;
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

create or replace function public.enforce_safe_order_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if auth.uid() <> old.user_id or new.user_id <> old.user_id then
    raise exception 'order_update_not_owner';
  end if;

  if old.status <> 'pending' then
    raise exception 'order_update_not_pending';
  end if;

  if old.created_at < now() - interval '15 minutes' then
    raise exception 'order_update_window_expired';
  end if;

  if new.status = 'pending' then
    if row(
      new.id,
      new.user_id,
      new.status,
      new.service,
      new.delivery_date,
      new.total_items,
      new.idempotency_key,
      new.created_at,
      new.archived_at
    ) is distinct from row(
      old.id,
      old.user_id,
      old.status,
      old.service,
      old.delivery_date,
      old.total_items,
      old.idempotency_key,
      old.created_at,
      old.archived_at
    ) then
      raise exception 'order_update_immutable_field';
    end if;

    return new;
  end if;

  if new.status = 'archived' then
    if row(
      new.id,
      new.user_id,
      new.location,
      new.customer_name,
      new.customer_email,
      new.customer_phone,
      new.items,
      new.comments,
      new.delivery_date,
      new.total_items,
      new.custom_responses,
      new.idempotency_key,
      new.service,
      new.archived_at,
      new.created_at
    ) is distinct from row(
      old.id,
      old.user_id,
      old.location,
      old.customer_name,
      old.customer_email,
      old.customer_phone,
      old.items,
      old.comments,
      old.delivery_date,
      old.total_items,
      old.custom_responses,
      old.idempotency_key,
      old.service,
      old.archived_at,
      old.created_at
    ) then
      raise exception 'order_cancel_only_status_allowed';
    end if;

    return new;
  end if;

  raise exception 'order_update_status_not_allowed';
end;
$$;

drop trigger if exists trg_enforce_safe_order_owner_update on public.orders;
create trigger trg_enforce_safe_order_owner_update
before update on public.orders
for each row
execute function public.enforce_safe_order_owner_update();

create or replace function public.cancel_own_pending_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_order
  from public.orders
  where id = order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.user_id <> v_uid then
    raise exception 'order_not_owner';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'order_not_pending';
  end if;

  if v_order.created_at < now() - interval '15 minutes' then
    raise exception 'order_cancel_window_expired';
  end if;

  update public.orders
  set status = 'archived',
      updated_at = now()
  where id = order_id
  returning *
  into v_order;

  return v_order;
end;
$$;

revoke all on function public.cancel_own_pending_order(uuid) from public;
revoke all on function public.cancel_own_pending_order(uuid) from anon;
grant execute on function public.cancel_own_pending_order(uuid) to authenticated;

 drop policy if exists orders_delete_admin on public.orders;
create policy orders_delete_admin on public.orders
for delete to authenticated
using (public.is_admin());

-- menu and catalog
 drop policy if exists menu_items_select_all_auth on public.menu_items;
create policy menu_items_select_all_auth on public.menu_items
for select to authenticated
using (true);

 drop policy if exists menu_items_admin_write on public.menu_items;
create policy menu_items_admin_write on public.menu_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

 drop policy if exists dinner_menu_select_all_auth on public.dinner_menu_by_date;
create policy dinner_menu_select_all_auth on public.dinner_menu_by_date
for select to authenticated
using (true);

 drop policy if exists dinner_menu_admin_write on public.dinner_menu_by_date;
create policy dinner_menu_admin_write on public.dinner_menu_by_date
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- user_features
 drop policy if exists user_features_select_owner_or_admin on public.user_features;
create policy user_features_select_owner_or_admin on public.user_features
for select to authenticated
using (auth.uid() = user_id or public.is_admin());

 drop policy if exists user_features_write_admin on public.user_features;
create policy user_features_write_admin on public.user_features
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- audit logs
 drop policy if exists audit_logs_insert_auth on public.audit_logs;
create policy audit_logs_insert_auth on public.audit_logs
for insert to authenticated
with check (true);

 drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
for select to authenticated
using (public.is_admin());

-- custom options
 drop policy if exists custom_options_select_auth on public.custom_options;
create policy custom_options_select_auth on public.custom_options
for select to authenticated
using (true);

 drop policy if exists custom_options_write_admin on public.custom_options;
create policy custom_options_write_admin on public.custom_options
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

 drop policy if exists custom_option_overrides_select_auth on public.custom_option_overrides;
create policy custom_option_overrides_select_auth on public.custom_option_overrides
for select to authenticated
using (true);

 drop policy if exists custom_option_overrides_write_admin on public.custom_option_overrides;
create policy custom_option_overrides_write_admin on public.custom_option_overrides
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- notifications
 drop policy if exists notifications_owner_or_admin on public.notifications;
create policy notifications_owner_or_admin on public.notifications
for all to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

-- analysis and cafeteria
 drop policy if exists analysis_admin_only on public.analysis_history;
create policy analysis_admin_only on public.analysis_history
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

 drop policy if exists cafeteria_admin_only on public.cafeteria_orders;
create policy cafeteria_admin_only on public.cafeteria_orders
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- metrics
 drop policy if exists app_metrics_insert_auth on public.app_metrics;
create policy app_metrics_insert_auth on public.app_metrics
for insert to authenticated
with check (true);

 drop policy if exists app_metrics_select_admin on public.app_metrics;
create policy app_metrics_select_admin on public.app_metrics
for select to authenticated
using (public.is_admin());
