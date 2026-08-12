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

const createAdminPeopleFallbackSupabaseMock = () => {
  const calls = []
  const tableResults = {
    admin_people_unified: {
      data: [
        {
          person_id: 'global-admin',
          display_name: 'Administración Álvarez',
          emails: ['admin.alvarez@example.com'],
          user_ids: ['global-admin'],
          members_count: 1,
          first_created: '2026-08-01T00:00:00.000Z',
          last_created: '2026-08-01T00:00:00.000Z',
          is_grouped: false
        },
        {
          person_id: 'regular-user',
          display_name: 'Usuario Normal',
          emails: ['user@example.com'],
          user_ids: ['regular-user'],
          members_count: 1,
          first_created: '2026-08-02T00:00:00.000Z',
          last_created: '2026-08-02T00:00:00.000Z',
          is_grouped: false
        }
      ],
      error: null
    },
    users: {
      data: [
        {
          id: 'global-admin',
          email: 'admin.alvarez@example.com',
          full_name: 'Administración Álvarez',
          role: 'admin',
          created_at: '2026-08-01T00:00:00.000Z'
        },
        {
          id: 'regular-user',
          email: 'user@example.com',
          full_name: 'Usuario Normal',
          role: 'user',
          created_at: '2026-08-02T00:00:00.000Z'
        }
      ],
      error: null
    }
  }
  return {
    calls,
    supabase: {
      rpc(name, args) {
        calls.push(['rpc', name, args])
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find get_admin_people_page' }
        })
      },
      from(table) {
        calls.push(['from', table])
        return {
          select(columns) {
            calls.push(['select', table, columns])
            return Promise.resolve(tableResults[table] || { data: [], error: null })
          }
        }
      }
    }
  }
}

describe('usersService role updates', () => {
  it('obtiene sedes activas de empresa por RPC', async () => {
    const calls = []
    const service = createUsersService({
      supabase: {
        rpc(name, args) {
          calls.push(['rpc', name, args])
          return Promise.resolve({
            data: [{ code: 'EPSE_PLANTA', name: 'EPSE - Planta', delivery_name: 'EPSE - Planta' }],
            error: null
          })
        }
      }
    })

    const result = await service.getCompanyOrderLocations({ companySlug: ' EPSE ' })

    expect(result).toEqual({
      data: [{ code: 'EPSE_PLANTA', name: 'EPSE - Planta', delivery_name: 'EPSE - Planta' }],
      error: null
    })
    expect(calls).toEqual([
      ['rpc', 'get_company_order_locations', { p_company_slug: 'epse' }]
    ])
  })

  it('usa fallback directo y conserva la sede efectiva de entrega', async () => {
    const calls = []
    const locationRows = [
      {
        id: 'loc-estacion',
        code: 'EPSE_ESTACION',
        slug: 'epse_estacion',
        display_name: 'EPSE - Estacion',
        default_delivery_location_id: 'loc-planta'
      },
      {
        id: 'loc-planta',
        code: 'EPSE_PLANTA',
        slug: 'epse_planta',
        display_name: 'EPSE - Planta',
        default_delivery_location_id: 'loc-planta'
      }
    ]
    const deliveryRows = [
      {
        id: 'loc-planta',
        code: 'EPSE_PLANTA',
        slug: 'epse_planta',
        display_name: 'EPSE - Planta'
      }
    ]
    const query = {
      select(columns) {
        calls.push(['select', columns])
        return this
      },
      eq(column, value) {
        calls.push(['eq', column, value])
        return this
      },
      order(column, options) {
        calls.push(['order', column, options])
        return Promise.resolve({ data: locationRows, error: null })
      },
      in(column, values) {
        calls.push(['in', column, values])
        return Promise.resolve({ data: deliveryRows, error: null })
      }
    }
    const service = createUsersService({
      supabase: {
        rpc(name, args) {
          calls.push(['rpc', name, args])
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: 'missing function' }
          })
        },
        from(table) {
          calls.push(['from', table])
          return query
        }
      }
    })

    const result = await service.getCompanyOrderLocations({ companySlug: 'epse' })

    expect(result.error).toBeNull()
    expect(result.data).toEqual([
      expect.objectContaining({
        name: 'EPSE - Estacion',
        delivery_name: 'EPSE - Planta'
      }),
      expect.objectContaining({
        name: 'EPSE - Planta',
        delivery_name: 'EPSE - Planta'
      })
    ])
    expect(calls).toContainEqual(['eq', 'organization.code', 'EPSE'])
    expect(calls).toContainEqual(['in', 'id', ['loc-planta']])
  })

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

  it('usa fallback real y busca admins sin distinguir tildes si falta get_admin_people_page', async () => {
    const { supabase, calls } = createAdminPeopleFallbackSupabaseMock()
    const service = createUsersService({ supabase })

    const result = await service.getAdminPeoplePage({
      search: 'administracion alv',
      role: 'admin',
      page: 1,
      pageSize: 40
    })

    expect(result.error).toBeNull()
    expect(result.data.total_count).toBe(1)
    expect(result.data.items[0]).toMatchObject({
      person_id: 'global-admin',
      email: 'admin.alvarez@example.com',
      role: 'admin',
      primary_user_id: 'global-admin'
    })
    expect(calls).toContainEqual(['from', 'admin_people_unified'])
    expect(calls).toContainEqual(['from', 'users'])
  })
})
