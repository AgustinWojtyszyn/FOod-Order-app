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
})
