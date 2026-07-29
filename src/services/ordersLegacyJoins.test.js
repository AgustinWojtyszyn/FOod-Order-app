import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  calls: [],
  queue: []
}))

class QueryBuilder {
  constructor(result) {
    this.result = result
  }

  select(value) {
    mockState.calls.push(['select', value])
    return this
  }

  eq(column, value) {
    mockState.calls.push(['eq', column, value])
    return this
  }

  or(value) {
    mockState.calls.push(['or', value])
    return this
  }

  order(column, options) {
    mockState.calls.push(['order', column, options])
    return this
  }

  range(from, to) {
    mockState.calls.push(['range', from, to])
    return this
  }

  limit(value) {
    mockState.calls.push(['limit', value])
    return this
  }

  single() {
    mockState.calls.push(['single'])
    return Promise.resolve(this.result)
  }

  then(resolve, reject) {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

vi.mock('./supabase', () => ({
  supabase: {
    from(table) {
      mockState.calls.push(['from', table])
      return new QueryBuilder(mockState.queue.shift() || { data: [], error: null })
    }
  },
  supabaseService: {
    cachedQuery: vi.fn((_key, queryFn) => queryFn()),
    withRetry: vi.fn((operation) => operation()),
    invalidateCache: vi.fn()
  },
  sanitizeQuery: vi.fn((value) => value),
  instrumentRpc: vi.fn()
}))

vi.mock('./users', () => ({
  usersService: {
    getUserById: vi.fn()
  }
}))

const { ordersService } = await import('./orders')

const orderWithUser = {
  id: 'order-with-user',
  user_id: 'user-1',
  customer_name: 'Ana Cliente',
  customer_email: 'ana@example.com',
  users: {
    id: 'user-1',
    full_name: 'Ana Perfil',
    email: 'ana@example.com'
  }
}

const orphanOrder = {
  id: 'orphan-order',
  user_id: null,
  customer_name: 'Historico Conservado',
  customer_email: 'historico@example.com',
  users: null
}

const missingProfileOrder = {
  id: 'missing-profile-order',
  user_id: 'deleted-user',
  customer_name: '',
  customer_email: '',
  users: null
}

describe('legacy orders user joins', () => {
  beforeEach(() => {
    mockState.calls = []
    mockState.queue = []
  })

  it('lista pedidos con relacion de usuario opcional sin excluir huerfanos', async () => {
    mockState.queue = [{ data: [orderWithUser, orphanOrder, missingProfileOrder], error: null }]

    const result = await ordersService.getOrders(null, {
      includeUserData: true,
      status: 'archived',
      deliveryDate: '2026-07-20',
      service: 'lunch',
      limit: 25,
      offset: 0,
      force: true
    })

    expect(mockState.calls).toContainEqual(['select', '*, users(*)'])
    expect(mockState.calls).not.toContainEqual(['select', '*, users!inner(*)'])
    expect(mockState.calls).toContainEqual(['eq', 'status', 'archived'])
    expect(mockState.calls).toContainEqual(['eq', 'delivery_date', '2026-07-20'])
    expect(mockState.calls).toContainEqual(['eq', 'service', 'lunch'])
    expect(mockState.calls).toContainEqual(['range', 0, 24])
    expect(result.data).toHaveLength(3)
    expect(result.data[1]).toMatchObject({
      id: 'orphan-order',
      user_id: null,
      user_name: 'Historico Conservado',
      user_email: 'historico@example.com',
      users: { full_name: 'Usuario eliminado' }
    })
    expect(result.data[2]).toMatchObject({
      id: 'missing-profile-order',
      user_name: 'Usuario eliminado',
      users: { id: 'deleted-user', full_name: 'Usuario eliminado' }
    })
  })

  it('obtiene detalle editable de pedido huerfano sin fallback de consulta base', async () => {
    mockState.queue = [{ data: orphanOrder, error: null }]

    const result = await ordersService.getOrderById('orphan-order')

    expect(mockState.calls).toContainEqual(['select', '*, users(*)'])
    expect(mockState.calls.filter(([method]) => method === 'from')).toEqual([['from', 'orders']])
    expect(mockState.calls).toContainEqual(['eq', 'id', 'orphan-order'])
    expect(result.data).toMatchObject({
      id: 'orphan-order',
      users: { full_name: 'Usuario eliminado' },
      user_name: 'Historico Conservado'
    })
  })

  it('busca pedidos huerfanos manteniendo filtros actuales', async () => {
    mockState.queue = [{ data: [orphanOrder], error: null }]

    const result = await ordersService.searchOrders('historico', null, {
      status: 'archived',
      limit: 10
    })

    expect(mockState.calls).toContainEqual(['select', '*, users(*)'])
    expect(mockState.calls).toContainEqual(['or', 'customer_name.ilike.%historico%,location.ilike.%historico%,comments.ilike.%historico%'])
    expect(mockState.calls).toContainEqual(['eq', 'status', 'archived'])
    expect(mockState.calls).toContainEqual(['limit', 10])
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 'orphan-order',
      users: { full_name: 'Usuario eliminado' },
      user_name: 'Historico Conservado'
    })
  })
})
