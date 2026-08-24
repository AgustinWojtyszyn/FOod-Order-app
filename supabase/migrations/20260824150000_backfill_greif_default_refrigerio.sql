begin;

with greif_orders_missing_refrigerio as (
  select
    o.id,
    greatest(
      coalesce(nullif(o.total_items, 0), 0),
      coalesce((
        select sum(greatest(coalesce(
          case when coalesce(item->>'quantity', '') ~ '^[0-9]+$' then (item->>'quantity')::integer end,
          case when coalesce(item->>'qty', '') ~ '^[0-9]+$' then (item->>'qty')::integer end,
          1
        ), 1))
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(o.items, '[]'::jsonb)) = 'array' then coalesce(o.items, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) as item
      ), 0),
      1
    ) as refrigerio_quantity,
    case
      when jsonb_typeof(coalesce(o.custom_responses, '[]'::jsonb)) = 'array'
        then coalesce(o.custom_responses, '[]'::jsonb)
      else '[]'::jsonb
    end as existing_custom_responses
  from public.orders as o
  where lower(trim(coalesce(nullif(o.company_slug, ''), o.location, ''))) = 'greif'
    and lower(coalesce(o.status, '')) <> 'cancelled'
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(o.custom_responses, '[]'::jsonb)) = 'array'
            then coalesce(o.custom_responses, '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as response
      where response->>'id' = 'greif-default-refrigerio'
        or (
          response->>'source' = 'greif-default-refrigerio'
          and coalesce((response->>'auto_applied')::boolean, false)
        )
    )
)
update public.orders as o
set custom_responses = g.existing_custom_responses || jsonb_build_array(
      jsonb_build_object(
        'id', 'greif-default-refrigerio',
        'title', 'Refrigerio',
        'response', 'Refrigerio',
        'quantity', g.refrigerio_quantity,
        'quantities', jsonb_build_object('Refrigerio', g.refrigerio_quantity),
        'auto_applied', true,
        'source', 'greif-default-refrigerio',
        'retroactive', true
      )
    ),
    updated_at = now()
from greif_orders_missing_refrigerio as g
where o.id = g.id;

commit;
