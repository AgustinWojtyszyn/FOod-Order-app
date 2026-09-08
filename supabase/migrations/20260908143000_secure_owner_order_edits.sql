-- Secure owner edits for pending orders.
-- Normal users keep the existing 15-minute edit window, but edits now go through
-- a SECURITY DEFINER RPC with an explicit whitelist of user-editable fields.

begin;

create or replace function public.update_own_pending_order(
  p_order_id uuid,
  p_updates jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_updates jsonb := coalesce(p_updates, '{}'::jsonb);
  v_allowed_keys constant text[] := array[
    'location',
    'customer_name',
    'customer_email',
    'customer_phone',
    'items',
    'comments',
    'custom_responses'
  ];
  v_unknown_key text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if jsonb_typeof(v_updates) <> 'object' then
    raise exception 'updates_must_be_object';
  end if;

  select key
  into v_unknown_key
  from jsonb_object_keys(v_updates) as key
  where not (key = any(v_allowed_keys))
  limit 1;

  if v_unknown_key is not null then
    raise exception 'order_update_field_not_allowed:%', v_unknown_key;
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
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
    raise exception 'order_update_window_expired';
  end if;

  update public.orders
  set
    location = case when v_updates ? 'location' then nullif(v_updates->>'location', '') else location end,
    customer_name = case when v_updates ? 'customer_name' then nullif(v_updates->>'customer_name', '') else customer_name end,
    customer_email = case when v_updates ? 'customer_email' then nullif(v_updates->>'customer_email', '') else customer_email end,
    customer_phone = case when v_updates ? 'customer_phone' then nullif(v_updates->>'customer_phone', '') else customer_phone end,
    items = case when v_updates ? 'items' then coalesce(v_updates->'items', '[]'::jsonb) else items end,
    comments = case when v_updates ? 'comments' then nullif(v_updates->>'comments', '') else comments end,
    custom_responses = case when v_updates ? 'custom_responses' then coalesce(v_updates->'custom_responses', '[]'::jsonb) else custom_responses end,
    total_items = case
      when v_updates ? 'items' then (
        select coalesce(sum(
          case
            when jsonb_typeof(item) = 'object'
              and nullif(item->>'quantity', '') ~ '^[0-9]+$'
              then greatest((item->>'quantity')::integer, 0)
            else 0
          end
        ), 0)::integer
        from jsonb_array_elements(coalesce(v_updates->'items', '[]'::jsonb)) as item
      )
      else total_items
    end,
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.update_own_pending_order(uuid, jsonb) from public;
revoke all on function public.update_own_pending_order(uuid, jsonb) from anon;
grant execute on function public.update_own_pending_order(uuid, jsonb) to authenticated;

commit;
