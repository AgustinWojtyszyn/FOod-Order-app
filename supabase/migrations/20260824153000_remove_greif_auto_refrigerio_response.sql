-- Remove the previous automatic Greif refrigerio response.
-- Refrigerio is now an explicit Greif menu item, not an auto-applied custom response.

update public.orders as o
set custom_responses = coalesce(cleaned.custom_responses, '[]'::jsonb)
from (
  select
    o.id,
    jsonb_agg(response order by ordinality) filter (
      where not (
        response->>'id' = 'greif-default-refrigerio'
        or (
          response->>'source' = 'greif-default-refrigerio'
          and lower(coalesce(response->>'auto_applied', 'false')) = 'true'
        )
      )
    ) as custom_responses
  from public.orders as o
  cross join lateral jsonb_array_elements(coalesce(o.custom_responses, '[]'::jsonb)) with ordinality as responses(response, ordinality)
  where lower(trim(coalesce(nullif(o.company_slug, ''), o.location, ''))) = 'greif'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(o.custom_responses, '[]'::jsonb)) as existing(response)
      where existing.response->>'id' = 'greif-default-refrigerio'
        or (
          existing.response->>'source' = 'greif-default-refrigerio'
          and lower(coalesce(existing.response->>'auto_applied', 'false')) = 'true'
        )
    )
  group by o.id
) as cleaned
where o.id = cleaned.id;
