import { describe, expect, it, vi } from 'vitest'
import { createUsersService } from './usersService'

const createSupabaseMock = (rpcResult = { data: [{ id: 'user-1', role: 'admin' }], error: null }) => {
  const calls = []
  return {
    calls,
    supabase: {
      rpc(name, args) {
        calls.push(['rpc', name, args])
        return Promise.resolve(rpcResult)
      },
      from(table) {
        calls.push(['from', table])
        return {
          update(payload) {
            calls.push(['update', payload])
            return this
          }
        }
      }
    }
  }
}

describe('usersService role updates', () => {
  it('usa la RPC administrativa y no actualiza public.users directamente', async () => {
    const { supabase, calls } = createSupabaseMock()
    const invalidateCache = vi.fn()
    const logAudit = vi.fn()
    const service = createUsersService({ supabase, invalidateCache, logAudit })

    const result = await service.updateUserRole('user-1', 'admin')

    expect(result).toEqual({ data: { id: 'user-1', role: 'admin' }, error: null })
    expect(calls).toEqual([
      ['rpc', 'admin_update_user_role', { p_user_id: 'user-1', p_role: 'admin' }]
    ])
    expect(calls.some(([method]) => method === 'from' || method === 'update')).toBe(false)
    expect(invalidateCache).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'role_changed',
      target_id: 'user-1',
      metadata: { role: 'admin' }
    }))
  })

  it('envia un payload minimo con solo ID y rol', async () => {
    const { supabase, calls } = createSupabaseMock()
    const service = createUsersService({ supabase })

    await service.updateUserRole('user-2', 'user')

    expect(calls[0][2]).toEqual({ p_user_id: 'user-2', p_role: 'user' })
    expect(Object.keys(calls[0][2])).toEqual(['p_user_id', 'p_role'])
  })

  it('normaliza el rol antes de enviarlo a la RPC', async () => {
    const { supabase, calls } = createSupabaseMock()
    const logAudit = vi.fn()
    const service = createUsersService({ supabase, logAudit })

    const result = await service.updateUserRole('user-3', ' ADMIN ')

    expect(result).toEqual({ data: { id: 'user-1', role: 'admin' }, error: null })
    expect(calls).toEqual([
      ['rpc', 'admin_update_user_role', { p_user_id: 'user-3', p_role: 'admin' }]
    ])
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      details: 'Rol actualizado a "admin"',
      metadata: { role: 'admin' }
    }))
  })

  it('rechaza roles invalidos antes de llamar a Supabase', async () => {
    const { supabase, calls } = createSupabaseMock()
    const service = createUsersService({ supabase })

    const result = await service.updateUserRole('user-1', 'owner')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('invalid_role')
    expect(calls).toEqual([])
  })
})
