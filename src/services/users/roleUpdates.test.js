import { describe, expect, it, vi } from 'vitest'
import { normalizeUserRole, updateUserRoleWithRpc } from './roleUpdates'

describe('canonical user role updates', () => {
  it('normaliza roles dentro de la implementacion canonica', () => {
    expect(normalizeUserRole(' ADMIN ')).toBe('admin')
    expect(normalizeUserRole(null)).toBe('')
  })

  it('llama exclusivamente a la RPC administrativa con payload minimo', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'user-1', role: 'admin' }], error: null })
    const invalidateCache = vi.fn()

    const result = await updateUserRoleWithRpc({
      rpc,
      userId: 'user-1',
      role: ' ADMIN ',
      invalidateCache
    })

    expect(result).toEqual({ data: { id: 'user-1', role: 'admin' }, error: null })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('admin_update_user_role', {
      p_user_id: 'user-1',
      p_role: 'admin'
    })
    expect(Object.keys(rpc.mock.calls[0][1])).toEqual(['p_user_id', 'p_role'])
    expect(invalidateCache).toHaveBeenCalledWith('user-1')
  })

  it('rechaza roles invalidos antes de llamar a Supabase', async () => {
    const rpc = vi.fn()

    const result = await updateUserRoleWithRpc({
      rpc,
      userId: 'user-1',
      role: 'owner'
    })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('invalid_role')
    expect(rpc).not.toHaveBeenCalled()
  })
})
