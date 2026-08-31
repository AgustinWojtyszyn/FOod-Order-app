create or replace function public.create_order_idempotent(
  p_user_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_items jsonb;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency key required';
  end if;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);

  -- Concurrency-safe upsert:
  -- on conflict, performs a no-op update so RETURNING always yields one row.
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
    comments,
    delivery_date
  )
  values (
    p_user_id,
    p_idempotency_key,
    coalesce(p_payload->>'location', null),
    coalesce(p_payload->>'service', 'lunch'),
    v_items,
    coalesce(p_payload->>'status', 'pending'),
    coalesce(jsonb_array_length(v_items), 0),
    coalesce(p_payload->'custom_responses', '[]'::jsonb),
    coalesce(p_payload->>'customer_name', null),
    coalesce(p_payload->>'customer_email', null),
    coalesce(p_payload->>'comments', null),
    coalesce((p_payload->>'delivery_date')::date, current_date)
  )
  on conflict (idempotency_key)
  do update set
    idempotency_key = public.orders.idempotency_key
  returning *
  into v_order;

  return v_order;
end;
$$;
