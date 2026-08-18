-- Run before and after supabase/migrations/20260818130000_normal_order_company_snapshot.sql.
-- It reports company counts, rows that can be completed by the migration rule,
-- and doubtful rows that remain unchanged. No data is modified.

create or replace function pg_temp.normalize_company_snapshot_key(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(coalesce(p_value, ''))),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    ),
    ''
  )
$$;

create or replace function pg_temp.resolve_order_company_snapshot(
  p_user_id uuid,
  p_location text,
  p_organization text,
  p_customer_email text,
  p_delivery_date date
)
returns table (
  company_slug text,
  company_name text,
  match_source text,
  candidate_count integer
)
language sql
stable
as $$
  with input_values as (
    select
      pg_temp.normalize_company_snapshot_key(p_location) as location_key,
      pg_temp.normalize_company_snapshot_key(p_organization) as organization_key,
      public.normalize_contact_email(p_customer_email) as customer_email,
      public.normalize_contact_email(u.email) as profile_email
    from public.users u
    where u.id = p_user_id
    union all
    select
      pg_temp.normalize_company_snapshot_key(p_location),
      pg_temp.normalize_company_snapshot_key(p_organization),
      public.normalize_contact_email(p_customer_email),
      null
    where p_user_id is null
       or not exists (select 1 from public.users u where u.id = p_user_id)
  ),
  profile_candidates as (
    select distinct
      c.slug,
      c.name,
      'profile'::text as source,
      10 as priority
    from public.user_daily_company_profiles p
    join public.companies c on c.slug = lower(trim(p.company_slug))
    where p.user_id = p_user_id
      and p.active_date = p_delivery_date
  ),
  email_candidates as (
    select distinct
      c.slug,
      c.name,
      'email'::text as source,
      20 as priority
    from input_values i
    join public.authorized_order_contacts aoc
      on public.normalize_contact_email(aoc.email) in (i.customer_email, i.profile_email)
     and aoc.status <> 'disabled'
    join public.order_organizations org on org.id = aoc.organization_id
    join public.companies c on c.slug = lower(org.code)
    where coalesce(i.customer_email, i.profile_email) is not null
  ),
  catalog_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      30 as priority
    from input_values i
    join public.order_locations loc
      on loc.active = true
     and i.location_key in (
       pg_temp.normalize_company_snapshot_key(loc.display_name),
       pg_temp.normalize_company_snapshot_key(loc.code),
       pg_temp.normalize_company_snapshot_key(loc.slug)
     )
    join public.order_organizations org on org.id = loc.organization_id and org.active = true
    join public.companies c on c.slug = lower(org.code)
    where i.location_key is not null
  ),
  organization_candidates as (
    select distinct
      c.slug,
      c.name,
      'organization'::text as source,
      40 as priority
    from input_values i
    join public.companies c
      on i.organization_key in (
        pg_temp.normalize_company_snapshot_key(c.slug),
        pg_temp.normalize_company_snapshot_key(c.name)
      )
    where i.organization_key is not null
  ),
  legacy_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      50 as priority
    from input_values i
    join public.companies c
      on i.location_key in (
        pg_temp.normalize_company_snapshot_key(c.slug),
        pg_temp.normalize_company_snapshot_key(c.name),
        pg_temp.normalize_company_snapshot_key(public.resolve_company_location(c.slug))
      )
    where i.location_key is not null
      and c.slug <> 'global'
  ),
  candidates as (
    select * from profile_candidates
    union all
    select * from email_candidates
    union all
    select * from catalog_location_candidates
    union all
    select * from organization_candidates
    union all
    select * from legacy_location_candidates
  ),
  top_priority as (
    select min(priority) as priority
    from candidates
  ),
  top_candidates as (
    select distinct c.slug, c.name, c.source
    from candidates c
    join top_priority p on p.priority = c.priority
  ),
  summary as (
    select
      count(distinct slug)::integer as candidate_count,
      min(slug) as slug,
      min(name) as name,
      min(source) as source
    from top_candidates
  )
  select
    case when candidate_count = 1 then slug end as company_slug,
    case when candidate_count = 1 then name end as company_name,
    case when candidate_count = 1 then source end as match_source,
    candidate_count
  from summary
$$;

with resolved as (
  select
    o.id,
    o.delivery_date,
    o.status,
    coalesce(nullif(lower(o.order_origin), ''), 'user') as order_origin,
    o.location,
    o.organization,
    o.customer_email,
    o.company_slug as current_company_slug,
    o.company_name as current_company_name,
    r.company_slug as resolved_company_slug,
    r.company_name as resolved_company_name,
    r.match_source,
    r.candidate_count
  from public.orders o
  cross join lateral pg_temp.resolve_order_company_snapshot(
    o.user_id,
    coalesce(o.location, o.delivery_location),
    o.organization,
    o.customer_email,
    o.delivery_date
  ) r
  where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
)
select
  '01_current_counts_by_company' as section,
  coalesce(nullif(current_company_slug, ''), 'sin_empresa') as company_slug,
  coalesce(nullif(current_company_name, ''), 'Sin empresa') as company_name,
  count(*) as orders_count
from resolved
group by 1, 2, 3
union all
select
  '02_would_complete_by_company' as section,
  resolved_company_slug as company_slug,
  resolved_company_name as company_name,
  count(*) as orders_count
from resolved
where (nullif(trim(current_company_slug), '') is null or nullif(trim(current_company_name), '') is null)
  and resolved_company_slug is not null
group by 1, 2, 3
union all
select
  '03_doubtful_summary' as section,
  'dudosos' as company_slug,
  'Sin cambio' as company_name,
  count(*) as orders_count
from resolved
where (nullif(trim(current_company_slug), '') is null or nullif(trim(current_company_name), '') is null)
  and resolved_company_slug is null
order by section, company_slug;

with resolved as (
  select
    o.id,
    o.created_at,
    o.delivery_date,
    o.status,
    coalesce(nullif(lower(o.order_origin), ''), 'user') as order_origin,
    o.user_id,
    o.location,
    o.delivery_location,
    o.organization,
    o.customer_email,
    o.company_slug as current_company_slug,
    o.company_name as current_company_name,
    r.match_source,
    r.candidate_count
  from public.orders o
  cross join lateral pg_temp.resolve_order_company_snapshot(
    o.user_id,
    coalesce(o.location, o.delivery_location),
    o.organization,
    o.customer_email,
    o.delivery_date
  ) r
  where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
    and (nullif(trim(o.company_slug), '') is null or nullif(trim(o.company_name), '') is null)
    and r.company_slug is null
)
select
  id,
  created_at,
  delivery_date,
  status,
  user_id,
  location,
  delivery_location,
  organization,
  customer_email,
  current_company_slug,
  current_company_name,
  candidate_count,
  match_source
from resolved
order by delivery_date nulls last, created_at, id;
