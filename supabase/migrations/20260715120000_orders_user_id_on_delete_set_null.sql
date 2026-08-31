do $$
declare
  update_rule text := 'NO ACTION';
  existing_fk record;
  user_id_attnum smallint;
begin
  select a.attnum
  into user_id_attnum
  from pg_attribute a
  where a.attrelid = 'public.orders'::regclass
    and a.attname = 'user_id'
    and not a.attisdropped;

  if user_id_attnum is null then
    raise exception 'public.orders.user_id column does not exist';
  end if;

  alter table public.orders
    alter column user_id drop not null;

  select
    c.conname,
    c.confrelid,
    c.confdeltype,
    c.confupdtype,
    case c.confupdtype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else 'NO ACTION'
    end as update_rule
  into existing_fk
  from pg_constraint c
  where c.conrelid = 'public.orders'::regclass
    and c.contype = 'f'
    and c.conkey = array[user_id_attnum]::smallint[]
  order by (c.conname = 'orders_user_id_fkey') desc
  limit 1;

  if existing_fk.conname is not null
    and existing_fk.confrelid = 'auth.users'::regclass
    and existing_fk.confdeltype = 'n'
  then
    return;
  end if;

  if existing_fk.conname is not null then
    update_rule := coalesce(existing_fk.update_rule, update_rule);
    execute format('alter table public.orders drop constraint %I', existing_fk.conname);
  end if;

  alter table public.orders
    drop constraint if exists orders_user_id_fkey;

  execute format(
    'alter table public.orders add constraint orders_user_id_fkey foreign key (user_id) references auth.users(id) on update %s on delete set null',
    coalesce(update_rule, 'NO ACTION')
  );
end $$;
