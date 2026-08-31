begin;

do $$
declare
  v_epse_org_id uuid;
  v_old_id uuid;
  v_target_id uuid;
begin
  -- Organización EPSE
  select id
  into v_epse_org_id
  from public.order_organizations
  where upper(trim(code)) = 'EPSE'
  limit 1;

  if v_epse_org_id is null then
    raise exception 'No se encontró la organización EPSE';
  end if;

  -- Sede nueva, si ya existe
  select id
  into v_target_id
  from public.order_locations
  where code = 'EPSE_FABRICA_PANELES_SOLARES'
     or slug = 'epse-fabrica-paneles-solares'
     or display_name = 'EPSE – Fábrica de Paneles Solares'
  limit 1;

  -- Sede vieja, si todavía existe
  select id
  into v_old_id
  from public.order_locations
  where code = 'EPSE_OFICINA'
     or slug = 'epse-oficina'
     or display_name in (
       'EPSE – Oficina',
       'EPSE - Oficina',
       'EPSE Oficina'
     )
  limit 1;

  -- Caso 1: existe la vieja y todavía no existe la nueva
  if v_old_id is not null and v_target_id is null then

    update public.order_locations
    set
      organization_id = v_epse_org_id,
      code = 'EPSE_FABRICA_PANELES_SOLARES',
      slug = 'epse-fabrica-paneles-solares',
      display_name = 'EPSE – Fábrica de Paneles Solares',
      active = true
    where id = v_old_id;

    v_target_id := v_old_id;

  -- Caso 2: existen ambas por algún entorno inconsistente
  elsif v_old_id is not null
    and v_target_id is not null
    and v_old_id <> v_target_id then

    update public.orders
    set order_location_id = v_target_id
    where order_location_id = v_old_id;

    update public.orders
    set delivery_order_location_id = v_target_id
    where delivery_order_location_id = v_old_id;

    update public.order_locations
    set default_delivery_location_id = v_target_id
    where default_delivery_location_id = v_old_id;

    delete from public.order_locations
    where id = v_old_id;

  -- Caso 3: no existe ninguna: crear
  elsif v_target_id is null then

    insert into public.order_locations (
      organization_id,
      code,
      slug,
      display_name,
      active
    )
    values (
      v_epse_org_id,
      'EPSE_FABRICA_PANELES_SOLARES',
      'epse-fabrica-paneles-solares',
      'EPSE – Fábrica de Paneles Solares',
      true
    )
    returning id into v_target_id;

  end if;

  -- Canonizar la fila final
  update public.order_locations
  set
    organization_id = v_epse_org_id,
    code = 'EPSE_FABRICA_PANELES_SOLARES',
    slug = 'epse-fabrica-paneles-solares',
    display_name = 'EPSE – Fábrica de Paneles Solares',
    active = true
  where id = v_target_id;

  -- Corregir cualquier pedido histórico que todavía conserve el nombre/código viejo
  update public.orders
  set
    organization = 'EPSE',

    location = case
      when location in ('EPSE – Oficina', 'EPSE - Oficina', 'EPSE Oficina')
        then 'EPSE – Fábrica de Paneles Solares'
      else location
    end,

    requesting_location_code = case
      when requesting_location_code = 'EPSE_OFICINA'
        then 'EPSE_FABRICA_PANELES_SOLARES'
      else requesting_location_code
    end,

    order_location_id = case
      when requesting_location_code = 'EPSE_OFICINA'
        or location in ('EPSE – Oficina', 'EPSE - Oficina', 'EPSE Oficina')
        then v_target_id
      else order_location_id
    end,

    delivery_location = case
      when delivery_location in ('EPSE – Oficina', 'EPSE - Oficina', 'EPSE Oficina')
        then 'EPSE – Fábrica de Paneles Solares'
      else delivery_location
    end,

    delivery_location_code = case
      when delivery_location_code = 'EPSE_OFICINA'
        then 'EPSE_FABRICA_PANELES_SOLARES'
      else delivery_location_code
    end,

    delivery_order_location_id = case
      when delivery_location_code = 'EPSE_OFICINA'
        or delivery_location in ('EPSE – Oficina', 'EPSE - Oficina', 'EPSE Oficina')
        then v_target_id
      else delivery_order_location_id
    end

  where
       requesting_location_code = 'EPSE_OFICINA'
    or delivery_location_code = 'EPSE_OFICINA'
    or location in ('EPSE – Oficina', 'EPSE - Oficina', 'EPSE Oficina')
    or delivery_location in ('EPSE – Oficina', 'EPSE - Oficina', 'EPSE Oficina');

end $$;

commit;


-- Verificación final
select
  org.code as organization,
  loc.code,
  loc.slug,
  loc.display_name,
  loc.active,
  coalesce(delivery.display_name, loc.display_name) as delivery_location
from public.order_locations loc
join public.order_organizations org
  on org.id = loc.organization_id
left join public.order_locations delivery
  on delivery.id = loc.default_delivery_location_id
where loc.code = 'EPSE_FABRICA_PANELES_SOLARES';

select
  count(*) as remaining_old_references
from public.orders
where requesting_location_code = 'EPSE_OFICINA'
   or delivery_location_code = 'EPSE_OFICINA'
   or location ilike '%EPSE%Oficina%'
   or delivery_location ilike '%EPSE%Oficina%';
   