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

with ranges(slug, name, remito_start_number, remito_end_number, fallback_next_number) as (
  values
    ('ccp', 'Ccp', 10000, 19999, 10000),
    ('distro_cuyo', 'DistroCuyo', 20000, 29999, 20000),
    ('epse', 'EPSE', 30000, 39999, 30000),
    ('genneia', 'Genneia', 40000, 49999, 40000),
    ('laja', 'La Laja', 50000, 59999, 50000),
    ('losberros', 'Los Berros', 60000, 69999, 60000),
    ('padrebueno', 'Padre Bueno', 70000, 79999, 70000),
    ('greif', 'Greif', 80000, 89999, 80000),
    ('molinos', 'Molinos', 90000, 99999, 90000),
    ('placo', 'Placo', 100000, 109999, 100000)
)
insert into public.companies (
  slug,
  name,
  remito_start_number,
  remito_end_number,
  next_remito_number
)
select
  slug,
  name,
  remito_start_number,
  remito_end_number,
  fallback_next_number
from ranges
where true
on conflict (slug) do update
set name = coalesce(nullif(trim(excluded.name), ''), public.companies.name),
    remito_start_number = excluded.remito_start_number,
    remito_end_number = excluded.remito_end_number,
    next_remito_number = case
      when public.companies.next_remito_number between excluded.remito_start_number and excluded.remito_end_number + 1
        then public.companies.next_remito_number
      else excluded.next_remito_number
    end,
    updated_at = now();

with ranges(slug, remito_start_number, remito_end_number) as (
  values
    ('ccp', 10000, 19999),
    ('distro_cuyo', 20000, 29999),
    ('epse', 30000, 39999),
    ('genneia', 40000, 49999),
    ('laja', 50000, 59999),
    ('losberros', 60000, 69999),
    ('padrebueno', 70000, 79999),
    ('greif', 80000, 89999),
    ('molinos', 90000, 99999),
    ('placo', 100000, 109999)
),
issued as (
  select
    c.slug,
    max(cr.remito_number)::integer as last_remito_number
  from public.companies c
  join ranges r on r.slug = c.slug
  left join public.company_remitos cr
    on cr.company_id = c.id
   and cr.status = 'issued'
   and cr.remito_number between r.remito_start_number and r.remito_end_number
  group by c.slug
)
update public.companies c
set remito_start_number = r.remito_start_number,
    remito_end_number = r.remito_end_number,
    next_remito_number = least(
      r.remito_end_number + 1,
      greatest(
        case
          when c.next_remito_number between r.remito_start_number and r.remito_end_number + 1
            then c.next_remito_number
          else r.remito_start_number
        end,
        coalesce(i.last_remito_number + 1, r.remito_start_number),
        r.remito_start_number
      )
    ),
    updated_at = now()
from ranges r
left join issued i on i.slug = r.slug
where c.slug = r.slug;

insert into public.companies (slug, name, remito_start_number, remito_end_number, next_remito_number)
values ('administracion_servifood', 'Administración ServiFood', null, null, null)
on conflict (slug) do update
set name = coalesce(nullif(trim(excluded.name), ''), public.companies.name),
    remito_start_number = null,
    remito_end_number = null,
    next_remito_number = null,
    updated_at = now();

update public.companies
set remito_start_number = null,
    remito_end_number = null,
    next_remito_number = null,
    updated_at = now()
where slug = 'global';

notify pgrst, 'reload schema';

commit;
