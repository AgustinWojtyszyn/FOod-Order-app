import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./useAdminUsersActions.js', import.meta.url),
  'utf8'
)

describe('useAdminUsersActions role submission guards', () => {
  it('evita doble envio de cambios de rol por usuario', () => {
    expect(source).toContain('if (!userId || roleUpdatingById[userId] || deletingById[userId]) return')
    expect(source).toContain('setRoleUpdatingById(prev => ({ ...prev, [userId]: true }))')
    expect(source).toContain('setRoleUpdatingById(prev => ({ ...prev, [userId]: false }))')
  })
})
