import { describe, expect, it } from 'vitest'
import { buildOrderPayload } from './orderPayload'
import { computePayloadSignature, buildIdempotencyStorageKey } from './orderIdempotency'

describe('order payload', () => {
  const user = {
    id: 'user-1',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' }
  }

  it('builds a normalized lunch payload', () => {
    const { orderData, idempotencySignature } = buildOrderPayload({
      service: 'lunch',
      user,
      formData: {
        location: 'Planta Norte',
        name: '',
        email: '',
        phone: '123',
        comments: 'Sin sal'
      },
      deliveryDate: '2026-06-20',
      itemsForService: [{ id: 'menu-1', name: 'Menu', quantity: 3, slotIndex: 0 }],
      responsesForService: [{ id: 'opt-1', title: 'Bebida', response: 'Agua' }],
      dinnerOverrideChoice: null,
      totalItems: 1,
      idempotencyKey: 'idem-1'
    })

    expect(orderData).toMatchObject({
      user_id: 'user-1',
      location: 'Planta Norte',
      customer_name: 'Test User',
      customer_email: 'test@example.com',
      service: 'lunch',
      status: 'pending',
      delivery_date: '2026-06-20',
      total_items: 1,
      idempotency_key: 'idem-1'
    })
    expect(orderData.items).toEqual([{ id: 'menu-1', name: 'Menu', quantity: 1, slotIndex: 0 }])
    expect(idempotencySignature).toBeTruthy()
  })

  it('adds one default refrigerio per Greif lunch menu without increasing menu total', () => {
    const { orderData } = buildOrderPayload({
      service: 'lunch',
      user,
      formData: {
        location: 'Greif',
        comments: ''
      },
      deliveryDate: '2026-08-25',
      itemsForService: [{ id: 'menu-1', name: 'Menu', quantity: 1, slotIndex: 0 }],
      responsesForService: [],
      dinnerOverrideChoice: null,
      totalItems: 1,
      idempotencyKey: 'idem-greif',
      companySlug: 'greif'
    })

    expect(orderData.total_items).toBe(1)
    expect(orderData.items).toEqual([{ id: 'menu-1', name: 'Menu', quantity: 1, slotIndex: 0 }])
    expect(orderData.custom_responses).toContainEqual(expect.objectContaining({
      id: 'greif-default-refrigerio',
      title: 'Refrigerio',
      quantity: 1,
      quantities: { Refrigerio: 1 },
      auto_applied: true
    }))
  })

  it('does not add the Greif refrigerio to other companies', () => {
    const { orderData } = buildOrderPayload({
      service: 'lunch',
      user,
      formData: {
        location: 'EPSE',
        comments: ''
      },
      deliveryDate: '2026-08-25',
      itemsForService: [{ id: 'menu-1', name: 'Menu', slotIndex: 0 }],
      responsesForService: [],
      dinnerOverrideChoice: null,
      totalItems: 1,
      idempotencyKey: 'idem-epse',
      companySlug: 'epse'
    })

    expect(orderData.custom_responses).toEqual([])
  })

  it('uses a dinner override item when dinner has no selected menu item', () => {
    const { orderData } = buildOrderPayload({
      service: 'dinner',
      user,
      formData: {
        location: 'Planta Norte',
        comments: ''
      },
      deliveryDate: '2026-06-20',
      itemsForService: [],
      responsesForService: [],
      dinnerOverrideChoice: 'Veggie',
      totalItems: 1,
      idempotencyKey: 'idem-2'
    })

    expect(orderData.service).toBe('dinner')
    expect(orderData.items).toEqual([
      {
        id: 'dinner-override',
        name: 'Cena: Veggie',
        quantity: 1,
        slotIndex: undefined
      }
    ])
  })

  it('defensively persists only one item per service', () => {
    const { orderData } = buildOrderPayload({
      service: 'lunch',
      user,
      formData: {
        location: 'Planta Norte',
        comments: ''
      },
      deliveryDate: '2026-06-20',
      itemsForService: [
        { id: 'main', name: 'Menú principal', slotIndex: 0 },
        { id: 'option-5', name: 'Opción 5 - Ensalada', slotIndex: 5 }
      ],
      responsesForService: [{ id: 'bebida', title: 'Bebida', response: 'Agua' }],
      dinnerOverrideChoice: null,
      totalItems: 2,
      idempotencyKey: 'idem-3'
    })

    expect(orderData.items).toEqual([
      { id: 'main', name: 'Menú principal', quantity: 1, slotIndex: 0 }
    ])
    expect(orderData.total_items).toBe(1)
    expect(orderData.custom_responses).toEqual([{ id: 'bebida', title: 'Bebida', response: 'Agua' }])
  })

  it('replaces numeric customer name with a valid metadata name', () => {
    const { orderData } = buildOrderPayload({
      service: 'lunch',
      user,
      formData: {
        location: 'Planta Norte',
        name: '125',
        comments: ''
      },
      deliveryDate: '2026-06-20',
      itemsForService: [{ id: 'menu-1', name: 'Menu', slotIndex: 0 }],
      responsesForService: [],
      dinnerOverrideChoice: null,
      totalItems: 1,
      idempotencyKey: 'idem-4'
    })

    expect(orderData.customer_name).toBe('Test User')
  })
})

describe('order idempotency', () => {
  it('creates stable signatures regardless of item order', () => {
    const a = computePayloadSignature(
      [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }],
      [],
      '',
      '2026-06-20',
      'Base',
      'lunch'
    )
    const b = computePayloadSignature(
      [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      [],
      '',
      '2026-06-20',
      'Base',
      'lunch'
    )

    expect(a).toBe(b)
  })

  it('scopes storage keys by user, location, service and signature', () => {
    const key = buildIdempotencyStorageKey(
      [{ id: 'menu-1' }],
      'Planta Norte',
      'abc123',
      'dinner',
      'user-1'
    )

    expect(key).toBe('order-idempotency-user-1-planta-norte-dinner-menu-1-abc123')
  })
})
