import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(new URL('./20260908120000_secure_audit_log_writes.sql', import.meta.url))
const source = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('audit log write hardening migration', () => {
  it('removes direct client writes to audit_logs', () => {
    expect(source).toContain('drop policy if exists audit_logs_insert_auth on public.audit_logs')
    expect(source).toContain('revoke insert, update, delete on table public.audit_logs from authenticated')
    expect(source).not.toContain('with check (true)')
  })

  it('exposes a security-definer rpc that derives the actor from auth.uid', () => {
    expect(source).toContain('create or replace function public.log_audit(')
    expect(source).toContain('security definer')
    expect(source).toContain('v_uid uuid := auth.uid()')
    expect(source).toContain('v_actor.id')
    expect(source).toContain('grant execute on function public.log_audit')
  })

  it('only accepts known admin audit actions', () => {
    expect(source).toContain('public.has_company_admin_access()')
    expect(source).toContain("v_action not in ('role_changed', 'menu_updated', 'menu_options_added')")
  })
})
