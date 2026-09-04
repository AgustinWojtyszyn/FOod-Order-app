begin;

insert into public.user_permissions (user_id, permission, company_slug)
select u.id, 'consumption_report_viewer', c.slug
from public.users u
cross join public.companies c
where lower(trim(u.email)) in (
  'lcorrea@imasa.com.ar',
  'ggalvarini@imasa.com.ar',
  'vcastilla@imasa.com.ar',
  'mborras@imasa.com.ar'
)
and c.slug in ('igarreta', 'isemar')
on conflict (user_id, permission, company_slug) do nothing;

create table if not exists public.order_item_discounts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  delivery_date date not null,
  order_origin text not null default 'user',
  company_slug text,
  company_name text,
  location text,
  service text,
  item_index integer not null,
  item_id text,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  reason text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_email text,
  created_by_name text,
  order_snapshot_before jsonb not null,
  order_snapshot_after jsonb not null,
  request_id text not null,
  created_at timestamptz not null default now(),
  constraint order_item_discounts_request_id_uidx unique (request_id)
);

create index if not exists order_item_discounts_order_id_idx
  on public.order_item_discounts (order_id, created_at desc);

create index if not exists order_item_discounts_delivery_date_idx
  on public.order_item_discounts (delivery_date desc, company_slug);

alter table public.order_item_discounts enable row level security;

revoke all on public.order_item_discounts from public;
revoke all on public.order_item_discounts from anon;
revoke all on public.order_item_discounts from authenticated;
grant select on public.order_item_discounts to authenticated;

create table if not exists public.order_discount_authorized_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_discount_authorized_identity_check check (
    user_id is not null or nullif(trim(coalesce(email, '')), '') is not null
  )
);

create unique index if not exists order_discount_authorized_user_id_uidx
  on public.order_discount_authorized_accounts (user_id)
  where user_id is not null;

create unique index if not exists order_discount_authorized_email_uidx
  on public.order_discount_authorized_accounts (lower(trim(email)))
  where email is not null;

alter table public.order_discount_authorized_accounts enable row level security;

revoke all on public.order_discount_authorized_accounts from public;
revoke all on public.order_discount_authorized_accounts from anon;
revoke all on public.order_discount_authorized_accounts from authenticated;

update public.order_discount_authorized_accounts
set active = false,
    updated_at = now()
where lower(trim(coalesce(email, ''))) not in (
  'sarmientoclaudia985@gmail.com',
  'agustinwojtyszyn99@gmail.com'
)
and user_id is null;

insert into public.order_discount_authorized_accounts (email, note)
values
  ('sarmientoclaudia985@gmail.com', 'Autorizada para descontar items de pedidos diarios'),
  ('agustinwojtyszyn99@gmail.com', 'Usuario interno autorizado para descontar items de pedidos diarios')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

do $$
declare
  v_jessica public.users%rowtype;
  v_count integer := 0;
begin
  select count(*)
  into v_count
  from public.users u
  where lower(coalesce(u.email, '')) like '%jessica%'
     or lower(coalesce(u.email, '')) like '%jesica%'
     or lower(coalesce(u.full_name, '')) like '%jessica%'
     or lower(coalesce(u.full_name, '')) like '%jesica%';

  if v_count = 1 then
    select *
    into v_jessica
    from public.users u
    where lower(coalesce(u.email, '')) like '%jessica%'
       or lower(coalesce(u.email, '')) like '%jesica%'
       or lower(coalesce(u.full_name, '')) like '%jessica%'
       or lower(coalesce(u.full_name, '')) like '%jesica%'
    limit 1;

    insert into public.order_discount_authorized_accounts (user_id, email, note)
    values (
      v_jessica.id,
      v_jessica.email,
      'Jesica resuelta automaticamente por coincidencia unica en public.users'
    )
    on conflict (user_id) where user_id is not null do update
    set email = excluded.email,
        active = true,
        note = excluded.note,
        updated_at = now();
  end if;
end;
$$;

create or replace function public.has_consumption_report_access(
  p_company_slug text default 'isemar'
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1
      from public.user_permissions up
      where up.user_id = auth.uid()
        and up.permission = 'consumption_report_viewer'
        and up.company_slug = nullif(trim(coalesce(p_company_slug, '')), '')
    );
$$;

create or replace function public.can_manage_order_discounts(p_user_id uuid default auth.uid())
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
    from public.order_discount_authorized_accounts cfg
    join actor a on (
      cfg.user_id = a.id
      or lower(trim(coalesce(cfg.email, ''))) = a.email
    )
    where cfg.active = true
  );
$$;

create or replace function public.order_discount_jsonb_positive_int(p_value jsonb)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[0-9]+$' then (p_value #>> '{}')::integer
    when jsonb_typeof(p_value) = 'string' and trim(p_value #>> '{}') ~ '^[0-9]+$' then trim(p_value #>> '{}')::integer
    else null
  end;
$$;

create or replace function public.order_discount_sum_quantities(p_quantities jsonb)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(sum(public.order_discount_jsonb_positive_int(value)), 0)::integer
  from jsonb_each(coalesce(p_quantities, '{}'::jsonb));
$$;

create or replace function public.order_discount_reduce_quantities(
  p_quantities jsonb,
  p_reduce integer
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_remaining integer := greatest(coalesce(p_reduce, 0), 0);
  v_key text;
  v_value jsonb;
  v_quantity integer;
  v_next_quantity integer;
begin
  if coalesce(jsonb_typeof(p_quantities), '') <> 'object' or v_remaining <= 0 then
    return coalesce(p_quantities, '{}'::jsonb);
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each(p_quantities)
    order by key
  loop
    v_quantity := public.order_discount_jsonb_positive_int(v_value);
    if v_quantity is null then
      v_result := v_result || jsonb_build_object(v_key, v_value);
    else
      v_next_quantity := greatest(v_quantity - v_remaining, 0);
      v_remaining := greatest(v_remaining - v_quantity, 0);
      if v_next_quantity > 0 then
        v_result := v_result || jsonb_build_object(v_key, v_next_quantity);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function public.order_discount_response_matches_item(
  p_response jsonb,
  p_item jsonb,
  p_item_index integer
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with response_values(value) as (
    values
      (p_response->>'item_id'),
      (p_response->>'itemId'),
      (p_response->>'menu_item_id'),
      (p_response->>'menuItemId'),
      (p_response->>'selectedItemId'),
      (p_response->>'slotIndex'),
      (p_response->>'item_slot_index')
  ),
  item_values(value) as (
    values
      (p_item->>'id'),
      (p_item->>'item_id'),
      (p_item->>'itemId'),
      (p_item->>'menu_item_id'),
      (p_item->>'menuItemId'),
      (p_item->>'selectedItemId'),
      (p_item->>'slotIndex'),
      (p_item->>'item_slot_index'),
      (p_item_index::text)
  )
  select exists (
    select 1
    from response_values rv
    join item_values iv on lower(trim(rv.value)) = lower(trim(iv.value))
    where nullif(trim(coalesce(rv.value, '')), '') is not null
      and nullif(trim(coalesce(iv.value, '')), '') is not null
  );
$$;

create or replace function public.order_discount_is_operational_response(p_response jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(
    p_response->>'title',
    p_response->>'label',
    p_response->>'question',
    p_response->>'name',
    ''
  ))) ~ '(bebida|bebidas|postre|postres|fruta|guarnici[oó]n|guarnicion|acompa[nñ]amiento)';
$$;

create or replace function public.order_discount_trim_response_array(
  p_response jsonb,
  p_field text,
  p_limit integer
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_limit < 0 then p_response
    when jsonb_typeof(p_response->p_field) <> 'array' then p_response
    when jsonb_array_length(p_response->p_field) <= p_limit then p_response
    else jsonb_set(
      p_response,
      array[p_field],
      coalesce((
        select jsonb_agg(value order by ord)
        from jsonb_array_elements(p_response->p_field) with ordinality as item(value, ord)
        where ord <= p_limit
      ), '[]'::jsonb),
      true
    )
  end;
$$;

create or replace function public.order_discount_adjust_custom_responses(
  p_custom_responses jsonb,
  p_target_item jsonb,
  p_item_index integer,
  p_discount_quantity integer,
  p_target_item_quantity_after integer,
  p_menu_total_after integer
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_response jsonb;
  v_next_response jsonb;
  v_quantities jsonb;
  v_quantity_total integer;
  v_explicit_quantity integer;
  v_reduce integer;
  v_linked boolean;
  v_operational boolean;
  v_keep_response boolean;
begin
  if coalesce(jsonb_typeof(p_custom_responses), '') <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_response in
    select value
    from jsonb_array_elements(p_custom_responses) as item(value)
  loop
    if jsonb_typeof(v_response) <> 'object' then
      v_result := v_result || jsonb_build_array(v_response);
      continue;
    end if;

    v_next_response := v_response;
    v_linked := public.order_discount_response_matches_item(v_response, p_target_item, p_item_index);
    v_operational := public.order_discount_is_operational_response(v_response);
    v_quantities := v_response->'quantities';
    v_keep_response := true;

    if v_linked and coalesce(p_target_item_quantity_after, 0) <= 0 then
      v_keep_response := false;
    elsif jsonb_typeof(v_quantities) = 'object' then
      v_quantity_total := public.order_discount_sum_quantities(v_quantities);
      if v_linked then
        v_reduce := least(greatest(coalesce(p_discount_quantity, 0), 0), v_quantity_total);
      elsif v_operational and v_quantity_total > greatest(coalesce(p_menu_total_after, 0), 0) then
        v_reduce := v_quantity_total - greatest(coalesce(p_menu_total_after, 0), 0);
      else
        v_reduce := 0;
      end if;

      if v_reduce > 0 then
        v_next_response := jsonb_set(
          v_next_response,
          '{quantities}',
          public.order_discount_reduce_quantities(v_quantities, v_reduce),
          true
        );
      end if;

      if jsonb_typeof(v_next_response->'response') = 'array' then
        v_next_response := public.order_discount_trim_response_array(
          v_next_response,
          'response',
          public.order_discount_sum_quantities(v_next_response->'quantities')
        );
      end if;
    elsif v_linked and jsonb_typeof(v_next_response->'response') = 'array' then
      v_next_response := public.order_discount_trim_response_array(
        v_next_response,
        'response',
        greatest(coalesce(p_target_item_quantity_after, 0), 0)
      );
    elsif v_operational and jsonb_typeof(v_next_response->'response') = 'array'
      and jsonb_array_length(v_next_response->'response') > greatest(coalesce(p_menu_total_after, 0), 0)
    then
      v_next_response := public.order_discount_trim_response_array(
        v_next_response,
        'response',
        greatest(coalesce(p_menu_total_after, 0), 0)
      );
    elsif v_operational then
      v_explicit_quantity := coalesce(
        public.order_discount_jsonb_positive_int(v_next_response->'quantity'),
        public.order_discount_jsonb_positive_int(v_next_response->'qty'),
        public.order_discount_jsonb_positive_int(v_next_response->'count')
      );
      if v_explicit_quantity is not null and v_explicit_quantity > greatest(coalesce(p_menu_total_after, 0), 0) then
        if v_next_response ? 'quantity' then
          v_next_response := jsonb_set(v_next_response, '{quantity}', to_jsonb(greatest(coalesce(p_menu_total_after, 0), 0)), true);
        end if;
        if v_next_response ? 'qty' then
          v_next_response := jsonb_set(v_next_response, '{qty}', to_jsonb(greatest(coalesce(p_menu_total_after, 0), 0)), true);
        end if;
        if v_next_response ? 'count' then
          v_next_response := jsonb_set(v_next_response, '{count}', to_jsonb(greatest(coalesce(p_menu_total_after, 0), 0)), true);
        end if;
      end if;
    end if;

    if v_keep_response then
      v_result := v_result || jsonb_build_array(v_next_response);
    end if;
  end loop;

  return v_result;
end;
$$;

drop policy if exists order_discount_authorized_read on public.order_discount_authorized_accounts;
create policy order_discount_authorized_read
on public.order_discount_authorized_accounts
for select
to authenticated
using (public.can_manage_order_discounts(auth.uid()));

create or replace function public.get_admin_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_global boolean := false;
  v_companies jsonb := '[]'::jsonb;
  v_consumption_report_companies jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_is_global := public.is_admin();

  if v_is_global then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.companies c
    where c.slug <> 'global';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and c.slug <> 'global';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', c.slug,
    'name', c.name
  ) order by c.name), '[]'::jsonb)
  into v_consumption_report_companies
  from public.companies c
  where c.slug in ('igarreta', 'isemar')
    and public.has_consumption_report_access(c.slug);

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'companies', v_companies,
    'can_view_consumption_report', jsonb_array_length(v_consumption_report_companies) > 0,
    'consumption_report_companies', v_consumption_report_companies,
    'can_manage_late_extra_history', public.can_manage_late_extra_history(auth.uid()),
    'can_create_late_admin_extra_order', public.is_late_admin_extra_order_authorized(auth.uid()),
    'can_manage_order_discounts', public.can_manage_order_discounts(auth.uid())
  );
end;
$$;

drop policy if exists order_item_discounts_admin_read on public.order_item_discounts;
create policy order_item_discounts_admin_read
on public.order_item_discounts
for select
to authenticated
using (public.is_admin() or public.can_manage_order_discounts(auth.uid()));

drop function if exists public.get_igarreta_isemar_consumption_report(date, date);

create or replace function public.get_igarreta_isemar_consumption_report(
  p_month_start date,
  p_month_end date
)
returns table (
  order_id uuid,
  delivery_date date,
  person_key text,
  person_name text,
  customer_name text,
  customer_email text,
  user_full_name text,
  user_email text,
  company_slug text,
  company_name text,
  organization text,
  location text,
  delivery_location text,
  requesting_location_code text,
  requesting_location text,
  requesting_location_name text,
  status text,
  items jsonb,
  total_items integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'not_authenticated';
  end if;

  if auth.role() <> 'service_role'
    and not (
      public.has_consumption_report_access('igarreta')
      or public.has_consumption_report_access('isemar')
    )
  then
    raise exception 'not_authorized';
  end if;

  if p_month_start is null or p_month_end is null or p_month_end < p_month_start
    or p_month_end - p_month_start > 31
  then
    raise exception 'invalid_consumption_report_range';
  end if;

  return query
  with allowed_companies as (
    select c.slug
    from public.companies c
    where c.slug in ('igarreta', 'isemar')
      and (
        auth.role() = 'service_role'
        or public.has_consumption_report_access(c.slug)
      )
  )
  select
    o.id,
    o.delivery_date,
    coalesce(o.user_id::text, nullif(lower(trim(o.customer_email)), ''), nullif(lower(trim(o.customer_name)), '')),
    coalesce(nullif(trim(o.customer_name), ''), nullif(trim(u.full_name), ''), nullif(trim(o.customer_email), ''), nullif(trim(u.email), ''), 'Sin nombre'),
    o.customer_name,
    o.customer_email,
    u.full_name,
    u.email,
    o.company_slug,
    o.company_name,
    o.organization,
    o.location,
    o.delivery_location,
    o.requesting_location_code,
    o.requesting_location,
    o.requesting_location_name,
    o.status,
    o.items,
    o.total_items
  from public.orders o
  left join public.users u on u.id = o.user_id
  where o.delivery_date between p_month_start and p_month_end
    and o.status in ('pending', 'archived', 'post_report_extra')
    and (
      exists (
        select 1
        from public.order_locations loc
        join public.companies c on c.id = loc.company_id
        join allowed_companies ac on ac.slug = c.slug
        where loc.id = o.order_location_id
           or loc.id = o.delivery_order_location_id
           or public.normalize_order_schedule_location_key(coalesce(o.requesting_location_code, '')) in (
             public.normalize_order_schedule_location_key(loc.code),
             public.normalize_order_schedule_location_key(loc.slug),
             public.normalize_order_schedule_location_key(loc.display_name)
           )
           or public.normalize_order_schedule_location_key(coalesce(o.location, '')) in (
             public.normalize_order_schedule_location_key(loc.code),
             public.normalize_order_schedule_location_key(loc.slug),
             public.normalize_order_schedule_location_key(loc.display_name)
           )
           or public.normalize_order_schedule_location_key(coalesce(o.delivery_location_code, '')) in (
             public.normalize_order_schedule_location_key(loc.code),
             public.normalize_order_schedule_location_key(loc.slug),
             public.normalize_order_schedule_location_key(loc.display_name)
           )
           or public.normalize_order_schedule_location_key(coalesce(o.delivery_location, '')) in (
             public.normalize_order_schedule_location_key(loc.code),
             public.normalize_order_schedule_location_key(loc.slug),
             public.normalize_order_schedule_location_key(loc.display_name)
           )
      )
      or public.normalize_company_remito_slug(o.company_slug) in (select slug from allowed_companies)
      or public.normalize_company_remito_slug(o.organization) in (select slug from allowed_companies)
      or public.normalize_company_remito_slug(o.company_name) in (select slug from allowed_companies)
    )
  order by o.delivery_date, person_name, o.id;
end;
$$;

create or replace function public.create_order_item_discount(p_payload jsonb)
returns setof public.order_item_discounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_delivery_date date;
  v_item_index integer;
  v_quantity integer;
  v_reason text;
  v_request_id text;
  v_target_item jsonb;
  v_available integer;
  v_new_quantity integer;
  v_new_items jsonb;
  v_new_total_items integer;
  v_new_custom_responses jsonb;
  v_before jsonb;
  v_after jsonb;
  v_discount public.order_item_discounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.can_manage_order_discounts(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.id is null then
    raise exception 'actor_not_found';
  end if;

  v_order_id := nullif(trim(coalesce(p_payload->>'order_id', '')), '')::uuid;
  v_delivery_date := nullif(trim(coalesce(p_payload->>'delivery_date', '')), '')::date;
  v_item_index := nullif(trim(coalesce(p_payload->>'item_index', '')), '')::integer;
  v_quantity := nullif(trim(coalesce(p_payload->>'quantity', '')), '')::integer;
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_request_id := nullif(trim(coalesce(p_payload->>'request_id', '')), '');

  if v_request_id is null then
    raise exception 'request_id_required';
  end if;

  select *
  into v_discount
  from public.order_item_discounts
  where request_id = v_request_id;

  if found then
    return next v_discount;
    return;
  end if;

  if v_order_id is null then
    raise exception 'order_id_required';
  end if;
  if v_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;
  if v_item_index is null or v_item_index < 0 then
    raise exception 'item_index_invalid';
  end if;
  if v_quantity is null or v_quantity <= 0 then
    raise exception 'quantity_invalid';
  end if;
  if v_reason is null then
    raise exception 'reason_required';
  end if;

  select *
  into v_order
  from public.orders
  where id = v_order_id
    and delivery_date = v_delivery_date
    and status in ('pending', 'archived', 'post_report_extra')
  for update;

  if v_order.id is null then
    raise exception 'order_not_found_for_operational_date';
  end if;

  select elem
  into v_target_item
  from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) with ordinality as item(elem, ord)
  where ord = v_item_index + 1
    and jsonb_typeof(elem) = 'object';

  if v_target_item is null then
    raise exception 'item_not_found';
  end if;

  v_available := case
    when v_target_item ? 'quantity'
      then coalesce(public.order_discount_jsonb_positive_int(v_target_item->'quantity'), 0)
    else 1
  end;

  if v_quantity > v_available then
    raise exception 'quantity_exceeds_available';
  end if;

  v_new_quantity := v_available - v_quantity;
  v_new_total_items := greatest(coalesce(v_order.total_items, 0) - v_quantity, 0);
  v_before := to_jsonb(v_order);

  select coalesce(jsonb_agg(next_item order by ord), '[]'::jsonb)
  into v_new_items
  from (
    select
      ord,
      case
        when ord = v_item_index + 1 and v_new_quantity > 0
          then jsonb_set(elem, '{quantity}', to_jsonb(v_new_quantity), true)
        when ord = v_item_index + 1 and v_new_quantity = 0
          then null
        else elem
      end as next_item
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) with ordinality as item(elem, ord)
  ) rebuilt
  where next_item is not null;

  v_new_custom_responses := public.order_discount_adjust_custom_responses(
    coalesce(v_order.custom_responses, '[]'::jsonb),
    v_target_item,
    v_item_index,
    v_quantity,
    v_new_quantity,
    v_new_total_items
  );

  update public.orders
  set items = v_new_items,
      custom_responses = v_new_custom_responses,
      total_items = v_new_total_items,
      updated_at = now()
  where id = v_order.id
  returning *
  into v_order;

  v_after := to_jsonb(v_order);

  insert into public.order_item_discounts (
    order_id,
    delivery_date,
    order_origin,
    company_slug,
    company_name,
    location,
    service,
    item_index,
    item_id,
    item_name,
    quantity,
    reason,
    created_by,
    created_by_email,
    created_by_name,
    order_snapshot_before,
    order_snapshot_after,
    request_id
  )
  values (
    v_order.id,
    v_order.delivery_date,
    coalesce(nullif(trim(v_order.order_origin), ''), 'user'),
    v_order.company_slug,
    v_order.company_name,
    v_order.location,
    v_order.service,
    v_item_index,
    coalesce(nullif(trim(coalesce(p_payload->>'item_id', '')), ''), nullif(trim(coalesce(v_target_item->>'id', '')), '')),
    coalesce(nullif(trim(coalesce(p_payload->>'item_name', '')), ''), nullif(trim(coalesce(v_target_item->>'name', '')), ''), 'Ítem sin nombre'),
    v_quantity,
    v_reason,
    auth.uid(),
    v_actor.email,
    coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email),
    v_before,
    v_after,
    v_request_id
  )
  returning *
  into v_discount;

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
    'order_item_discount_created',
    'Descuento de ítem de pedido registrado por administrador',
    auth.uid(),
    v_actor.email,
    coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'discount_id', v_discount.id,
      'order_id', v_order.id,
      'delivery_date', v_order.delivery_date,
      'order_origin', coalesce(nullif(trim(v_order.order_origin), ''), 'user'),
      'company_slug', v_order.company_slug,
      'company_name', v_order.company_name,
      'location', v_order.location,
      'service', v_order.service,
      'item_index', v_item_index,
      'item_id', v_discount.item_id,
      'item_name', v_discount.item_name,
      'quantity', v_quantity,
      'available_before', v_available,
      'remaining_after', v_new_quantity,
      'reason', v_reason,
      'snapshot_before', v_before,
      'snapshot_after', v_after
    ),
    v_request_id,
    now()
  );

  return next v_discount;
end;
$$;

revoke all on function public.has_consumption_report_access(text) from public;
revoke all on function public.has_consumption_report_access(text) from anon;
grant execute on function public.has_consumption_report_access(text) to authenticated;

revoke all on function public.can_manage_order_discounts(uuid) from public;
revoke all on function public.can_manage_order_discounts(uuid) from anon;
grant execute on function public.can_manage_order_discounts(uuid) to authenticated;

revoke all on function public.order_discount_jsonb_positive_int(jsonb) from public;
revoke all on function public.order_discount_jsonb_positive_int(jsonb) from anon;
revoke all on function public.order_discount_jsonb_positive_int(jsonb) from authenticated;

revoke all on function public.order_discount_sum_quantities(jsonb) from public;
revoke all on function public.order_discount_sum_quantities(jsonb) from anon;
revoke all on function public.order_discount_sum_quantities(jsonb) from authenticated;

revoke all on function public.order_discount_reduce_quantities(jsonb, integer) from public;
revoke all on function public.order_discount_reduce_quantities(jsonb, integer) from anon;
revoke all on function public.order_discount_reduce_quantities(jsonb, integer) from authenticated;

revoke all on function public.order_discount_response_matches_item(jsonb, jsonb, integer) from public;
revoke all on function public.order_discount_response_matches_item(jsonb, jsonb, integer) from anon;
revoke all on function public.order_discount_response_matches_item(jsonb, jsonb, integer) from authenticated;

revoke all on function public.order_discount_is_operational_response(jsonb) from public;
revoke all on function public.order_discount_is_operational_response(jsonb) from anon;
revoke all on function public.order_discount_is_operational_response(jsonb) from authenticated;

revoke all on function public.order_discount_trim_response_array(jsonb, text, integer) from public;
revoke all on function public.order_discount_trim_response_array(jsonb, text, integer) from anon;
revoke all on function public.order_discount_trim_response_array(jsonb, text, integer) from authenticated;

revoke all on function public.order_discount_adjust_custom_responses(jsonb, jsonb, integer, integer, integer, integer) from public;
revoke all on function public.order_discount_adjust_custom_responses(jsonb, jsonb, integer, integer, integer, integer) from anon;
revoke all on function public.order_discount_adjust_custom_responses(jsonb, jsonb, integer, integer, integer, integer) from authenticated;

revoke all on function public.get_admin_access_context() from public;
revoke all on function public.get_admin_access_context() from anon;
grant execute on function public.get_admin_access_context() to authenticated;

revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from public;
revoke all on function public.get_igarreta_isemar_consumption_report(date, date) from anon;
grant execute on function public.get_igarreta_isemar_consumption_report(date, date) to authenticated;

revoke all on function public.create_order_item_discount(jsonb) from public;
revoke all on function public.create_order_item_discount(jsonb) from anon;
grant execute on function public.create_order_item_discount(jsonb) to authenticated;

commit;
