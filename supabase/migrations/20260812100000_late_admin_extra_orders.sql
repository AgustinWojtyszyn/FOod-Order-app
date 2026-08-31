-- Late admin extra orders.
-- Authorized account configuration is centralized here. Update this row if the
-- real Claudia account changes; the RPC validates auth.uid(), never client input.

create table if not exists public.admin_late_extra_order_authorized_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_late_extra_authorized_identity_check check (
    user_id is not null or nullif(trim(coalesce(email, '')), '') is not null
  )
);

create unique index if not exists admin_late_extra_authorized_user_id_uidx
  on public.admin_late_extra_order_authorized_accounts (user_id)
  where user_id is not null;

create unique index if not exists admin_late_extra_authorized_email_uidx
  on public.admin_late_extra_order_authorized_accounts (lower(trim(email)))
  where email is not null;

insert into public.admin_late_extra_order_authorized_accounts (email, note)
values ('sarmientoclaudia985@gmail.com', 'Cuenta autorizada para carga fuera de termino')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

create or replace function public.set_admin_late_extra_authorized_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_late_extra_authorized_set_updated_at on public.admin_late_extra_order_authorized_accounts;
create trigger admin_late_extra_authorized_set_updated_at
before update on public.admin_late_extra_order_authorized_accounts
for each row execute function public.set_admin_late_extra_authorized_updated_at();

create or replace function public.create_late_admin_extra_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_local_now timestamp := current_timestamp at time zone 'America/Argentina/San_Juan';
  v_local_time time := (current_timestamp at time zone 'America/Argentina/San_Juan')::time;
  v_operational_date date;
  v_payload jsonb;
  v_order public.orders;
  v_request_id text := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_has_authorized_config boolean := false;
  v_is_authorized boolean := false;
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

  if v_admin.id is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1
    from public.admin_late_extra_order_authorized_accounts cfg
    where cfg.active = true
  )
  into v_has_authorized_config;

  if not coalesce(v_has_authorized_config, false) then
    raise exception 'late_admin_extra_authorized_account_not_configured';
  end if;

  select exists (
    select 1
    from public.admin_late_extra_order_authorized_accounts cfg
    where cfg.active = true
      and (
        cfg.user_id = v_admin_id
        or lower(trim(coalesce(cfg.email, ''))) = lower(trim(coalesce(v_admin.email, '')))
      )
  )
  into v_is_authorized;

  if not coalesce(v_is_authorized, false) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if v_local_time >= time '22:00:00' then
    v_operational_date := v_local_now::date + 1;
  elsif v_local_time < time '09:00:00' then
    v_operational_date := v_local_now::date;
  else
    raise exception 'late_admin_extra_window_closed';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'delivery_date', v_operational_date::text,
      'late_admin_extra', true
    );

  select *
  into v_order
  from public.create_admin_extra_order(v_payload);

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    actor_email,
    actor_name,
    target_id,
    target_email,
    target_name,
    metadata,
    request_id,
    created_at
  )
  values (
    'late_admin_extra_order_created',
    'Pedido fuera de termino cargado por cuenta autorizada',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'order_id', v_order.id,
      'delivery_date', v_operational_date,
      'local_timestamp', v_local_now,
      'timezone', 'America/Argentina/San_Juan',
      'origin', 'admin_extra'
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return jsonb_build_object(
    'delivery_date', v_operational_date,
    'order', to_jsonb(v_order)
  );
end;
$$;

revoke all on table public.admin_late_extra_order_authorized_accounts from public;
revoke all on table public.admin_late_extra_order_authorized_accounts from anon;

revoke all on function public.set_admin_late_extra_authorized_updated_at() from public;
revoke all on function public.set_admin_late_extra_authorized_updated_at() from anon;

revoke all on function public.create_late_admin_extra_order(jsonb) from public;
revoke all on function public.create_late_admin_extra_order(jsonb) from anon;
grant execute on function public.create_late_admin_extra_order(jsonb) to authenticated;
