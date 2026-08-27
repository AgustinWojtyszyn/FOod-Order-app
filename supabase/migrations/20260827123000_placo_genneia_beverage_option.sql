begin;

alter table public.custom_options
  add column if not exists title text,
  add column if not exists active boolean not null default true,
  add column if not exists meal_scope text not null default 'both',
  add column if not exists days_of_week integer[],
  add column if not exists only_holidays boolean not null default false,
  add column if not exists exclude_holidays boolean not null default false;

with updated as (
  update public.custom_options
  set title = 'Bebidas (solo Genneia)',
      name = 'Bebidas (solo Genneia)',
      label = 'Bebidas (solo Genneia)',
      type = 'multiple_choice',
      options = '["Agua", "Soda", "Agua saborizada", "Coca cola", "Coca Zero"]'::jsonb,
      required = true,
      active = true,
      enabled = true,
      meal_scope = 'both',
      meal = 'both',
      order_position = 0,
      updated_at = now()
  where lower(trim(coalesce(company, ''))) = 'placo'
    and lower(trim(coalesce(title, name, label, ''))) in (
      'bebida',
      'bebidas',
      'bebidas (solo genneia)'
    )
  returning id
)
insert into public.custom_options (
  company,
  title,
  name,
  label,
  type,
  options,
  required,
  active,
  enabled,
  meal_scope,
  meal,
  order_position,
  updated_at
)
select
  'placo',
  'Bebidas (solo Genneia)',
  'Bebidas (solo Genneia)',
  'Bebidas (solo Genneia)',
  'multiple_choice',
  '["Agua", "Soda", "Agua saborizada", "Coca cola", "Coca Zero"]'::jsonb,
  true,
  true,
  true,
  'both',
  'both',
  0,
  now()
where not exists (select 1 from updated);

notify pgrst, 'reload schema';

commit;
