import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260806153000_admin_extra_orders.sql', import.meta.url),
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
})
