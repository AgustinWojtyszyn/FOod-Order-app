import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260806153000_admin_extra_orders.sql', import.meta.url),
  'utf8'
)
const rpcFixMigration = readFileSync(
  new URL('./20260806170000_fix_admin_extra_order_rpc_payload_validation.sql', import.meta.url),
  'utf8'
)
const stabilizationMigration = readFileSync(
  new URL('./20260810120000_stabilize_orders_admin_users_editing.sql', import.meta.url),
  'utf8'
)
const retroactiveRemitosMigration = readFileSync(
  new URL('./20260810143000_retroactive_company_remitos.sql', import.meta.url),
  'utf8'
)
const lateAdminExtraOrdersMigration = readFileSync(
  new URL('./20260812100000_late_admin_extra_orders.sql', import.meta.url),
  'utf8'
)
const refreshCompanyRemitosMigration = readFileSync(
  new URL('./20260812133000_refresh_company_remito_snapshots.sql', import.meta.url),
  'utf8'
)
const adminOrderReasonAuditMigration = readFileSync(
  new URL('./20260812150000_admin_order_reason_audit.sql', import.meta.url),
  'utf8'
)
const newAccountOrderFixMigration = readFileSync(
  new URL('./20260813143000_fix_new_account_order_creation.sql', import.meta.url),
  'utf8'
)
const postReportExtraOrdersMigration = readFileSync(
  new URL('./20260818120000_post_report_extra_orders.sql', import.meta.url),
  'utf8'
)
const reportArchiveReconciliationMigration = readFileSync(
  new URL('./20260819110000_reconcile_and_archive_daily_report_orders.sql', import.meta.url),
  'utf8'
)
const cancelEpseDuplicateRemitoMigration = readFileSync(
  new URL('./20260820120000_cancel_epse_30005_duplicate_remito.sql', import.meta.url),
  'utf8'
)
const issueCompanyRemitoAmbiguityFixMigration = readFileSync(
  new URL('./20260820130000_fix_issue_company_remito_status_ambiguity.sql', import.meta.url),
  'utf8'
)
const lateAdminExtraExtendedWindowMigration = readFileSync(
  new URL('./20260821120000_late_admin_extra_extended_window.sql', import.meta.url),
  'utf8'
)
const dailyOperationalClosuresMigration = readFileSync(
  new URL('./20260821150000_daily_operational_closures.sql', import.meta.url),
  'utf8'
)
const lateAdminExtraHistoryClosuresMigration = readFileSync(
  new URL('./20260821170000_late_admin_extra_history_closures.sql', import.meta.url),
  'utf8'
)
const lateAdminExtraHistoryOnReadBackfillMigration = readFileSync(
  new URL('./20260821173000_late_admin_extra_history_on_read_backfill.sql', import.meta.url),
  'utf8'
)
const lateAdminExtraHistoryWiderDbBackfillMigration = readFileSync(
  new URL('./20260821174500_late_extra_history_wider_db_backfill.sql', import.meta.url),
  'utf8'
)

describe('admin extra orders migration', () => {
  it('creates secure RPCs for scoped creation, listing and deletion', () => {
    expect(migration).toContain('create or replace function public.create_admin_extra_order')
    expect(migration).toContain('create or replace function public.get_daily_orders_for_admin')
    expect(migration).toContain('create or replace function public.delete_admin_extra_order')
    expect(migration).toContain('public.is_company_admin')
    expect(migration).toContain('public.has_company_admin_access()')
  })

  it('restricts deletion to admin extra orders and audits a full snapshot before delete', () => {
    expect(migration).toContain("lower(coalesce(v_order.order_origin, 'user')) <> 'admin_extra'")
    expect(migration).toContain("'admin_extra_order_deleted'")
    expect(migration).toContain("'snapshot', to_jsonb(v_order)")
    expect(migration).toMatch(/delete from public\.orders[\s\S]*lower\(coalesce\(order_origin, 'user'\)\) = 'admin_extra'/)
  })

  it('requires explicit reasons for creation and deletion audit paths', () => {
    expect(migration).toContain("raise exception 'reason_required'")
    expect(migration).toContain('v_reason text := nullif')
  })

  it('keeps guest extra orders supported and avoids unsafe payload casts', () => {
    expect(rpcFixMigration).toContain('alter column user_id drop not null')
    expect(rpcFixMigration).toContain('v_reference := null')
    expect(rpcFixMigration).toContain("v_delivery_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'")
    expect(rpcFixMigration).toContain("coalesce(item->>'quantity', '') ~ '^[0-9]+$'")
    expect(rpcFixMigration).toContain("raise exception 'custom_responses_invalid'")
    expect(rpcFixMigration).not.toContain("raise exception 'customer_reference_required'")
    expect(rpcFixMigration).not.toContain("raise exception 'duplicate_active_order'")
    expect(rpcFixMigration).not.toContain('v_client public.users')
    expect(rpcFixMigration).toContain('drop function if exists public.search_admin_extra_order_people')
    expect(rpcFixMigration).toContain('drop function if exists public.get_admin_extra_order_duplicate')
  })

  it('keeps null-user admin extra orders countable and creates paged admin search', () => {
    expect(stabilizationMigration).toContain('alter column user_id drop not null')
    expect(stabilizationMigration).toContain("'admin_extra:' || o.id::text")
    expect(stabilizationMigration).toContain('create or replace function public.get_admin_people_page')
    expect(stabilizationMigration).toContain('extensions.unaccent')
    expect(stabilizationMigration).toContain("v_role not in ('all', 'admin', 'user')")
    expect(stabilizationMigration).toContain('is_global_admin')
    expect(stabilizationMigration).toContain('is_company_admin')
  })

  it('extends existing remitos with immutable snapshots and idempotent retroactive issuance', () => {
    expect(retroactiveRemitosMigration).toContain('add column if not exists snapshot jsonb')
    expect(retroactiveRemitosMigration).toContain('add column if not exists request_id text')
    expect(retroactiveRemitosMigration).toContain('company_remitos_request_id_unique')
    expect(retroactiveRemitosMigration).toContain('prevent_issued_remito_snapshot_mutation')
    expect(retroactiveRemitosMigration).toContain('create or replace function public.get_company_remitos_for_date')
    expect(retroactiveRemitosMigration).toContain('create or replace function public.issue_company_remito')
    expect(retroactiveRemitosMigration).toContain('for update')
    expect(retroactiveRemitosMigration).toContain("'company_remito_issued'")
    expect(retroactiveRemitosMigration).toContain('public.is_company_admin(v_slug)')
  })

  it('adds Claudia-only late admin extra orders with backend date calculation', () => {
    expect(lateAdminExtraOrdersMigration).toContain('admin_late_extra_order_authorized_accounts')
    expect(lateAdminExtraOrdersMigration).toContain('sarmientoclaudia985@gmail.com')
    expect(lateAdminExtraOrdersMigration).toContain('create or replace function public.create_late_admin_extra_order')
    expect(lateAdminExtraOrdersMigration).toContain("America/Argentina/San_Juan")
    expect(lateAdminExtraOrdersMigration).toContain("v_local_time >= time '22:00:00'")
    expect(lateAdminExtraOrdersMigration).toContain("v_local_time < time '09:00:00'")
    expect(lateAdminExtraOrdersMigration).toContain("raise exception 'late_admin_extra_window_closed'")
    expect(lateAdminExtraOrdersMigration).toContain("'delivery_date', v_operational_date::text")
    expect(lateAdminExtraOrdersMigration).toContain('public.create_admin_extra_order(v_payload)')
    expect(lateAdminExtraOrdersMigration).toContain("'late_admin_extra_order_created'")
  })

  it('refreshes issued remito snapshots without consuming a new number', () => {
    expect(refreshCompanyRemitosMigration).toContain('create or replace function public.refresh_company_remito_snapshot')
    expect(refreshCompanyRemitosMigration).toContain('for update')
    expect(refreshCompanyRemitosMigration).toContain('public.is_company_admin(v_company.slug)')
    expect(refreshCompanyRemitosMigration).toContain("v_existing.status <> 'issued'")
    expect(refreshCompanyRemitosMigration).toContain('remito_orders_mismatch')
    expect(refreshCompanyRemitosMigration).toContain('p_snapshot->>\'remitoNumber\'')
    expect(refreshCompanyRemitosMigration).toContain('o.delivery_date = v_existing.delivery_date')
    expect(refreshCompanyRemitosMigration).toContain("o.status = any(array['pending', 'archived'])")
    expect(refreshCompanyRemitosMigration).toContain("set_config('app.allow_issued_remito_snapshot_refresh', 'on', true)")
    expect(refreshCompanyRemitosMigration).toContain('old.remito_number is distinct from new.remito_number')
    expect(refreshCompanyRemitosMigration).toContain('set order_ids = coalesce(p_order_ids, array[]::uuid[])')
    expect(refreshCompanyRemitosMigration).toContain('updated_by = auth.uid()')
    expect(refreshCompanyRemitosMigration).toContain('snapshot_version = coalesce(snapshot_version, 1) + 1')
    expect(refreshCompanyRemitosMigration).toContain("'delivery_note_updated'")
    expect(refreshCompanyRemitosMigration).not.toContain('next_remito_number')
  })

  it('requires reason and audits previous/new values for admin order edits and cancellations', () => {
    expect(adminOrderReasonAuditMigration).toContain('create or replace function public.admin_update_order_with_reason')
    expect(adminOrderReasonAuditMigration).toContain('create or replace function public.admin_cancel_order_with_reason')
    expect(adminOrderReasonAuditMigration).toContain("raise exception 'reason_required'")
    expect(adminOrderReasonAuditMigration).toContain('public.is_admin()')
    expect(adminOrderReasonAuditMigration).toContain('for update')
    expect(adminOrderReasonAuditMigration).toContain("'previous', to_jsonb(v_old)")
    expect(adminOrderReasonAuditMigration).toContain("'new', to_jsonb(v_new)")
    expect(adminOrderReasonAuditMigration).toContain("'responsible', jsonb_build_object")
    expect(adminOrderReasonAuditMigration).toContain("'reason', v_reason")
    expect(adminOrderReasonAuditMigration).toContain("'admin_order_updated'")
    expect(adminOrderReasonAuditMigration).toContain("'admin_order_cancelled'")
  })

  it('keeps new Auth accounts able to create regular orders', () => {
    expect(newAccountOrderFixMigration).toContain('create or replace function public.create_order_idempotent')
    expect(newAccountOrderFixMigration).toContain('insert into public.users (id, email, full_name, role, created_at, updated_at)')
    expect(newAccountOrderFixMigration).toContain('on conflict (id) do update')
    expect(newAccountOrderFixMigration).toContain('auth.jwt()->>\'email\'')
    expect(newAccountOrderFixMigration).toContain('v_requires_contact_authorization := upper(coalesce(v_organization.code, \'\')) <> \'EPSE\'')
    expect(newAccountOrderFixMigration).toContain('from public.authorized_order_contacts c')
    expect(newAccountOrderFixMigration).toContain('if not public.is_admin() and v_requires_contact_authorization')
    expect(newAccountOrderFixMigration).toContain('create or replace function public.resolve_order_delivery_snapshot')
    expect(newAccountOrderFixMigration).toContain("notify pgrst, 'reload schema'")
  })

  it('adds post-report extra status with guarded historical backfill', () => {
    expect(postReportExtraOrdersMigration).toContain("'post_report_extra'")
    expect(postReportExtraOrdersMigration).toContain('create or replace function public.resolve_admin_extra_order_status')
    expect(postReportExtraOrdersMigration).toContain('drr.report_type = \'daily_orders\'')
    expect(postReportExtraOrdersMigration).toContain('drr.status = \'sent\'')
    expect(postReportExtraOrdersMigration).toContain('drr.sent_at <= p_created_at')
    expect(postReportExtraOrdersMigration).toContain('v_status := public.resolve_admin_extra_order_status(v_delivery_date, v_created_at)')
    expect(postReportExtraOrdersMigration).not.toContain('v_count <> 12')
    expect(postReportExtraOrdersMigration).not.toContain('post_report_extra_backfill_count_mismatch')
    expect(postReportExtraOrdersMigration).toContain('drr.sent_at <= o.created_at')
    expect(postReportExtraOrdersMigration).toContain("array['pending', 'archived', 'post_report_extra']")
    expect(postReportExtraOrdersMigration).not.toContain("delivery_date = '2026-08-19'")
  })

  it('reconciles post-report extras before archiving pending orders in one RPC', () => {
    expect(reportArchiveReconciliationMigration).toContain('create or replace function public.archive_orders_after_daily_report')
    expect(reportArchiveReconciliationMigration).toContain("drr.report_type = 'daily_orders'")
    expect(reportArchiveReconciliationMigration).toContain("drr.status = 'sent'")
    expect(reportArchiveReconciliationMigration).toContain('drr.sent_at is not null')
    expect(reportArchiveReconciliationMigration).toContain('for update')
    expect(reportArchiveReconciliationMigration).toContain("lower(coalesce(order_origin, 'user')) = 'admin_extra'")
    expect(reportArchiveReconciliationMigration).toContain("status = 'post_report_extra'")
    expect(reportArchiveReconciliationMigration).toContain('created_at >= v_sent_at')
    expect(reportArchiveReconciliationMigration).toContain("status = 'archived'")
    expect(reportArchiveReconciliationMigration).toContain('return query select false')
    expect(reportArchiveReconciliationMigration).toContain('revoke all on function public.archive_orders_after_daily_report(date)')
    expect(reportArchiveReconciliationMigration).toContain('created_at >= v_sent_at')
    expect(reportArchiveReconciliationMigration).toContain("and status = 'pending'")
  })

  it('cancels only the guarded duplicate EPSE remito without touching orders or reusing the number', () => {
    expect(cancelEpseDuplicateRemitoMigration).toContain("cr.remito_number = 30005")
    expect(cancelEpseDuplicateRemitoMigration).toContain("cr.delivery_date = date '2026-08-20'")
    expect(cancelEpseDuplicateRemitoMigration).toContain("where slug = 'epse'")
    expect(cancelEpseDuplicateRemitoMigration).toContain("cr.status = 'issued'")
    expect(cancelEpseDuplicateRemitoMigration).toContain("cardinality(coalesce(cr.order_ids, array[]::uuid[])) = 44")
    expect(cancelEpseDuplicateRemitoMigration).toContain("= 44")
    expect(cancelEpseDuplicateRemitoMigration).toContain("v_target_count <> 1")
    expect(cancelEpseDuplicateRemitoMigration).toContain("set status = 'cancelled'")
    expect(cancelEpseDuplicateRemitoMigration).toContain('epse_remito_30005_audit_fields_changed')
    expect(cancelEpseDuplicateRemitoMigration).toContain('epse_remito_30005_referenced_orders_guard_failed')
    expect(cancelEpseDuplicateRemitoMigration).toContain('unexpected_active_epse_remitos_after_cancel')
    expect(cancelEpseDuplicateRemitoMigration).toContain('active_epse_remitos_have_duplicate_orders')
    expect(cancelEpseDuplicateRemitoMigration).toContain('orders_modified\', false')
    expect(cancelEpseDuplicateRemitoMigration).toContain('company_remitos_company_date_location_issued_unique')
    expect(cancelEpseDuplicateRemitoMigration).toContain('company_remitos_request_id_issued_unique')
    expect(cancelEpseDuplicateRemitoMigration).toContain("and status = 'issued'")
    expect(cancelEpseDuplicateRemitoMigration).not.toContain('delete from public.orders')
    expect(cancelEpseDuplicateRemitoMigration).not.toContain('update public.orders')
  })

  it('qualifies issue_company_remito status references to avoid PL/pgSQL output ambiguity', () => {
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('create or replace function public.issue_company_remito')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('returns table (')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('status text')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('language plpgsql')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('security definer')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('set search_path = public, pg_temp')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('from public.company_remitos as cr')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('cr.request_id = v_request_id')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain("cr.status = 'issued'")
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('cr.company_id = v_company.id')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('cr.delivery_date = p_delivery_date')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('cr.location_key = v_location_key')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('returning public.company_remitos.*')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('v_existing.status as status')
    expect(issueCompanyRemitoAmbiguityFixMigration).toContain('grant execute on function public.issue_company_remito(text, text, date, uuid[], text, jsonb, text) to authenticated')
    expect(issueCompanyRemitoAmbiguityFixMigration).not.toMatch(/where\s+request_id\s*=\s*v_request_id\s+and\s+status\s*=\s*'issued'/i)
    expect(issueCompanyRemitoAmbiguityFixMigration).not.toMatch(/and\s+status\s*=\s*'issued'/i)
  })

  it('allows configured admin extra accounts in the extended 22-to-18 window without changing post-report status logic', () => {
    expect(lateAdminExtraExtendedWindowMigration).toContain('admin_late_extra_order_authorized_accounts')
    expect(lateAdminExtraExtendedWindowMigration).toContain('is_late_admin_extra_order_authorized')
    expect(lateAdminExtraExtendedWindowMigration).toContain('can_create_late_admin_extra_order')
    expect(lateAdminExtraExtendedWindowMigration).toContain('servifoodrecepcion@gmail.com')
    expect(lateAdminExtraExtendedWindowMigration).toContain('sarmientoclaudia985@gmail.com')
    expect(lateAdminExtraExtendedWindowMigration).toContain('agustinwojtyszyn99@gmail.com')
    expect(lateAdminExtraExtendedWindowMigration).toContain('set active = false')
    expect(lateAdminExtraExtendedWindowMigration).toContain("v_local_time >= time '22:00:00'")
    expect(lateAdminExtraExtendedWindowMigration).toContain("v_local_time < time '18:00:00'")
    expect(lateAdminExtraExtendedWindowMigration).toContain("raise exception 'late_admin_extra_window_closed'")
    expect(lateAdminExtraExtendedWindowMigration).toContain('public.create_admin_extra_order(v_payload)')
    expect(lateAdminExtraExtendedWindowMigration).toContain("'late_admin_extra_not_authorized'")
    expect(lateAdminExtraExtendedWindowMigration).toContain("'extended_window', '22:00-18:00'")
    expect(lateAdminExtraExtendedWindowMigration).toContain("'status', v_order.status")
    expect(lateAdminExtraExtendedWindowMigration).toContain('create or replace function public.delete_admin_extra_order')
    expect(lateAdminExtraExtendedWindowMigration).toContain("a.action = 'late_admin_extra_order_created'")
    expect(lateAdminExtraExtendedWindowMigration).toContain('v_is_late_extra and not public.is_late_admin_extra_order_authorized')
    expect(lateAdminExtraExtendedWindowMigration).toContain("'late_admin_extra', v_is_late_extra")
  })

  it('adds idempotent daily operational closures without issuing or renumbering remitos', () => {
    expect(dailyOperationalClosuresMigration).toContain('create table if not exists public.daily_operational_closures')
    expect(dailyOperationalClosuresMigration).toContain('delivery_date date not null unique')
    expect(dailyOperationalClosuresMigration).toContain('late_window_start timestamptz not null')
    expect(dailyOperationalClosuresMigration).toContain('closure_at timestamptz not null')
    expect(dailyOperationalClosuresMigration).toContain('snapshot jsonb not null')
    expect(dailyOperationalClosuresMigration).toContain('anomalies jsonb not null')
    expect(dailyOperationalClosuresMigration).toContain('create or replace function public.close_daily_operational_day')
    expect(dailyOperationalClosuresMigration).toContain('create or replace function public.get_daily_operational_closure')
    expect(dailyOperationalClosuresMigration).toContain("now() at time zone 'America/Argentina/Buenos_Aires')::date - 1")
    expect(dailyOperationalClosuresMigration).toContain('make_timestamptz')
    expect(dailyOperationalClosuresMigration).toContain('22, 0, 0, v_timezone')
    expect(dailyOperationalClosuresMigration).toContain('18, 0, 0, v_timezone')
    expect(dailyOperationalClosuresMigration).toContain('o.created_at < v_closure_at')
    expect(dailyOperationalClosuresMigration).toContain('o.created_at >= v_closure_at')
    expect(dailyOperationalClosuresMigration).toContain('if found and not coalesce(p_rebuild, false) then')
    expect(dailyOperationalClosuresMigration).toContain('v_next_version := coalesce(v_existing.version, 1) + 1')
    expect(dailyOperationalClosuresMigration).toContain('daily_operational_closure_created')
    expect(dailyOperationalClosuresMigration).toContain('daily_operational_closure_rebuilt')
    expect(dailyOperationalClosuresMigration).toContain('admin_order_updated')
    expect(dailyOperationalClosuresMigration).toContain('admin_order_cancelled')
    expect(dailyOperationalClosuresMigration).toContain('admin_extra_order_deleted')
    expect(dailyOperationalClosuresMigration).toContain('late_admin_extra_order_created')
    expect(dailyOperationalClosuresMigration).toContain('order_created_after_closure')
    expect(dailyOperationalClosuresMigration).toContain('order_not_reconstructible_exactly')
    expect(dailyOperationalClosuresMigration).toContain('order_without_resolvable_company_or_location')
    expect(dailyOperationalClosuresMigration).toContain('multiple_active_remitos_for_logical_key')
    expect(dailyOperationalClosuresMigration).toContain('remito_references_missing_order')
    expect(dailyOperationalClosuresMigration).toContain('remito_requires_refresh')
    expect(dailyOperationalClosuresMigration).toContain('public.daily_operational_jsonb_int')
    expect(dailyOperationalClosuresMigration).toContain('security definer')
    expect(dailyOperationalClosuresMigration).toContain('set search_path = public, pg_temp')
    expect(dailyOperationalClosuresMigration).toContain('revoke all on function public.close_daily_operational_day(date, boolean) from public')
    expect(dailyOperationalClosuresMigration).toContain('grant execute on function public.close_daily_operational_day(date, boolean) to authenticated')
    expect(dailyOperationalClosuresMigration).toContain('grant execute on function public.get_daily_operational_closure(date) to authenticated')
    expect(dailyOperationalClosuresMigration).not.toContain('issue_company_remito')
    expect(dailyOperationalClosuresMigration).not.toContain('next_remito_number')
    expect(dailyOperationalClosuresMigration).not.toContain('insert into public.company_remitos')
  })

  it('adds permanent late-admin-extra history and restricted operational closures', () => {
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create table if not exists public.late_admin_extra_order_history')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create table if not exists public.late_admin_extra_order_closures')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create table if not exists public.late_admin_extra_history_authorized_accounts')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('can_manage_late_extra_history')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('sarmientoclaudia985@gmail.com')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('agustinwojtyszyn99@gmail.com')
    expect(lateAdminExtraHistoryClosuresMigration).toContain("lower(coalesce(u.email, '')) like '%jessica%'")
    expect(lateAdminExtraHistoryClosuresMigration).toContain("lower(coalesce(u.email, '')) like '%jesica%'")
    expect(lateAdminExtraHistoryClosuresMigration).not.toContain('servifoodrecepcion@gmail.com')
    expect(lateAdminExtraHistoryClosuresMigration).toContain("time '22:00:00'")
    expect(lateAdminExtraHistoryClosuresMigration).toContain("time '18:00:00'")
    expect(lateAdminExtraHistoryClosuresMigration).toContain('America/Argentina/Buenos_Aires')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create or replace function public.create_late_admin_extra_order')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('perform public.insert_late_admin_extra_order_history')
    expect(lateAdminExtraHistoryClosuresMigration).toContain("'snapshot', to_jsonb(v_order)")
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create or replace function public.delete_admin_extra_order')
    expect(lateAdminExtraHistoryClosuresMigration).toContain("historical_status = 'deleted'")
    expect(lateAdminExtraHistoryClosuresMigration).toContain('insert into public.late_admin_extra_order_history')
    expect(lateAdminExtraHistoryClosuresMigration).toContain("where a.action = 'late_admin_extra_order_created'")
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create or replace function public.get_late_admin_extra_history_days')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create or replace function public.get_late_admin_extra_history_for_day')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create or replace function public.close_late_admin_extra_operational_day')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('create or replace function public.get_late_admin_extra_closure')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('late_extra_operational_day_open')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('operational_date date not null unique')
    expect(lateAdminExtraHistoryClosuresMigration).toContain("'can_manage_late_extra_history', public.can_manage_late_extra_history(auth.uid())")
    expect(lateAdminExtraHistoryClosuresMigration).toContain('revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon')
    expect(lateAdminExtraHistoryClosuresMigration).toContain('grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated')
  })

  it('backfills late-admin-extra history from audit logs when history is read or closed', () => {
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('create or replace function public.backfill_late_admin_extra_history_for_date')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain("where a.action = 'late_admin_extra_order_created'")
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('a.created_at >= v_bounds.window_started_at')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('a.created_at < v_bounds.window_closed_at')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain("d.action = 'admin_extra_order_deleted'")
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain("historical_status = 'deleted'")
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('perform public.backfill_late_admin_extra_history_for_date(v_day)')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('perform public.backfill_late_admin_extra_history_for_date(p_operational_date)')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('create or replace function public.get_late_admin_extra_history_days')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('create or replace function public.get_late_admin_extra_history_for_day')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('create or replace function public.close_late_admin_extra_operational_day')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('public.resolve_late_admin_extra_operational_date(a.created_at)')
    expect(lateAdminExtraHistoryOnReadBackfillMigration).toContain('grant execute on function public.backfill_late_admin_extra_history_for_date(date) to authenticated')
  })

  it('widens retroactive late-extra backfill to DB evidence beyond the late-specific audit action', () => {
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('create or replace function public.backfill_late_admin_extra_history_for_date')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain("a.action in ('late_admin_extra_order_created', 'admin_extra_order_created')")
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('create or replace function public.get_late_admin_extra_history_days')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('p_from_date = p_to_date')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('perform public.backfill_late_admin_extra_history_for_date(p_from_date)')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain("o.order_origin, '')) = 'admin_extra'")
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('late_admin_extra_history_authorized_accounts')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('servifoodrecepcion@gmail.com')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('sarmientoclaudia985@gmail.com')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('agustinwojtyszyn99@gmail.com')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('left join allowed_accounts aa')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('a.created_at >= v_bounds.window_started_at')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('a.created_at < v_bounds.window_closed_at')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('o.created_at >= v_bounds.window_started_at')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('o.created_at < v_bounds.window_closed_at')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain('o.delivery_date = p_operational_date')
    expect(lateAdminExtraHistoryWiderDbBackfillMigration).toContain("d.action = 'admin_extra_order_deleted'")
  })
})
