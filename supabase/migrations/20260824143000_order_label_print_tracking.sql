begin;

alter table public.orders
  add column if not exists label_printed_at timestamptz,
  add column if not exists label_printed_by uuid references auth.users(id) on delete set null,
  add column if not exists label_print_count integer not null default 0;

alter table public.orders
  drop constraint if exists orders_label_print_count_non_negative;

alter table public.orders
  add constraint orders_label_print_count_non_negative
  check (label_print_count >= 0);

create index if not exists orders_label_printed_at_idx
  on public.orders (label_printed_at);

create or replace function public.mark_order_labels_printed(p_order_ids uuid[])
returns table (
  id uuid,
  label_printed_at timestamptz,
  label_printed_by uuid,
  label_print_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_ids uuid[] := coalesce(p_order_ids, array[]::uuid[]);
  v_printed_at timestamptz := now();
  v_actor_email text;
  v_actor_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if cardinality(v_order_ids) = 0 then
    return;
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  update public.orders as o
  set label_printed_at = v_printed_at,
      label_printed_by = auth.uid(),
      label_print_count = coalesce(o.label_print_count, 0) + 1,
      updated_at = now()
  where o.id = any(v_order_ids)
    and (
      public.is_admin()
      or public.is_company_admin(lower(trim(coalesce(nullif(o.company_slug, ''), o.location, ''))))
    );

  if to_regclass('public.audit_logs') is not null then
    select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
    into v_actor_email, v_actor_name
    from public.users as u
    where u.id = auth.uid();

    insert into public.audit_logs (
      action,
      details,
      actor_id,
      actor_email,
      actor_name,
      metadata,
      created_at
    )
    values (
      'order_labels_printed',
      'Etiquetas impresas',
      auth.uid(),
      v_actor_email,
      v_actor_name,
      jsonb_build_object(
        'order_ids', to_jsonb(v_order_ids),
        'printed_at', v_printed_at,
        'count', cardinality(v_order_ids)
      ),
      now()
    );
  end if;

  return query
  select
    o.id,
    o.label_printed_at,
    o.label_printed_by,
    o.label_print_count
  from public.orders as o
  where o.id = any(v_order_ids)
  order by o.label_printed_at desc nulls last;
end;
$$;

revoke all on function public.mark_order_labels_printed(uuid[]) from public;
revoke all on function public.mark_order_labels_printed(uuid[]) from anon;
grant execute on function public.mark_order_labels_printed(uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
