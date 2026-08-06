alter table public.companies
  add column if not exists menu_service_departure_time time not null default time '12:00',
  add column if not exists menu_add_cutoff_minutes integer not null default 120;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_menu_add_cutoff_positive'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_menu_add_cutoff_positive
      check (menu_add_cutoff_minutes >= 0);
  end if;
end;
$$;

alter table public.menu_items
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function public.set_menu_items_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();

  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
    new.updated_by = coalesce(new.updated_by, new.created_by, auth.uid());
  else
    new.updated_by = coalesce(auth.uid(), new.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_menu_items_audit_fields on public.menu_items;
create trigger trg_menu_items_audit_fields
before insert or update on public.menu_items
for each row execute function public.set_menu_items_audit_fields();

create or replace function public.add_menu_items_for_date(
  p_menu_date date,
  p_company_slug text,
  p_items jsonb,
  p_request_id text default null
)
returns setof public.menu_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_slug text;
  v_company public.companies%rowtype;
  v_today date;
  v_departure_at timestamptz;
  v_deadline_at timestamptz;
  v_deadline_label text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_menu_date is null then
    raise exception 'menu_date_required';
  end if;

  v_company_slug = lower(nullif(trim(coalesce(p_company_slug, 'global')), ''));
  v_company_slug = coalesce(v_company_slug, 'global');
  v_today = (now() at time zone 'America/Argentina/Buenos_Aires')::date;

  if p_menu_date < v_today then
    raise exception 'menu_date_in_past';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'menu_items_must_be_array';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where nullif(trim(coalesce(item.value->>'id', '')), '') is not null
  ) then
    raise exception 'menu_add_only_accepts_new_items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where nullif(trim(coalesce(item.value->>'name', '')), '') is null
  ) then
    raise exception 'menu_item_name_required';
  end if;

  if v_company_slug = 'global' then
    if not public.is_admin() then
      raise exception 'not_authorized';
    end if;
  else
    if not public.is_company_admin(v_company_slug) then
      raise exception 'not_authorized';
    end if;

    select *
    into v_company
    from public.companies
    where slug = v_company_slug;

    if not found then
      raise exception 'company_not_found';
    end if;

    v_departure_at = (p_menu_date::timestamp + v_company.menu_service_departure_time) at time zone 'America/Argentina/Buenos_Aires';
    v_deadline_at = v_departure_at - make_interval(mins => v_company.menu_add_cutoff_minutes);

    if now() > v_deadline_at then
      v_deadline_label = to_char(v_deadline_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
      raise exception 'menu_add_cutoff_expired:%', v_deadline_label;
    end if;
  end if;

  return query
  insert into public.menu_items (
    name,
    description,
    menu_date,
    company_slug,
    created_by,
    updated_by
  )
  select
    trim(item.value->>'name'),
    nullif(trim(coalesce(item.value->>'description', '')), ''),
    p_menu_date,
    v_company_slug,
    auth.uid(),
    auth.uid()
  from jsonb_array_elements(p_items) with ordinality as item(value, position)
  order by item.position
  returning public.menu_items.*;
end;
$$;

revoke all on function public.add_menu_items_for_date(date, text, jsonb, text) from public;
revoke all on function public.add_menu_items_for_date(date, text, jsonb, text) from anon;
grant execute on function public.add_menu_items_for_date(date, text, jsonb, text) to authenticated;

comment on column public.companies.menu_service_departure_time is
  'Hora programada de salida/cierre del pedido para validar altas de opciones de menú en America/Argentina/Buenos_Aires.';

comment on column public.companies.menu_add_cutoff_minutes is
  'Minutos antes de menu_service_departure_time hasta los que administradores pueden agregar opciones de menú.';

comment on function public.add_menu_items_for_date(date, text, jsonb, text) is
  'Inserta opciones nuevas de menú sin modificar ni eliminar opciones existentes. Valida rol administrativo y corte horario por empresa.';
