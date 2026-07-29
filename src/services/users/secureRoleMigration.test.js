import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260729104457_secure_user_role_updates.sql', import.meta.url),
  'utf8'
)

const normalized = migration.toLowerCase().replace(/\s+/g, ' ')

describe('secure user role migration', () => {
  it('revoca update general y no deja update directo a anon', () => {
    expect(normalized).toContain('revoke update on table public.users from public')
    expect(normalized).toContain('revoke update on table public.users from anon')
    expect(normalized).toContain('revoke update on table public.users from authenticated')
    expect(normalized).not.toContain('grant update on table public.users to anon')
    expect(normalized).not.toContain('grant update (role) on table public.users')
  })

  it('mantiene solo full_name editable por authenticated para perfil propio', () => {
    expect(normalized).toContain('grant update (full_name) on table public.users to authenticated')
    expect(normalized).toContain('create policy users_update_self_profile on public.users')
    expect(normalized).toContain('using (auth.uid() = id)')
    expect(normalized).toContain('with check (auth.uid() = id)')
  })

  it('define una RPC security definer con search_path seguro y grants restringidos', () => {
    expect(normalized).toContain('create or replace function public.admin_update_user_role')
    expect(normalized).toContain('security definer')
    expect(normalized).toContain('set search_path = public, pg_temp')
    expect(normalized).toContain('revoke all on function public.admin_update_user_role(uuid, text) from public')
    expect(normalized).toContain('revoke all on function public.admin_update_user_role(uuid, text) from anon')
    expect(normalized).toContain('grant execute on function public.admin_update_user_role(uuid, text) to authenticated')
  })

  it('valida permisos, roles y protege al ultimo administrador', () => {
    expect(normalized).toContain("raise exception 'not_authenticated'")
    expect(normalized).toContain("raise exception 'not_authorized'")
    expect(normalized).toContain("v_role not in ('user', 'admin')")
    expect(normalized).toContain("raise exception 'user_not_found'")
    expect(normalized).toContain("raise exception 'last_admin'")
    expect(normalized).toContain('set role = v_role')
  })
})
