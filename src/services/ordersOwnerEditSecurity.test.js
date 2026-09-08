import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  calls: []
}))

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc(name, args) {
      mockState.calls.push(['rpc', name, args])
      return Promise.resolve({ data: { id: args?.p_order_id || null }, error: null })
    },
    from(table) {
      mockState.calls.push(['from', table])
      throw new Error('No se esperaba acceso directo a tabla para esta prueba')
    }
  },
  db: {
    getOrders: vi.fn(),
    createOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
    deleteOrder: vi.fn(),
    deleteArchivedOrders: vi.fn()
  }
}))

const { ordersService } = await import('./orders')

describe('secure owner order edits', () => {
  beforeEach(() => {
    mockState.calls = []
  })

  it('routes normal owner edits through the whitelisted RPC', async () => {
    const items = [{ id: 'menu-1', name: 'Milanesa', quantity: 1 }]
    const customResponses = [{ id: 'drink', title: 'Bebida', response: 'Agua' }]

    const result = await ordersService.updateOrder('order-1', {
      location: 'ISEMAR',
      customer_name: 'Persona Ejemplo',
      customer_email: 'persona@example.com',
      customer_phone: '2640000000',
      items,
      comments: 'Sin sal',
      custom_responses: customResponses,
      service: 'dinner',
      total_items: 999,
      order_origin: 'admin_extra',
      company_slug: 'otra_empresa',
      created_by_admin_id: 'admin-forged'
    })

    expect(result.error).toBeNull()
    expect(mockState.calls).toHaveLength(1)
    expect(mockState.calls[0]).toEqual([
      'rpc',
      'update_own_pending_order',
      {
        p_order_id: 'order-1',
        p_updates: {
          location: 'ISEMAR',
          customer_name: 'Persona Ejemplo',
          customer_email: 'persona@example.com',
          customer_phone: '2640000000',
          items,
          comments: 'Sin sal',
          custom_responses: customResponses
        }
      }
    ])
  })

  it('keeps audited admin edits on the admin RPC', async () => {
    await ordersService.updateOrder('order-admin', {
      order_origin: 'admin_extra',
      company_slug: 'igarreta'
    }, {
      adminAudit: true,
      reason: 'Corrección administrativa'
    })

    expect(mockState.calls).toHaveLength(1)
    expect(mockState.calls[0][0]).toBe('rpc')
    expect(mockState.calls[0][1]).toBe('admin_update_order_with_reason')
    expect(mockState.calls[0][2]).toMatchObject({
      p_order_id: 'order-admin',
      p_updates: {
        order_origin: 'admin_extra',
        company_slug: 'igarreta'
      },
      p_reason: 'Corrección administrativa',
      p_request_id: expect.any(String)
    })
  })
})
