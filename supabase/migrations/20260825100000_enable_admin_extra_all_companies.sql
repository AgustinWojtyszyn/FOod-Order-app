-- Allow administrative extra orders for every configured company.
-- The previous location validator only whitelisted the original companies, so
-- newer companies such as Greif, Placo and Molinos failed with 400/location_not_allowed.

insert into public.companies (slug, name)
values
  ('ccp', 'Ccp'),
  ('laja', 'La Laja'),
  ('padrebueno', 'Padre Bueno'),
  ('losberros', 'Los Berros'),
  ('genneia', 'Genneia'),
  ('distro_cuyo', 'DistroCuyo'),
  ('epse', 'EPSE'),
  ('greif', 'Greif'),
  ('placo', 'Placo'),
  ('molinos', 'Molinos'),
  ('administracion_servifood', 'Administración ServiFood')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();

create or replace function public.admin_extra_company_location_allowed(
  p_company_slug text,
  p_location text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with input as (
    select
      lower(trim(coalesce(p_company_slug, ''))) as company_slug,
      lower(trim(coalesce(p_location, ''))) as raw_location
  ),
  normalized as (
    select
      company_slug,
      replace(replace(replace(replace(replace(replace(raw_location, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u') as location
    from input
  ),
  company_match as (
    select exists (
      select 1
      from public.companies c
      cross join normalized n
      where lower(trim(c.slug)) = n.company_slug
        and replace(replace(replace(replace(replace(replace(lower(trim(c.name)), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u') = n.location
    ) as allowed
  ),
  location_match as (
    select exists (
      select 1
      from public.order_locations loc
      join public.order_organizations org on org.id = loc.organization_id
      cross join normalized n
      where loc.active = true
        and org.active = true
        and (
          lower(trim(org.code)) = n.company_slug
          or replace(replace(replace(replace(replace(replace(lower(trim(org.name)), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u') = n.company_slug
        )
        and (
          replace(replace(replace(replace(replace(replace(lower(trim(loc.display_name)), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u') = n.location
          or replace(replace(replace(replace(replace(replace(lower(trim(loc.code)), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u') = n.location
          or replace(replace(replace(replace(replace(replace(lower(trim(loc.slug)), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u') = n.location
        )
    ) as allowed
  )
  select
    coalesce(company_match.allowed, false)
    or coalesce(location_match.allowed, false)
  from company_match, location_match;
$$;

revoke all on function public.admin_extra_company_location_allowed(text, text) from public;
revoke all on function public.admin_extra_company_location_allowed(text, text) from anon;
grant execute on function public.admin_extra_company_location_allowed(text, text) to authenticated;
