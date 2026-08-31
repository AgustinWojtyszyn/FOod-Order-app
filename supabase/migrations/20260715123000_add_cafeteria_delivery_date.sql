alter table public.cafeteria_orders
  add column if not exists delivery_date date;

create index if not exists cafeteria_orders_delivery_status_idx
  on public.cafeteria_orders (delivery_date, status);

create index if not exists cafeteria_orders_user_delivery_status_idx
  on public.cafeteria_orders (user_id, delivery_date, status);
