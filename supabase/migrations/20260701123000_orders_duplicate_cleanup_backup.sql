-- Backup table for manual historical order cleanup operations.
-- Created after the 2026-07-01 cleanup of duplicated archived orders from 2026-06-23.
-- This migration is intentionally non-destructive.

create table if not exists public.orders_duplicate_cleanup_backup (
  cleanup_label text not null,
  order_id uuid not null,
  backed_up_at timestamptz not null default now(),
  row_data jsonb not null,
  primary key (cleanup_label, order_id)
);

comment on table public.orders_duplicate_cleanup_backup is
  'Stores full JSON backups of orders removed during manual duplicate cleanup operations.';

comment on column public.orders_duplicate_cleanup_backup.cleanup_label is
  'Human-readable identifier for a specific cleanup operation.';

comment on column public.orders_duplicate_cleanup_backup.order_id is
  'Original orders.id value backed up before cleanup.';

comment on column public.orders_duplicate_cleanup_backup.row_data is
  'Full JSONB snapshot of the original orders row before deletion.';
