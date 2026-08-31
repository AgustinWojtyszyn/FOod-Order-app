-- Security hardening for the two operational order states: pending and archived.
-- Normal users cancel through a dedicated RPC; direct owner UPDATE cannot archive.

update public.orders
set status = 'archived',
    updated_at = now()
where status is null
   or status not in ('pending', 'archived');

alter table public.orders
  alter column status set not null;

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'archived'));

alter table public.orders enable row level security;

drop policy if exists orders_update_owner_or_admin on public.orders;
drop policy if exists orders_update_owner_pending_within_window on public.orders;

drop policy if exists orders_update_admin_all on public.orders;
create policy orders_update_admin_all on public.orders
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Preserve direct edit support for owners, but only while the order remains pending.
-- The trigger below restricts which columns can change for non-admin owners.
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

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;
