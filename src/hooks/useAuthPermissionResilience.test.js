import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath) => readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8'
)

const authSource = readSource('./useAuth.js')
const requireAdminSource = readSource('../components/RequireAdmin.jsx')

describe('permission validation resilience', () => {
  it('runs role and access-context validation in parallel and preserves access-context errors', () => {
    expect(authSource).toContain('fetchPermissionAccessContext')
    expect(authSource).toContain('Promise.all([')
    expect(authSource).toContain('accessContextError = accessResult.error || null')
    expect(authSource).toContain('setPermissionError(accessContextError)')
  })

  it('does not use the user role lookup error as the canonical protected-route error', () => {
    expect(authSource).toContain('roleError = roleResult.error || null')
    expect(authSource).not.toContain('setPermissionError(roleError)')
  })

  it('lets a protected route retry permission validation without signing out', () => {
    expect(requireAdminSource).toContain('refreshPermissions')
    expect(requireAdminSource).toContain('Reintentar permisos')
    expect(requireAdminSource).toContain('PERMISSION_VALIDATION_TIMEOUT_MS = 12000')
  })

  it('clears discount permission on sign out as part of the permission reset', () => {
    const signedOutSection = authSource.split("event === 'SIGNED_OUT'")[1] || ''
    expect(signedOutSection).toContain('setCanManageOrderDiscounts(false)')
  })
})
