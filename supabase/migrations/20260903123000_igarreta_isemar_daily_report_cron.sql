create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_igarreta_isemar_daily_report()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  function_url text;
  cron_secret text;
begin
  select decrypted_secret
    into function_url
  from vault.decrypted_secrets
  where name = 'DAILY_ORDERS_REPORT_FUNCTION_URL'
  limit 1;

  if function_url is null then
    select rtrim(decrypted_secret, '/') || '/functions/v1/daily-orders-report'
      into function_url
    from vault.decrypted_secrets
    where name = 'SUPABASE_URL'
    limit 1;
  end if;

  select decrypted_secret
    into cron_secret
  from vault.decrypted_secrets
  where name = 'CRON_SECRET'
  limit 1;

  if function_url is null or cron_secret is null then
    raise exception 'missing vault secrets DAILY_ORDERS_REPORT_FUNCTION_URL or SUPABASE_URL, and CRON_SECRET';
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
    body := jsonb_build_object('mode', 'sendIgarretaIsemar')
  );
end;
$$;

do $$
begin
  perform cron.unschedule('igarreta-isemar-daily-report-0105-utc');
exception when others then null;
end;
$$;

select cron.schedule(
  'igarreta-isemar-daily-report-0105-utc',
  '5 1 * * *',
  $$select public.invoke_igarreta_isemar_daily_report();$$
);