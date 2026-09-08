import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(new URL('./20260908120000_secure_audit_log_writes.sql', import.meta.url))
const source = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('audit log write hardening migration', () => {
  it('removes the broad authenticated insert policy', () => {
    expect(source).toContain('drop policy if exists audit_logs_insert_auth on public.audit_logs')
    expect(source).not.toContain('with check (true)')
  })

  it('derives actor identity from auth.uid on the server', () => {
    expect(source).toContain('create or replace function public.audit_log_set_verified_actor()')
    expect(source).toContain('new.actor_id := v_actor.id')
    expect(source).toContain('where id = auth.uid()')
    expect(source).toContain('before insert on public.audit_logs')
  })

  it('only permits direct client audit writes for admin contexts and known actions', () => {
    expect(source).toContain('public.has_company_admin_access()')
    expect(source).toContain('actor_id = auth.uid()')
    expect(source).toContain("action in ('role_changed', 'menu_updated', 'menu_options_added')")
  })
})
