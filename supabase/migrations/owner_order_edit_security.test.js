import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(new URL('./20260908143000_secure_owner_order_edits.sql', import.meta.url))
const source = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('owner order edit hardening migration', () => {
  it('removes direct owner update policies from orders', () => {
    expect(source).toContain('drop policy if exists orders_update_owner_or_admin on public.orders')
    expect(source).toContain('drop policy if exists orders_update_owner_pending_within_window on public.orders')
    expect(source).toContain('drop policy if exists orders_update_owner_pending_edit_window on public.orders')
    expect(source).not.toContain('create policy orders_update_owner_pending_edit_window')
  })

  it('exposes an authenticated security-definer owner edit RPC', () => {
    expect(source).toContain('create or replace function public.update_own_pending_order(')
    expect(source).toContain('security definer')
    expect(source).toContain('v_uid uuid := auth.uid()')
    expect(source).toContain("v_order.user_id <> v_uid")
    expect(source).toContain("v_order.status <> 'pending'")
    expect(source).toContain("v_order.created_at < now() - interval '15 minutes'")
    expect(source).toContain('grant execute on function public.update_own_pending_order(uuid, jsonb) to authenticated')
  })

  it('whitelists only normal user-editable fields', () => {
    for (const field of [
      'location',
      'customer_name',
      'customer_email',
      'customer_phone',
      'items',
      'comments',
      'custom_responses'
    ]) {
      expect(source).toContain(`'${field}'`)
    }

    for (const forbiddenField of [
      'order_origin',
      'company_slug',
      'company_name',
      'created_by_admin_id',
      'created_by_admin_email',
      'admin_extra_reason',
      'admin_extra_comment'
    ]) {
      expect(source).not.toContain(`'${forbiddenField}'`)
    }

    expect(source).toContain('order_update_field_not_allowed')
    expect(source).toContain('order_update_quantity_not_allowed')
  })
})
