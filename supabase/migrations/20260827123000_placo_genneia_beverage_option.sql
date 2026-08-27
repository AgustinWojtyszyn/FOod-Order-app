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
      type = 'multiple_choice',
      options = '["Agua", "Soda", "Agua saborizada", "Coca cola", "Coca Zero"]'::jsonb,
      required = true,
      active = true,
      meal_scope = 'both',
      order_position = 0,
      updated_at = now()
  where lower(trim(coalesce(company, ''))) = 'placo'
    and lower(trim(coalesce(title, ''))) in (
      'bebida',
      'bebidas',
      'bebidas (solo genneia)'
    )
  returning id
)
insert into public.custom_options (
  company,
  title,
  type,
  options,
  required,
  active,
  meal_scope,
  order_position,
  updated_at
)
select
  'placo',
  'Bebidas (solo Genneia)',
  'multiple_choice',
  '["Agua", "Soda", "Agua saborizada", "Coca cola", "Coca Zero"]'::jsonb,
  true,
  true,
  'both',
  0,
  now()
where not exists (select 1 from updated);

notify pgrst, 'reload schema';

commit;
