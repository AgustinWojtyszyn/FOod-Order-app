import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ordersService } from '../../services/orders'
import { submitOrders } from './orderSubmit'

vi.mock('../../services/orders', () => ({
  ordersService: {
    getOrders: vi.fn(),
    createOrder: vi.fn()
  }
}))

describe('order submit menu guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ordersService.getOrders.mockResolvedValue({ data: [], error: null })
  })

  it('rejects the synthetic vegetarian fallback before creating an order', async () => {
    const result = await submitOrders({
      turnosSeleccionados: ['lunch'],
      selectedItemsList: [
        { id: 4, name: 'Plato Principal 4', description: 'Plato vegetariano', quantity: 1 }
      ],
      selectedItemsListDinner: [],
      customResponsesArray: [],
      customResponsesDinnerArray: [],
      dinnerOverrideChoice: null,
      user: { id: 'user-1' },
      formData: { location: 'Greif' },
      deliveryDate: '2026-09-09',
      deliveryDates: { lunch: '2026-09-09' },
      companySlug: 'greif'
    })

    expect(result).toMatchObject({
      ok: false,
      forceLunchOnly: false
    })
    expect(result.errorMessage).toMatch(/desactualizado|no está disponible/i)
    expect(ordersService.createOrder).not.toHaveBeenCalled()
  })
})
