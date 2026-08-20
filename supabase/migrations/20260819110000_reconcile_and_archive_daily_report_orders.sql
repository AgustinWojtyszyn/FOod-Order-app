-- Reconcile admin extras created after the report cutoff, then archive only older pending orders.
-- Idempotent: repeated calls only update rows that still match the source status.

create or replace function public.archive_orders_after_daily_report(
  p_delivery_date date
)
returns table (
  report_found boolean,
  report_status text,
  sent_at timestamptz,
  reclassified_count integer,
  archived_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sent_at timestamptz;
  v_report_status text;
  v_reclassified_count integer := 0;
  v_archived_count integer := 0;
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'not authenticated';
  end if;

  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;

  select drr.status, drr.sent_at
  into v_report_status, v_sent_at
  from public.daily_report_runs drr
  where drr.report_date = p_delivery_date
    and drr.report_type = 'daily_orders'
    and drr.status = 'sent'
    and drr.sent_at is not null
  for update;

  if not found then
    return query select false, null::text, null::timestamptz, 0, 0;
    return;
  end if;

  update public.orders
  set status = 'post_report_extra',
      updated_at = now()
  where delivery_date = p_delivery_date
    and status = 'pending'
    and lower(coalesce(order_origin, 'user')) = 'admin_extra'
    and created_at >= v_sent_at;
  get diagnostics v_reclassified_count = row_count;

  update public.orders
  set status = 'archived',
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where delivery_date = p_delivery_date
    and status = 'pending'
    and not (
      lower(coalesce(order_origin, 'user')) = 'admin_extra'
      and created_at >= v_sent_at
    );
  get diagnostics v_archived_count = row_count;

  return query select true, v_report_status, v_sent_at, v_reclassified_count, v_archived_count;
end;
$$;

revoke all on function public.archive_orders_after_daily_report(date) from public;
revoke all on function public.archive_orders_after_daily_report(date) from anon;
grant execute on function public.archive_orders_after_daily_report(date) to authenticated;
