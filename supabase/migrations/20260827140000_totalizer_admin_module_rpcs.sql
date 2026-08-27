begin;

create or replace function public.totalizer_get_daily_payload(
  p_delivery_date date,
  p_service text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service text := nullif(lower(trim(coalesce(p_service, ''))), '');
  v_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_service = 'all' then
    v_service := null;
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(a) order by coalesce(a.sort_order, 9999), a.name)
      from public.totalizer_accounts a
      where coalesce(a.active, true) = true
    ), '[]'::jsonb),
    'concepts', coalesce((
      select jsonb_agg(to_jsonb(c) order by coalesce(c.sort_order, 9999), c.name)
      from public.totalizer_concepts c
      where coalesce(c.active, true) = true
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(d))
      from public.v_totalizer_daily d
      where d.delivery_date = p_delivery_date
        and (v_service is null or lower(coalesce(d.service, '')) = v_service)
    ), '[]'::jsonb),
    'appDaily', coalesce((
      select jsonb_agg(to_jsonb(d))
      from public.v_totalizer_app_daily d
      where d.delivery_date = p_delivery_date
        and (v_service is null or lower(coalesce(d.service, '')) = v_service)
    ), '[]'::jsonb),
    'values', coalesce((
      select jsonb_agg(to_jsonb(v))
      from public.totalizer_values v
      where v.delivery_date = p_delivery_date
        and (v_service is null or lower(coalesce(v.service, '')) = v_service)
    ), '[]'::jsonb),
    'reconciliation', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.v_totalizer_reconciliation r
      where r.delivery_date = p_delivery_date
        and (v_service is null or lower(coalesce(r.service, '')) = v_service)
    ), '[]'::jsonb),
    'remitos', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.v_totalizer_remito_reconciliation r
      where r.delivery_date = p_delivery_date
        and (v_service is null or lower(coalesce(r.service, '')) = v_service)
    ), '[]'::jsonb),
    'unmapped', coalesce((
      select jsonb_agg(to_jsonb(u) order by u.appearances desc, u.source_kind, u.source_title, u.source_value)
      from (
        select
          e.source_kind,
          e.source_title,
          e.source_value,
          e.company_slug,
          count(*)::integer as appearances
        from public.v_totalizer_order_events e
        left join public.totalizer_concept_mappings m
          on coalesce(m.active, true) = true
         and m.source_kind = e.source_kind
         and coalesce(m.source_title, '') = coalesce(e.source_title, '')
         and coalesce(m.source_value, '') = coalesce(e.source_value, '')
         and (m.company_slug is null or m.company_slug = e.company_slug)
        where e.delivery_date = p_delivery_date
          and (v_service is null or lower(coalesce(e.service, '')) = v_service)
          and m.id is null
        group by e.source_kind, e.source_title, e.source_value, e.company_slug
      ) u
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$$;

create or replace function public.totalizer_upsert_value(
  p_delivery_date date,
  p_account_id uuid,
  p_service text,
  p_concept_id uuid,
  p_value_type text,
  p_quantity numeric
)
returns public.totalizer_values
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.totalizer_values%rowtype;
  v_service text := lower(trim(coalesce(p_service, '')));
  v_value_type text := lower(trim(coalesce(p_value_type, '')));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_service not in ('almuerzo', 'cena', 'all') then
    raise exception 'invalid_service';
  end if;

  if v_service = 'all' then
    v_service := 'todos';
  end if;

  if v_value_type not in ('totalizer', 'kitchen', 'adjustment') then
    raise exception 'invalid_value_type';
  end if;

  if p_quantity is null then
    delete from public.totalizer_values
    where delivery_date = p_delivery_date
      and account_id = p_account_id
      and service = v_service
      and concept_id = p_concept_id
      and value_type = v_value_type
    returning * into v_row;

    return v_row;
  end if;

  insert into public.totalizer_values (
    delivery_date,
    account_id,
    service,
    concept_id,
    value_type,
    quantity,
    updated_at
  )
  values (
    p_delivery_date,
    p_account_id,
    v_service,
    p_concept_id,
    v_value_type,
    p_quantity,
    now()
  )
  on conflict (delivery_date, account_id, service, concept_id, value_type) do update
  set quantity = excluded.quantity,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.totalizer_create_manual_account(
  p_name text,
  p_sort_order integer default 999,
  p_active boolean default true
)
returns public.totalizer_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_code text;
  v_row public.totalizer_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_name is null then
    raise exception 'account_name_required';
  end if;

  v_code := trim(both '_' from regexp_replace(
    translate(lower(v_name), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+',
    '_',
    'g'
  ));

  insert into public.totalizer_accounts (name, code, source_mode, sort_order, active, updated_at)
  values (v_name, v_code, 'manual', coalesce(p_sort_order, 999), coalesce(p_active, true), now())
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.totalizer_create_concept(
  p_name text,
  p_code text,
  p_category text,
  p_counts_as_menu boolean default false,
  p_sort_order integer default 999,
  p_active boolean default true
)
returns public.totalizer_concepts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_code text := nullif(trim(coalesce(p_code, '')), '');
  v_category text := lower(trim(coalesce(p_category, 'other')));
  v_row public.totalizer_concepts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_name is null or v_code is null then
    raise exception 'concept_required';
  end if;

  if v_category not in ('menu', 'option', 'diet', 'side_dish', 'snack', 'route', 'return', 'other') then
    raise exception 'invalid_category';
  end if;

  insert into public.totalizer_concepts (
    name,
    code,
    category,
    counts_as_menu,
    sort_order,
    active,
    updated_at
  )
  values (
    v_name,
    v_code,
    v_category,
    coalesce(p_counts_as_menu, false),
    coalesce(p_sort_order, 999),
    coalesce(p_active, true),
    now()
  )
  on conflict (code) do update
  set name = excluded.name,
      category = excluded.category,
      counts_as_menu = excluded.counts_as_menu,
      sort_order = excluded.sort_order,
      active = excluded.active,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.totalizer_create_mapping(
  p_concept_id uuid,
  p_source_kind text,
  p_source_title text,
  p_source_value text,
  p_company_slug text default null,
  p_match_mode text default 'exact',
  p_priority integer default 100
)
returns public.totalizer_concept_mappings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match_mode text := lower(trim(coalesce(p_match_mode, 'exact')));
  v_row public.totalizer_concept_mappings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if v_match_mode not in ('exact', 'contains') then
    raise exception 'invalid_match_mode';
  end if;

  insert into public.totalizer_concept_mappings (
    concept_id,
    source_kind,
    source_title,
    source_value,
    company_slug,
    match_mode,
    priority,
    active,
    updated_at
  )
  values (
    p_concept_id,
    nullif(trim(coalesce(p_source_kind, '')), ''),
    nullif(trim(coalesce(p_source_title, '')), ''),
    nullif(trim(coalesce(p_source_value, '')), ''),
    nullif(trim(coalesce(p_company_slug, '')), ''),
    v_match_mode,
    coalesce(p_priority, 100),
    true,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.totalizer_save_order_note(
  p_remito_id uuid,
  p_order_note_number text
)
returns public.totalizer_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := nullif(trim(coalesce(p_order_note_number, '')), '');
  v_row public.totalizer_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  insert into public.totalizer_documents (remito_id, order_note_number, updated_at)
  values (p_remito_id, v_note, now())
  on conflict (remito_id) do update
  set order_note_number = excluded.order_note_number,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.totalizer_get_daily_payload(date, text) to authenticated;
grant execute on function public.totalizer_upsert_value(date, uuid, text, uuid, text, numeric) to authenticated;
grant execute on function public.totalizer_create_manual_account(text, integer, boolean) to authenticated;
grant execute on function public.totalizer_create_concept(text, text, text, boolean, integer, boolean) to authenticated;
grant execute on function public.totalizer_create_mapping(uuid, text, text, text, text, text, integer) to authenticated;
grant execute on function public.totalizer_save_order_note(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
