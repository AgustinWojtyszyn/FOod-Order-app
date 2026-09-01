begin;

create or replace function public.normalize_company_remito_slug(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with normalized as (
    select trim(both '_' from regexp_replace(
      translate(lower(trim(coalesce(p_value, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      '_',
      'g'
    )) as slug
  )
  select case
    when slug = 'ccp' or slug like 'ccp_%' then 'ccp'
    when slug in ('distrocuyo', 'distro_cuyo') or slug like 'distrocuyo_%' or slug like 'distro_cuyo_%' then 'distro_cuyo'
    when slug = 'epse' or slug like 'epse_%' then 'epse'
    when slug = 'genneia' or slug like 'genneia_%' then 'genneia'
    when slug in ('la_laja', 'laja') or slug like 'la_laja_%' or slug like 'laja_%' then 'laja'
    when slug in ('los_berros', 'losberros') or slug like 'los_berros_%' or slug like 'losberros_%' then 'losberros'
    when slug in ('padre_bueno', 'padrebueno') or slug like 'padre_bueno_%' or slug like 'padrebueno_%' then 'padrebueno'
    when slug = 'greif' or slug like 'greif_%' then 'greif'
    when slug = 'placo' or slug like 'placo_%' then 'placo'
    when slug = 'molinos' or slug like 'molinos_%' then 'molinos'
    when slug = 'igarreta' or slug like 'igarreta_%' then 'igarreta'
    when slug = 'isemar' or slug like 'isemar_%' then 'isemar'
    when slug in ('global', 'general') then 'global'
    when slug in (
      'administracion',
      'administracion_servifood',
      'administracion_servi_food',
      'admin_servifood',
      'admin_servi_food'
    ) then 'administracion_servifood'
    else slug
  end
  from normalized;
$$;

insert into public.companies (slug, name, remito_start_number, remito_end_number, next_remito_number)
values ('isemar', 'ISEMAR', 120000, 129999, 120000)
on conflict (slug) do update
set name = excluded.name,
    remito_start_number = excluded.remito_start_number,
    remito_end_number = excluded.remito_end_number,
    next_remito_number = case
      when public.companies.next_remito_number between excluded.remito_start_number and excluded.remito_end_number + 1
        then public.companies.next_remito_number
      else excluded.next_remito_number
    end,
    updated_at = now();

insert into public.order_organizations (code, name, active)
values ('ISEMAR', 'ISEMAR', true)
on conflict (code) do update
set name = excluded.name,
    active = true,
    updated_at = now();

with organization as (
  select id
  from public.order_organizations
  where code = 'ISEMAR'
),
locations(code, slug, display_name) as (
  values
    ('ISEMAR_PREDIO_1', 'isemar_predio_1', 'ISEMAR – PREDIO 1'),
    ('ISEMAR_PREDIO_2', 'isemar_predio_2', 'ISEMAR – PREDIO 2')
)
insert into public.order_locations (organization_id, code, slug, display_name, active)
select organization.id, locations.code, locations.slug, locations.display_name, true
from organization
cross join locations
on conflict (code) do update
set organization_id = excluded.organization_id,
    slug = excluded.slug,
    display_name = excluded.display_name,
    active = true,
    updated_at = now();

notify pgrst, 'reload schema';

commit;
