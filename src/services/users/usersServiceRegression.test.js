import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const usersServiceSource = readFileSync(
  new URL('./usersService.js', import.meta.url),
  'utf8'
)
const legacyUsersSource = readFileSync(
  new URL('../users.js', import.meta.url),
  'utf8'
)
const roleUpdatesSource = readFileSync(
  new URL('./roleUpdates.js', import.meta.url),
  'utf8'
)

const userServiceSources = [
  usersServiceSource,
  legacyUsersSource,
  roleUpdatesSource
].join('\n')

describe('user services anti-regression guards', () => {
  it('mantiene una unica implementacion canonica de cambio de rol', () => {
    expect(usersServiceSource).toContain('updateUserRoleWithRpc({')
    expect(legacyUsersSource).toContain('updateUserRoleWithRpc({')
    expect(roleUpdatesSource).toContain("rpc('admin_update_user_role'")
    expect(usersServiceSource).not.toContain("supabase.rpc('admin_update_user_role'")
    expect(legacyUsersSource).not.toContain("supabase.rpc('admin_update_user_role'")
  })

  it('no reintroduce updates directos de role en servicios de usuarios', () => {
    expect(userServiceSources).not.toMatch(/\.from\(['"]users['"]\)[\s\S]{0,240}\.update\(\s*\{[^}]*\brole\b/)
    expect(userServiceSources).not.toMatch(/\.update\(\s*\{[^}]*\brole\b/)
  })

  it('getUserById usa columnas explicitas y no select star', () => {
    expect(legacyUsersSource).toContain(".select('id, email, full_name, role, created_at, email_confirmed_at')")
    expect(legacyUsersSource).not.toContain(".select('*')")
  })

  it('no intenta usar auth.admin.listUsers desde servicios frontend', () => {
    expect(userServiceSources).not.toContain('auth.admin.listUsers')
    expect(userServiceSources).not.toContain('syncUserNames')
  })
})
