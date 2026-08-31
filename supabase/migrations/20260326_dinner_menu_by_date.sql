-- Table for dinner menu options by delivery date
create table if not exists public.dinner_menu_by_date (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  company text null,
  title text not null,
  options text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_date, company)
);

create index if not exists dinner_menu_by_date_delivery_idx
  on public.dinner_menu_by_date (delivery_date);

create index if not exists dinner_menu_by_date_company_idx
  on public.dinner_menu_by_date (company);
