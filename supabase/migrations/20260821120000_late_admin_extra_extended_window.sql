-- Allow selected administrative accounts to create late/admin extra orders
-- in the extended 22:00-18:00 window. The RPC still enforces
-- company/location/date scope through create_admin_extra_order and keeps
-- post_report_extra classification.

begin;

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

update public.admin_late_extra_order_authorized_accounts
set active = false,
    updated_at = now()
where lower(trim(coalesce(email, ''))) not in (
  'servifoodrecepcion@gmail.com',
  'sarmientoclaudia985@gmail.com',
  'agustinwojtyszyn99@gmail.com'
);

insert into public.admin_late_extra_order_authorized_accounts (email, note)
values
  ('servifoodrecepcion@gmail.com', 'Cuenta autorizada para carga administrativa fuera de termino hasta las 18:00'),
  ('sarmientoclaudia985@gmail.com', 'Cuenta autorizada para carga administrativa fuera de termino hasta las 18:00'),
  ('agustinwojtyszyn99@gmail.com', 'Cuenta autorizada para carga administrativa fuera de termino hasta las 18:00')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

create or replace function public.is_late_admin_extra_order_authorized(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select u.id, lower(trim(coalesce(u.email, ''))) as email
    from public.users u
    where u.id = p_user_id
  )
  select exists (
    select 1
    from public.admin_late_extra_order_authorized_accounts cfg
    join actor a on (
      cfg.user_id = a.id
      or lower(trim(coalesce(cfg.email, ''))) = a.email
    )
    where cfg.active = true
  );
$$;

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
  v_local_date date := (current_timestamp at time zone 'America/Argentina/San_Juan')::date;
  v_operational_date date;
  v_requested_date_text text := nullif(trim(coalesce(p_payload->>'delivery_date', '')), '');
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

  v_is_authorized := public.is_late_admin_extra_order_authorized(v_admin_id);

  if not coalesce(v_is_authorized, false) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if v_local_time >= time '22:00:00' then
    v_operational_date := v_local_now::date + 1;
  elsif v_local_time < time '18:00:00' then
    v_operational_date := v_local_now::date;
  else
    raise exception 'late_admin_extra_window_closed';
  end if;

  if v_requested_date_text is not null then
    if v_requested_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_delivery_date';
    end if;
    if v_requested_date_text::date <> v_operational_date then
      raise exception 'invalid_delivery_date';
    end if;
  end if;

  if v_operational_date < v_local_date then
    raise exception 'invalid_delivery_date';
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
      'origin', 'admin_extra',
      'extended_window', '22:00-18:00',
      'status', v_order.status
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

create or replace function public.get_admin_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_global boolean := false;
  v_companies jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_is_global := public.is_admin();

  if not v_is_global then
    select coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and c.slug <> 'global';
  end if;

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'can_create_late_admin_extra_order', public.is_late_admin_extra_order_authorized(auth.uid()),
    'companies', v_companies
  );
end;
$$;

create or replace function public.delete_admin_extra_order(
  p_order_id uuid,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_order public.orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_allowed boolean := false;
  v_is_late_extra boolean := false;
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_order_id is null then
    raise exception 'order_required';
  end if;

  if v_reason is null then
    raise exception 'reason_required';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_request_id is not null and exists (
    select 1
    from public.audit_logs a
    where a.request_id = v_request_id
      and a.action = 'admin_extra_order_deleted'
  ) then
    return jsonb_build_object(
      'deleted', false,
      'idempotent', true,
      'order_id', p_order_id
    );
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if lower(coalesce(v_order.order_origin, 'user')) <> 'admin_extra' then
    raise exception 'not_admin_extra_order';
  end if;

  select exists (
    select 1
    from public.audit_logs a
    where a.action = 'late_admin_extra_order_created'
      and (
        a.target_id = v_order.user_id
        or a.metadata->>'order_id' = v_order.id::text
      )
      and a.metadata->>'order_id' = v_order.id::text
  )
  into v_is_late_extra;

  if v_is_late_extra and not public.is_late_admin_extra_order_authorized(v_admin_id) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if public.is_admin() then
    v_allowed := true;
  else
    select exists (
      select 1
      from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      where ca.user_id = v_admin_id
        and (
          c.slug = v_order.company_slug
          or public.admin_extra_company_location_allowed(c.slug, coalesce(v_order.location, v_order.delivery_location, ''))
        )
    )
    into v_allowed;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'not_authorized';
  end if;

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
    'admin_extra_order_deleted',
    'Pedido extra eliminado por administrador',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'reason', v_reason,
      'order_id', v_order.id,
      'company_slug', v_order.company_slug,
      'company_name', v_order.company_name,
      'location', v_order.location,
      'delivery_location', v_order.delivery_location,
      'delivery_date', v_order.delivery_date,
      'service', v_order.service,
      'origin', v_order.order_origin,
      'late_admin_extra', v_is_late_extra,
      'snapshot', to_jsonb(v_order)
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  delete from public.orders
  where id = v_order.id
    and lower(coalesce(order_origin, 'user')) = 'admin_extra';

  return jsonb_build_object(
    'deleted', true,
    'idempotent', false,
    'order_id', v_order.id,
    'late_admin_extra', v_is_late_extra
  );
end;
$$;

revoke all on function public.is_late_admin_extra_order_authorized(uuid) from public;
revoke all on function public.is_late_admin_extra_order_authorized(uuid) from anon;
grant execute on function public.is_late_admin_extra_order_authorized(uuid) to authenticated;

revoke all on function public.create_late_admin_extra_order(jsonb) from public;
revoke all on function public.create_late_admin_extra_order(jsonb) from anon;
grant execute on function public.create_late_admin_extra_order(jsonb) to authenticated;

revoke all on function public.delete_admin_extra_order(uuid, text, text) from public;
revoke all on function public.delete_admin_extra_order(uuid, text, text) from anon;
grant execute on function public.delete_admin_extra_order(uuid, text, text) to authenticated;

revoke all on function public.get_admin_access_context() from public;
revoke all on function public.get_admin_access_context() from anon;
grant execute on function public.get_admin_access_context() to authenticated;

notify pgrst, 'reload schema';

commit;
