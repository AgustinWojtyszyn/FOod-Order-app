import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { COMPANY_CATALOG } from '../../src/constants/companyConfig.js'

const EXPECTED_REMITO_RANGES = [
  ['ccp', 10000, 19999],
  ['distro_cuyo', 20000, 29999],
  ['epse', 30000, 39999],
  ['genneia', 40000, 49999],
  ['laja', 50000, 59999],
  ['losberros', 60000, 69999],
  ['padrebueno', 70000, 79999],
  ['greif', 80000, 89999],
  ['molinos', 90000, 99999],
  ['placo', 100000, 109999],
  ['igarreta', 110000, 119999],
  ['isemar', 120000, 129999]
]
const REMITO_EXCLUDED_COMPANY_SLUGS = new Set(['administracion_servifood'])

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
const greifMolinosRemitoNumberingMigration = readFileSync(
  new URL('./20260824120000_greif_molinos_company_remito_numbering.sql', import.meta.url),
  'utf8'
)
const placoCompanyMigration = readFileSync(
  new URL('./20260824133000_add_placo_company.sql', import.meta.url),
  'utf8'
)
const orderLabelPrintTrackingMigration = readFileSync(
  new URL('./20260824143000_order_label_print_tracking.sql', import.meta.url),
  'utf8'
)
const greifDefaultRefrigerioBackfillMigration = readFileSync(
  new URL('./20260824150000_backfill_greif_default_refrigerio.sql', import.meta.url),
  'utf8'
)
const removeGreifAutoRefrigerioMigration = readFileSync(
  new URL('./20260824153000_remove_greif_auto_refrigerio_response.sql', import.meta.url),
  'utf8'
)
const adminExtraAllCompaniesMigration = readFileSync(
  new URL('./20260825100000_enable_admin_extra_all_companies.sql', import.meta.url),
  'utf8'
)
const adminExtraHistoryByDeliveryDateMigration = readFileSync(
  new URL('./20260825103000_admin_extra_history_by_delivery_date.sql', import.meta.url),
  'utf8'
)
const removeGreifRefrigerioMenuOptionMigration = readFileSync(
  new URL('./20260825110000_remove_greif_refrigerio_menu_option.sql', import.meta.url),
  'utf8'
)
const placoRemitoNumberingMigration = readFileSync(
  new URL('./20260827120000_placo_company_remito_numbering.sql', import.meta.url),
  'utf8'
)
const placoGenneiaBeverageOptionMigration = readFileSync(
  new URL('./20260827123000_placo_genneia_beverage_option.sql', import.meta.url),
  'utf8'
)
const ensureAllCompanyRemitoNumberingMigration = readFileSync(
  new URL('./20260827130000_ensure_all_company_remito_numbering.sql', import.meta.url),
  'utf8'
)
const igarretaCompanyMigration = readFileSync(
  new URL('./20260828120000_add_igarreta_company.sql', import.meta.url),
  'utf8'
)
const isemarCompanyLocationsMigration = readFileSync(
  new URL('./20260901110000_add_isemar_company_locations.sql', import.meta.url),
  'utf8'
)
const isemarConsumptionReportViewersMigration = readFileSync(
  new URL('./20260903130000_isemar_consumption_report_viewers.sql', import.meta.url),
  'utf8'
)
const igarretaIsemarReportAndDiscountsMigration = readFileSync(
  new URL('./20260904140000_igarreta_isemar_report_and_order_discounts.sql', import.meta.url),
  'utf8'
)
const remitoNumberingMigrations = `${ensureAllCompanyRemitoNumberingMigration}\n${igarretaCompanyMigration}\n${isemarCompanyLocationsMigration}`
const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')

describe('admin extra orders migration', () => {
  it('creates secure RPCs for scoped creation, listing and deletion', () => {
    expect(migration).toContain('create or replace function public.create_admin_extra_order')
    expect(migration).toContain('create or replace function public.get_daily_orders_for_admin')
    expect(migration).toContain('create or replace function public.delete_admin_extra_order')
    expect(migration).toContain('public.is_company_admin')
    expect(migration).toContain('public.has_company_admin_access()')
  })

  it('keeps ISEMAR consumption viewers out of company admin permissions', () => {
    expect(isemarConsumptionReportViewersMigration).toContain("permission = 'consumption_report_viewer'")
    expect(isemarConsumptionReportViewersMigration).toContain('delete from public.company_admins ca')
    expect(isemarConsumptionReportViewersMigration).toContain("select u.id, 'consumption_report_viewer', 'isemar'")
    expect(isemarConsumptionReportViewersMigration).toContain("and not public.has_consumption_report_access('isemar')")
    expect(isemarConsumptionReportViewersMigration).toContain("where c.slug = 'isemar'")
    expect(isemarConsumptionReportViewersMigration).toContain('public.normalize_order_schedule_location_key(coalesce(o.requesting_location_code')
    expect(isemarConsumptionReportViewersMigration).toContain('public.normalize_order_schedule_location_key(coalesce(o.delivery_location')
    expect(isemarConsumptionReportViewersMigration).not.toContain("c.slug in ('igarreta', 'isemar')\n          and")
  })

  it('extends consumption report viewers to Igarreta and ISEMAR without new menu or beverage RPCs', () => {
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("c.slug in ('igarreta', 'isemar')")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("select u.id, 'consumption_report_viewer', c.slug")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("public.has_consumption_report_access('igarreta')")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("public.has_consumption_report_access('isemar')")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('consumption_report_companies')
    expect(igarretaIsemarReportAndDiscountsMigration).not.toContain('get_admin_extra_visible_custom_options')
    expect(igarretaIsemarReportAndDiscountsMigration).not.toContain('get_orderable_menu_items_for_company')
  })

  it('adds a traceable order discount RPC with backend authorization and stock validation', () => {
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('create table if not exists public.order_item_discounts')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('create table if not exists public.order_discount_authorized_accounts')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('sarmientoclaudia985@gmail.com')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('agustinwojtyszyn99@gmail.com')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("lower(coalesce(u.email, '')) like '%jessica%'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("lower(coalesce(u.email, '')) like '%jesica%'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('create or replace function public.can_manage_order_discounts')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('create or replace function public.create_order_item_discount')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('for update')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("raise exception 'quantity_invalid'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("raise exception 'quantity_exceeds_available'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('if found then')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('return next v_discount')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("'order_item_discount_created'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('order_snapshot_before')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('order_snapshot_after')
    expect(igarretaIsemarReportAndDiscountsMigration).not.toContain('delete from public.orders')
  })

  it('keeps custom responses consistent when order discounts change operational quantities', () => {
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('create or replace function public.order_discount_adjust_custom_responses')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('public.order_discount_response_matches_item')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('public.order_discount_reduce_quantities')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('public.order_discount_trim_response_array')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("v_next_response := jsonb_set(\n          v_next_response,\n          '{quantities}'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('custom_responses = v_new_custom_responses')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('p_target_item_quantity_after')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('p_menu_total_after')
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('revoke all on function public.order_discount_adjust_custom_responses')
  })

  it('does not treat an explicit item quantity of zero as discountable stock', () => {
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("when v_target_item ? 'quantity'")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain("then coalesce(public.order_discount_jsonb_positive_int(v_target_item->'quantity'), 0)")
    expect(igarretaIsemarReportAndDiscountsMigration).toContain('else 1')
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

  it('configures Greif and Molinos remito ranges without moving valid counters backwards', () => {
    expect(greifMolinosRemitoNumberingMigration).toContain("('greif', 'Greif', 80000, 89999, 80000)")
    expect(greifMolinosRemitoNumberingMigration).toContain("('molinos', 'Molinos', 90000, 99999, 90000)")
    expect(greifMolinosRemitoNumberingMigration).toContain('public.companies.next_remito_number between excluded.remito_start_number and excluded.remito_end_number + 1')
    expect(greifMolinosRemitoNumberingMigration).toContain('then public.companies.next_remito_number')
    expect(greifMolinosRemitoNumberingMigration).not.toContain('update public.company_remitos')
    expect(greifMolinosRemitoNumberingMigration).not.toContain('delete from public.company_remitos')
  })

  it('keeps the Greif and Molinos remito numbering migration versionable', () => {
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('adds Placo as a normal order company without changing historical migrations', () => {
    expect(placoCompanyMigration).toContain("insert into public.companies (slug, name)")
    expect(placoCompanyMigration).toContain("values ('placo', 'Placo')")
    expect(placoCompanyMigration).toContain('on conflict (slug) do update')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('configures Placo remito numbering without moving valid counters backwards', () => {
    expect(placoRemitoNumberingMigration).toContain("('placo', 'Placo', 100000, 109999, 100000)")
    expect(placoRemitoNumberingMigration).toContain("when slug = 'placo' or slug like 'placo_%' then 'placo'")
    expect(placoRemitoNumberingMigration).toContain('public.companies.next_remito_number between excluded.remito_start_number and excluded.remito_end_number + 1')
    expect(placoRemitoNumberingMigration).toContain('then public.companies.next_remito_number')
    expect(placoRemitoNumberingMigration).not.toContain('update public.company_remitos')
    expect(placoRemitoNumberingMigration).not.toContain('delete from public.company_remitos')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('adds the Genneia beverage option to Placo orders', () => {
    expect(placoGenneiaBeverageOptionMigration).toContain("'placo'")
    expect(placoGenneiaBeverageOptionMigration).toContain("'Bebidas (solo Genneia)'")
    expect(placoGenneiaBeverageOptionMigration).toContain('"Agua"')
    expect(placoGenneiaBeverageOptionMigration).toContain('"Soda"')
    expect(placoGenneiaBeverageOptionMigration).toContain('"Agua saborizada"')
    expect(placoGenneiaBeverageOptionMigration).toContain('"Coca cola"')
    expect(placoGenneiaBeverageOptionMigration).toContain('"Coca Zero"')
    expect(placoGenneiaBeverageOptionMigration).toContain('required')
    expect(placoGenneiaBeverageOptionMigration).toContain('true')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('ensures every order company has remito numbering configured', () => {
    const orderCompanySlugs = Object.values(COMPANY_CATALOG)
      .filter((company) => !company.adminOnly && !REMITO_EXCLUDED_COMPANY_SLUGS.has(company.slug))
      .map((company) => company.slug)
      .sort()

    expect(EXPECTED_REMITO_RANGES.map(([slug]) => slug).sort()).toEqual(orderCompanySlugs)
    for (const [slug, startNumber, endNumber] of EXPECTED_REMITO_RANGES) {
      expect(remitoNumberingMigrations).toContain(
        `('${slug}', `
      )
      expect(remitoNumberingMigrations).toContain(
        `${startNumber}, ${endNumber}`
      )
    }
    expect(ensureAllCompanyRemitoNumberingMigration).toContain('coalesce(i.last_remito_number + 1, r.remito_start_number)')
    expect(ensureAllCompanyRemitoNumberingMigration).toContain("values ('administracion_servifood', 'Administración ServiFood', null, null, null)")
    expect(ensureAllCompanyRemitoNumberingMigration).toContain("where slug = 'global'")
    expect(ensureAllCompanyRemitoNumberingMigration).not.toContain('delete from public.company_remitos')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
    expect(igarretaCompanyMigration).toContain("when slug = 'igarreta' or slug like 'igarreta_%' then 'igarreta'")
    expect(igarretaCompanyMigration).toContain("('igarreta', 'Igarreta Maquinas SA', 110000, 119999, 110000)")
    expect(isemarCompanyLocationsMigration).toContain("when slug = 'isemar' or slug like 'isemar_%' then 'isemar'")
    expect(isemarCompanyLocationsMigration).toContain("('isemar', 'ISEMAR', 120000, 129999, 120000)")
  })

  it('persists label print state on orders without duplicating orders', () => {
    expect(orderLabelPrintTrackingMigration).toContain('add column if not exists label_printed_at timestamptz')
    expect(orderLabelPrintTrackingMigration).toContain('add column if not exists label_printed_by uuid references auth.users(id) on delete set null')
    expect(orderLabelPrintTrackingMigration).toContain('add column if not exists label_print_count integer not null default 0')
    expect(orderLabelPrintTrackingMigration).toContain('create or replace function public.mark_order_labels_printed')
    expect(orderLabelPrintTrackingMigration).toContain('label_print_count = coalesce(o.label_print_count, 0) + 1')
    expect(orderLabelPrintTrackingMigration).toContain("'order_labels_printed'")
    expect(orderLabelPrintTrackingMigration).not.toContain('insert into public.orders')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('backfills Greif default refrigerio on existing orders without duplicating it or changing remitos', () => {
    expect(greifDefaultRefrigerioBackfillMigration).toContain('greif_orders_missing_refrigerio')
    expect(greifDefaultRefrigerioBackfillMigration).toContain("lower(trim(coalesce(nullif(o.company_slug, ''), o.location, ''))) = 'greif'")
    expect(greifDefaultRefrigerioBackfillMigration).toContain("response->>'id' = 'greif-default-refrigerio'")
    expect(greifDefaultRefrigerioBackfillMigration).toContain("'retroactive', true")
    expect(greifDefaultRefrigerioBackfillMigration).toContain('custom_responses = g.existing_custom_responses || jsonb_build_array')
    expect(greifDefaultRefrigerioBackfillMigration).toContain('coalesce(nullif(o.total_items, 0), 0)')
    expect(greifDefaultRefrigerioBackfillMigration).not.toContain('insert into public.orders')
    expect(greifDefaultRefrigerioBackfillMigration).not.toContain('company_remitos')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('removes old automatic Greif refrigerio responses without touching orders or remitos', () => {
    expect(removeGreifAutoRefrigerioMigration).toContain('update public.orders as o')
    expect(removeGreifAutoRefrigerioMigration).toContain("lower(trim(coalesce(nullif(o.company_slug, ''), o.location, ''))) = 'greif'")
    expect(removeGreifAutoRefrigerioMigration).toContain("response->>'id' = 'greif-default-refrigerio'")
    expect(removeGreifAutoRefrigerioMigration).toContain("response->>'source' = 'greif-default-refrigerio'")
    expect(removeGreifAutoRefrigerioMigration).not.toContain('insert into public.orders')
    expect(removeGreifAutoRefrigerioMigration).not.toContain('company_remitos')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('allows admin extra orders for all configured companies including Greif', () => {
    expect(adminExtraAllCompaniesMigration).toContain('create or replace function public.admin_extra_company_location_allowed')
    expect(adminExtraAllCompaniesMigration).toContain("('greif', 'Greif')")
    expect(adminExtraAllCompaniesMigration).toContain("('placo', 'Placo')")
    expect(adminExtraAllCompaniesMigration).toContain("('molinos', 'Molinos')")
    expect(adminExtraAllCompaniesMigration).toContain('from public.companies c')
    expect(adminExtraAllCompaniesMigration).toContain('from public.order_locations loc')
    expect(adminExtraAllCompaniesMigration).not.toContain('else false')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('removes Refrigerio as a Greif menu option without touching orders or remitos', () => {
    expect(removeGreifRefrigerioMenuOptionMigration).toContain('delete from public.menu_items')
    expect(removeGreifRefrigerioMenuOptionMigration).toContain("lower(trim(coalesce(company_slug, ''))) = 'greif'")
    expect(removeGreifRefrigerioMenuOptionMigration).toContain(") = 'refrigerio'")
    expect(removeGreifRefrigerioMenuOptionMigration).not.toContain('delete from public.orders')
    expect(removeGreifRefrigerioMenuOptionMigration).not.toContain('update public.orders')
    expect(removeGreifRefrigerioMenuOptionMigration).not.toContain('company_remitos')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('shows admin extra history retroactively by delivery date', () => {
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('create or replace function public.get_late_admin_extra_history_days')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('drop function if exists public.get_late_admin_extra_history_for_day(date)')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('create or replace function public.get_late_admin_extra_history_for_day')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('drop function if exists public.close_late_admin_extra_operational_day(date)')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('create or replace function public.close_late_admin_extra_operational_day')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('from public.orders o')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("lower(coalesce(o.order_origin, '')) = 'admin_extra'")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('o.delivery_date = p_operational_date')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("a.action = 'admin_extra_order_deleted'")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('public.can_manage_late_extra_history(auth.uid())')
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("case when c.id is not null then 'closed' else 'open' end as status")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("22, 0, 0, 'America/Argentina/Buenos_Aires'")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("18, 0, 0, 'America/Argentina/Buenos_Aires'")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("'delivery_date', p_operational_date")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("'rows', coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at, rows.id), '[]'::jsonb)")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("'closed'::text as historical_status")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain("'registered'::text as historical_status")
    expect(adminExtraHistoryByDeliveryDateMigration).toContain('grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated')
    expect(adminExtraHistoryByDeliveryDateMigration).not.toContain('returns setof public.late_admin_extra_order_history')
    expect(gitignore).toContain('!supabase/migrations/*.sql')
  })

  it('issues company remitos from canonical companies numbering config without duplicated range CASEs', () => {
    expect(greifMolinosRemitoNumberingMigration).toContain('create or replace function public.issue_company_remito')
    expect(greifMolinosRemitoNumberingMigration).toContain('from public.companies as c')
    expect(greifMolinosRemitoNumberingMigration).toContain('where c.slug = v_slug')
    expect(greifMolinosRemitoNumberingMigration).toContain('for update')
    expect(greifMolinosRemitoNumberingMigration).toContain("v_slug in ('global', 'administracion_servifood')")
    expect(greifMolinosRemitoNumberingMigration).toContain("raise exception 'company_remito_numbering_excluded'")
    expect(greifMolinosRemitoNumberingMigration).toContain("raise exception 'company_not_found'")
    expect(greifMolinosRemitoNumberingMigration).toContain("raise exception 'company_remito_numbering_not_configured'")
    expect(greifMolinosRemitoNumberingMigration).toContain('v_company.remito_start_number')
    expect(greifMolinosRemitoNumberingMigration).toContain('v_company.remito_end_number')
    expect(greifMolinosRemitoNumberingMigration).toContain('v_company.next_remito_number')
    expect(greifMolinosRemitoNumberingMigration).toContain('greatest(')
    expect(greifMolinosRemitoNumberingMigration).toContain('coalesce(v_last_number + 1, v_company.remito_start_number)')
    expect(greifMolinosRemitoNumberingMigration).toContain('next_remito_number = v_number + 1')
    expect(greifMolinosRemitoNumberingMigration).toContain('cr.delivery_date = p_delivery_date')
    expect(greifMolinosRemitoNumberingMigration).toContain('cr.location_key = v_location_key')
    expect(greifMolinosRemitoNumberingMigration).toContain('set next_remito_number = v_number + 1')
    expect(greifMolinosRemitoNumberingMigration).not.toContain('case v_slug')
  })

  it('preserves idempotent reuse and snapshot refresh semantics without consuming numbers', () => {
    expect(greifMolinosRemitoNumberingMigration).toContain('cr.request_id = v_request_id')
    expect(greifMolinosRemitoNumberingMigration).toContain("cr.status = 'issued'")
    expect(greifMolinosRemitoNumberingMigration).toContain('true as reused')
    expect(greifMolinosRemitoNumberingMigration).toContain('v_existing.snapshot as snapshot')
    expect(greifMolinosRemitoNumberingMigration).toContain('jsonb_build_object(')
    expect(greifMolinosRemitoNumberingMigration).toContain("'companySlug', v_company.slug")
    expect(greifMolinosRemitoNumberingMigration).toContain("'remitoNumber', v_number")
    expect(refreshCompanyRemitosMigration).not.toContain('next_remito_number')
  })

  it('updates remito start from canonical company config and never moves next backwards', () => {
    expect(greifMolinosRemitoNumberingMigration).toContain('create or replace function public.update_company_remito_start')
    expect(greifMolinosRemitoNumberingMigration).toContain('p_remito_start_number <> v_company.remito_start_number')
    expect(greifMolinosRemitoNumberingMigration).toContain("raise exception 'remito_start_number_out_of_range'")
    expect(greifMolinosRemitoNumberingMigration).toContain('greatest(')
    expect(greifMolinosRemitoNumberingMigration).toContain('v_company.next_remito_number')
    expect(greifMolinosRemitoNumberingMigration).toContain('coalesce(v_last_number + 1, v_company.remito_start_number)')
    expect(greifMolinosRemitoNumberingMigration).toContain('set next_remito_number = v_next_number')
  })

  it('keeps all definitive remito ranges non-overlapping', () => {
    for (let index = 0; index < EXPECTED_REMITO_RANGES.length - 1; index += 1) {
      expect(EXPECTED_REMITO_RANGES[index][2]).toBeLessThan(EXPECTED_REMITO_RANGES[index + 1][1])
    }
    expect(greifMolinosRemitoNumberingMigration).toContain("('greif', 'Greif', 80000, 89999, 80000)")
    expect(greifMolinosRemitoNumberingMigration).toContain("('molinos', 'Molinos', 90000, 99999, 90000)")
    expect(placoRemitoNumberingMigration).toContain("('placo', 'Placo', 100000, 109999, 100000)")
    expect(ensureAllCompanyRemitoNumberingMigration).toContain("('placo', 'Placo', 100000, 109999, 100000)")
    expect(igarretaCompanyMigration).toContain("('igarreta', 'Igarreta Maquinas SA', 110000, 119999, 110000)")
    expect(isemarCompanyLocationsMigration).toContain("('isemar', 'ISEMAR', 120000, 129999, 120000)")
  })

  it('adds ISEMAR as a two-location company without changing historical migrations', () => {
    expect(isemarCompanyLocationsMigration).toContain("insert into public.order_organizations (code, name, active)")
    expect(isemarCompanyLocationsMigration).toContain("values ('ISEMAR', 'ISEMAR', true)")
    expect(isemarCompanyLocationsMigration).toContain("('ISEMAR_PREDIO_1', 'isemar_predio_1', 'ISEMAR – PREDIO 1')")
    expect(isemarCompanyLocationsMigration).toContain("('ISEMAR_PREDIO_2', 'isemar_predio_2', 'ISEMAR – PREDIO 2')")
    expect(isemarCompanyLocationsMigration).not.toContain('create or replace function public.create_order_idempotent')
    expect(isemarCompanyLocationsMigration).not.toContain('alter table public.orders')
  })
})
