alter table public.daily_report_runs
  add column if not exists archive_status text,
  add column if not exists archived_count integer,
  add column if not exists archive_error text,
  add column if not exists archived_at timestamptz;

alter table public.daily_report_runs
  alter column archive_status drop default,
  alter column archive_status drop not null,
  alter column archived_count drop default,
  alter column archived_count drop not null;

alter table public.daily_report_runs
  drop constraint if exists daily_report_runs_archive_status_check,
  add constraint daily_report_runs_archive_status_check
  check (archive_status in ('pending', 'archived', 'failed'));

alter table public.daily_report_runs
  drop constraint if exists daily_report_runs_archived_count_check,
  add constraint daily_report_runs_archived_count_check
  check (archived_count is null or archived_count >= 0);
