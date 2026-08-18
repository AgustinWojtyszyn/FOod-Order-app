-- Combined apply + verification script for normal order company snapshots.
-- Copy/run this as one SQL file: it reports BEFORE, applies the migration,
-- then reports AFTER and lists doubtful rows that remain unchanged.

select 'BEFORE normal_order_company_snapshot' as phase;
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

select 'APPLY normal_order_company_snapshot' as phase;

-- Snapshot company data on regular orders without changing order contents,
-- dates, statuses, users, remitos or delivery/location snapshots.

create or replace function public.normalize_company_snapshot_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
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

create or replace function public.resolve_order_company_snapshot(
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
set search_path = public, pg_temp
as $$
  with input_values as (
    select
      public.normalize_company_snapshot_key(p_location) as location_key,
      public.normalize_company_snapshot_key(p_organization) as organization_key,
      public.normalize_contact_email(p_customer_email) as customer_email,
      public.normalize_contact_email(u.email) as profile_email
    from public.users u
    where u.id = p_user_id
    union all
    select
      public.normalize_company_snapshot_key(p_location),
      public.normalize_company_snapshot_key(p_organization),
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
       public.normalize_company_snapshot_key(loc.display_name),
       public.normalize_company_snapshot_key(loc.code),
       public.normalize_company_snapshot_key(loc.slug)
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
        public.normalize_company_snapshot_key(c.slug),
        public.normalize_company_snapshot_key(c.name)
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
        public.normalize_company_snapshot_key(c.slug),
        public.normalize_company_snapshot_key(c.name),
        public.normalize_company_snapshot_key(public.resolve_company_location(c.slug))
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
  v_requested_location text;
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
  v_company_snapshot record;
  v_company_slug text;
  v_company_name text;
  v_requires_contact_authorization boolean := false;
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

  insert into public.users (id, email, full_name, role, created_at, updated_at)
  values (
    p_user_id,
    coalesce(
      nullif(public.normalize_contact_email(auth.jwt()->>'email'), ''),
      nullif(public.normalize_contact_email(p_payload->>'customer_email'), ''),
      p_user_id::text
    ),
    coalesce(
      nullif(trim(coalesce(p_payload->>'customer_name', '')), ''),
      nullif(trim(coalesce(auth.jwt()->>'email', '')), ''),
      nullif(trim(coalesce(p_payload->>'customer_email', '')), ''),
      p_user_id::text
    ),
    'user',
    now(),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(public.users.email, ''), excluded.email),
      full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name),
      updated_at = now();

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
  v_requested_location := nullif(trim(coalesce(p_payload->>'location', '')), '');

  if v_requested_location is null then
    raise exception 'location_required';
  end if;

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
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

  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(v_requested_location)
      or lower(loc.code) = lower(v_requested_location)
      or lower(loc.slug) = lower(v_requested_location)
    )
  limit 1;

  if v_location.id is not null then
    select *
    into v_organization
    from public.order_organizations
    where id = v_location.organization_id;

    v_requires_contact_authorization := upper(coalesce(v_organization.code, '')) <> 'EPSE'
      and exists (
        select 1
        from public.authorized_order_contacts c
        where c.organization_id = v_location.organization_id
          and c.status <> 'disabled'
      );

    if not public.is_admin() and v_requires_contact_authorization and not exists (
      select 1
      from public.user_order_locations uol
      where uol.user_id = p_user_id
        and uol.location_id = v_location.id
        and uol.active = true
    ) then
      perform public.sync_authorized_order_locations_for_user(p_user_id);
      if not exists (
        select 1
        from public.user_order_locations uol
        where uol.user_id = p_user_id
          and uol.location_id = v_location.id
          and uol.active = true
      ) then
        raise exception 'location_not_allowed';
      end if;
    end if;

    select *
    into v_delivery_location
    from public.order_locations
    where id = coalesce(v_location.default_delivery_location_id, v_location.id);
  end if;

  select *
  into v_company_snapshot
  from public.resolve_order_company_snapshot(
    p_user_id,
    coalesce(v_location.display_name, v_requested_location),
    v_organization.name,
    p_payload->>'customer_email',
    v_delivery_date
  );

  v_company_slug := coalesce(
    v_company_snapshot.company_slug,
    public.normalize_company_snapshot_key(coalesce(v_organization.name, v_location.display_name, v_requested_location))
  );
  v_company_name := coalesce(
    v_company_snapshot.company_name,
    v_organization.name,
    v_location.display_name,
    v_requested_location
  );

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
    company_slug,
    company_name,
    organization,
    requesting_location_code,
    order_location_id,
    delivery_location,
    delivery_location_code,
    delivery_order_location_id,
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
    coalesce(v_location.display_name, v_requested_location),
    v_company_slug,
    v_company_name,
    v_organization.name,
    v_location.code,
    v_location.id,
    coalesce(v_delivery_location.display_name, v_requested_location),
    v_delivery_location.code,
    v_delivery_location.id,
    v_service,
    v_items,
    'pending',
    coalesce((p_payload->>'total_items')::integer, jsonb_array_length(v_items), 0),
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

do $$
declare
  v_has_updated_at_trigger boolean;
begin
  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'trg_orders_updated_at'
      and not tgisinternal
  )
  into v_has_updated_at_trigger;

  if v_has_updated_at_trigger then
    alter table public.orders disable trigger trg_orders_updated_at;
  end if;

  with resolved_orders as (
    select
      o.id,
      r.company_slug,
      r.company_name
    from public.orders o
    cross join lateral public.resolve_order_company_snapshot(
      o.user_id,
      coalesce(o.location, o.delivery_location),
      o.organization,
      o.customer_email,
      o.delivery_date
    ) r
    where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
      and (nullif(trim(o.company_slug), '') is null or nullif(trim(o.company_name), '') is null)
      and r.company_slug is not null
  )
  update public.orders o
  set company_slug = coalesce(nullif(trim(o.company_slug), ''), resolved.company_slug),
      company_name = coalesce(nullif(trim(o.company_name), ''), resolved.company_name)
  from resolved_orders resolved
  where resolved.id = o.id;

  if v_has_updated_at_trigger then
    alter table public.orders enable trigger trg_orders_updated_at;
  end if;
exception
  when others then
    if v_has_updated_at_trigger then
      alter table public.orders enable trigger trg_orders_updated_at;
    end if;
    raise;
end $$;

revoke all on function public.normalize_company_snapshot_key(text) from public;
revoke all on function public.normalize_company_snapshot_key(text) from anon;
grant execute on function public.normalize_company_snapshot_key(text) to authenticated;

revoke all on function public.resolve_order_company_snapshot(uuid, text, text, text, date) from public;
revoke all on function public.resolve_order_company_snapshot(uuid, text, text, text, date) from anon;
grant execute on function public.resolve_order_company_snapshot(uuid, text, text, text, date) to authenticated;

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

select 'AFTER normal_order_company_snapshot' as phase;
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
