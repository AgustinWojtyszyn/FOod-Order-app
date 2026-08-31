drop function if exists public.get_daily_report_run_status(date, text);

create function public.get_daily_report_run_status(
  p_report_date date,
  p_report_type text default 'daily_orders'
)
returns table (
  id uuid,
  report_date date,
  report_type text,
  status text,
  orders_count integer,
  recipients_count integer,
  sent_at timestamptz,
  error text,
  created_at timestamptz,
  updated_at timestamptz,
  archive_status text,
  archived_count integer,
  archive_error text,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_report_date is null then
    raise exception 'report_date_required';
  end if;

  return query
  select
    drr.id,
    drr.report_date,
    drr.report_type,
    drr.status,
    drr.orders_count,
    coalesce(array_length(drr.recipients, 1), 0)::integer as recipients_count,
    drr.sent_at,
    drr.error,
    drr.created_at,
    drr.updated_at,
    drr.archive_status,
    drr.archived_count,
    drr.archive_error,
    drr.archived_at
  from public.daily_report_runs drr
  where drr.report_date = p_report_date
    and drr.report_type = coalesce(nullif(p_report_type, ''), 'daily_orders')
  order by drr.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_daily_report_run_status(date, text) from public;
revoke all on function public.get_daily_report_run_status(date, text) from anon;
grant execute on function public.get_daily_report_run_status(date, text) to authenticated;
