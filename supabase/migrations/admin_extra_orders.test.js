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
})
