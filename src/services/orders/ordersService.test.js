import { describe, expect, it, vi } from 'vitest'
import {
  createOrdersService,
  withSupabaseRetry
} from './ordersService'

class QueryBuilder {
  constructor(result, calls) {
    this.result = result
    this.calls = calls
  }

  select(value) {
    this.calls.push(['select', value])
    return this
  }

  gte(column, value) {
    this.calls.push(['gte', column, value])
    return this
  }

  lte(column, value) {
    this.calls.push(['lte', column, value])
    return this
  }

  eq(column, value) {
    this.calls.push(['eq', column, value])
    return this
  }

  in(column, value) {
    this.calls.push(['in', column, value])
    return this
  }

  order(column, options) {
    this.calls.push(['order', column, options])
    return this
  }

  limit(value) {
    this.calls.push(['limit', value])
    return this
  }

  range(from, to) {
    this.calls.push(['range', from, to])
    return this
  }

  then(resolve, reject) {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

const createSupabaseMock = (results) => {
  const calls = []
  const queue = [...results]
  return {
    calls,
    supabase: {
      from(table) {
        calls.push(['from', table])
        return new QueryBuilder(queue.shift() || { data: [], error: null }, calls)
      }
    }
  }
}

const createRpcSupabaseMock = (result = { data: 0, error: null }) => {
  const calls = []
  return {
    calls,
    supabase: {
      rpc(name, args) {
        calls.push(['rpc', name, args])
        return Promise.resolve(result)
      }
    }
  }
}

describe('ordersService daily orders query', () => {
  it('applies optional filters when loading orders', async () => {
    const { supabase, calls } = createSupabaseMock([{ data: [{ id: 'order-1' }], error: null }])
    const service = createOrdersService({ supabase })

    const result = await service.getOrders('user-1', {
      status: 'pending',
      deliveryDate: '2026-07-23',
      service: 'lunch',
      limit: 25
    })

    expect(result).toEqual({ data: [{ id: 'order-1' }], error: null })
    expect(calls).toContainEqual(['from', 'orders'])
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(calls).toContainEqual(['eq', 'status', 'pending'])
    expect(calls).toContainEqual(['eq', 'delivery_date', '2026-07-23'])
    expect(calls).toContainEqual(['eq', 'service', 'lunch'])
    expect(calls).toContainEqual(['limit', 25])
  })

  it('does not execute the legacy person-key query without a narrowing filter', async () => {
    const { supabase, calls } = createSupabaseMock([{ data: [{ id: 'should-not-load' }], error: null }])
    const service = createOrdersService({ supabase })

    const result = await service.getOrdersWithPersonKey()

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('getOrdersWithPersonKey requiere userId/personKey')
    expect(calls).toEqual([])
  })

  it('keeps the legacy person-key query available for user-scoped screens', async () => {
    const { supabase, calls } = createSupabaseMock([{ data: [{ id: 'order-1' }], error: null }])
    const service = createOrdersService({ supabase })

    const result = await service.getOrdersWithPersonKey({ userId: 'user-1' })

    expect(result).toEqual({ data: [{ id: 'order-1' }], error: null })
    expect(calls).toContainEqual(['from', 'orders_with_person_key'])
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }])
  })

  it('queries orders_with_person_key by delivery_date and statuses', async () => {
    const { supabase, calls } = createSupabaseMock([{ data: [{ id: 'order-1' }], error: null }])
    const service = createOrdersService({ supabase })

    const result = await service.getOrdersWithPersonKeyByDate({
      deliveryDate: '2026-07-02',
      statuses: ['pending', 'archived']
    })

    expect(result).toEqual({ data: [{ id: 'order-1' }], error: null })
    expect(calls).toContainEqual(['from', 'orders_with_person_key'])
    expect(calls).toContainEqual(['select', '*'])
    expect(calls).toContainEqual(['eq', 'delivery_date', '2026-07-02'])
    expect(calls).toContainEqual(['in', 'status', ['pending', 'archived']])
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }])
  })

  it('uses a status equality filter when a single status is requested', async () => {
    const { supabase, calls } = createSupabaseMock([{ data: [], error: null }])
    const service = createOrdersService({ supabase })

    await service.getOrdersWithPersonKeyByDate({
      deliveryDate: '2026-07-02',
      statuses: ['pending']
    })

    expect(calls).toContainEqual(['eq', 'status', 'pending'])
    expect(calls.some(([method]) => method === 'in')).toBe(false)
  })

  it('loads labels by delivery date, including orders created the previous day', async () => {
    const order = {
      id: 'order-1',
      created_at: '2026-08-04T21:15:00.000Z',
      delivery_date: '2026-08-05',
      status: 'archived'
    }
    const { supabase, calls } = createSupabaseMock([{ data: [order], error: null, count: 1 }])
    const service = createOrdersService({ supabase })

    const result = await service.getOrdersForLabels({
      deliveryDate: '2026-08-05',
      statuses: ['pending', 'archived'],
      limit: 50,
      offset: 0
    })

    expect(result).toEqual({ data: [order], error: null, count: 1 })
    expect(calls).toContainEqual(['from', 'orders_with_person_key'])
    expect(calls).toContainEqual(['select', '*'])
    expect(calls).toContainEqual(['eq', 'delivery_date', '2026-08-05'])
    expect(calls).toContainEqual(['in', 'status', ['pending', 'archived']])
    expect(calls).toContainEqual(['order', 'delivery_date', { ascending: false }])
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(calls).toContainEqual(['range', 0, 49])
    expect(calls).not.toContainEqual(['eq', 'created_at', '2026-08-05'])
  })
})

describe('ordersService admin cleanup RPCs', () => {
  it('keeps deleteArchivedOrders using a semantic text request id', async () => {
    const { supabase, calls } = createRpcSupabaseMock({ data: 3, error: null })
    const service = createOrdersService({ supabase })

    await expect(service.deleteArchivedOrders()).resolves.toEqual({ data: 3, error: null })

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('rpc')
    expect(calls[0][1]).toBe('admin_delete_archived_orders')
    expect(calls[0][2].p_request_id).toMatch(/^orders-archived-delete-/)
  })

  it('keeps deleteAllOrders using a semantic text request id', async () => {
    const { supabase, calls } = createRpcSupabaseMock({ data: 5, error: null })
    const service = createOrdersService({ supabase })

    await expect(service.deleteAllOrders()).resolves.toEqual({ data: 5, error: null })

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('rpc')
    expect(calls[0][1]).toBe('admin_delete_all_orders')
    expect(calls[0][2].p_request_id).toMatch(/^orders-all-delete-/)
  })
})

describe('ordersService admin extra RPCs', () => {
  it('creates admin extra orders through the secure RPC with idempotency', async () => {
    const { supabase, calls } = createRpcSupabaseMock({ data: { id: 'extra-1' }, error: null })
    const service = createOrdersService({ supabase })

    await expect(service.createAdminExtraOrder({
      customer_name: 'Visita Gerencia',
      company_slug: 'genneia'
    })).resolves.toEqual({ data: { id: 'extra-1' }, error: null })

    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe('create_admin_extra_order')
    expect(calls[0][2].p_payload.idempotency_key).toMatch(/^admin-extra-order-/)
    expect(calls[0][2].p_payload.customer_name).toBe('Visita Gerencia')
  })

  it('searches admin extra people through the limited RPC instead of users table scans', async () => {
    const { supabase, calls } = createRpcSupabaseMock({ data: [{ id: 'user-1' }], error: null })
    const service = createOrdersService({ supabase })

    await expect(service.searchAdminExtraOrderPeople({
      search: 'ana',
      companySlug: 'laja',
      limit: 8
    })).resolves.toEqual({ data: [{ id: 'user-1' }], error: null })

    expect(calls).toEqual([[
      'rpc',
      'search_admin_extra_order_people',
      { p_search: 'ana', p_company_slug: 'laja', p_limit: 8 }
    ]])
  })

  it('deletes admin extra orders through the secure delete RPC with reason and request id', async () => {
    const { supabase, calls } = createRpcSupabaseMock({ data: { deleted: true }, error: null })
    const service = createOrdersService({ supabase })

    await expect(service.deleteAdminExtraOrder({
      orderId: 'order-1',
      reason: 'Carga duplicada'
    })).resolves.toEqual({ data: { deleted: true }, error: null })

    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe('delete_admin_extra_order')
    expect(calls[0][2]).toMatchObject({
      p_order_id: 'order-1',
      p_reason: 'Carga duplicada'
    })
    expect(calls[0][2].p_request_id).toMatch(/^admin-extra-order-delete-/)
  })

  it('rejects deleteAdminExtraOrder locally without a mandatory reason', async () => {
    const { supabase, calls } = createRpcSupabaseMock({ data: { deleted: true }, error: null })
    const service = createOrdersService({ supabase })

    const result = await service.deleteAdminExtraOrder({ orderId: 'order-1', reason: '   ' })

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('reason es requerido')
    expect(calls).toEqual([])
  })
})

describe('withSupabaseRetry', () => {
  it('retries transient network errors and returns the successful result', async () => {
    const operation = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValueOnce({ data: [{ id: 'ok' }], error: null })

    await expect(withSupabaseRetry(operation, {
      attempts: 2,
      delays: [0],
      context: 'test transient'
    })).resolves.toEqual({ data: [{ id: 'ok' }], error: null })

    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry permission or RLS-style errors', async () => {
    const result = { data: null, error: { status: 403, message: 'permission denied for table orders' } }
    const operation = vi.fn().mockResolvedValue(result)

    await expect(withSupabaseRetry(operation, {
      attempts: 3,
      delays: [0],
      context: 'test permissions'
    })).resolves.toBe(result)

    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('propagates the final thrown error when all retry attempts fail', async () => {
    const finalError = new TypeError('Failed to fetch')
    const operation = vi.fn()
      .mockRejectedValueOnce(new TypeError('ERR_CONNECTION_CLOSED'))
      .mockRejectedValueOnce(finalError)

    await expect(withSupabaseRetry(operation, {
      attempts: 2,
      delays: [0],
      context: 'test final error'
    })).rejects.toBe(finalError)

    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('returns the final transient Supabase error result when retries are exhausted', async () => {
    const finalResult = { data: null, error: { status: 503, message: 'upstream unavailable' } }
    const operation = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'ERR_NETWORK' } })
      .mockResolvedValueOnce(finalResult)

    await expect(withSupabaseRetry(operation, {
      attempts: 2,
      delays: [0],
      context: 'test exhausted result'
    })).resolves.toBe(finalResult)

    expect(operation).toHaveBeenCalledTimes(2)
  })
})
