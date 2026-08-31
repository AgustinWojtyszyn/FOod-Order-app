-- Normalize lunch/dinner items at the persistence boundary.
-- This is intentionally non-destructive: it only changes new inserts through
-- create_order_idempotent and does not mutate historical orders.

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

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items_required';
  end if;

  if v_service in ('lunch', 'dinner') then
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(item) = 'object' then jsonb_set(item, '{quantity}', '1'::jsonb, true)
          else item
        end
        order by ord
      ),
      '[]'::jsonb
    )
    into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord = 1;
  end if;

  if jsonb_array_length(v_items) = 0 then
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
    v_service,
    v_items,
    'pending',
    jsonb_array_length(v_items),
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

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;
