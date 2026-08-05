import { describe, expect, it } from 'vitest'
import { buildLabelOrder, getOrderCustomerEmail, getOrderCustomerName } from './labelOrderUtils'

describe('labelOrderUtils', () => {
  it('prioriza el nombre guardado en el pedido sobre datos del usuario', () => {
    const order = {
      customer_name: 'Nombre desde la app',
      user_name: 'Nombre de autenticacion',
      customer_email: 'pedido@example.com',
      user_email: 'auth@example.com'
    }

    expect(getOrderCustomerName(order)).toBe('Nombre desde la app')
    expect(getOrderCustomerEmail(order)).toBe('pedido@example.com')
    expect(buildLabelOrder(order).customerName).toBe('Nombre desde la app')
  })

  it('usa fallbacks solo cuando el pedido no tiene nombre persistido', () => {
    expect(getOrderCustomerName({ user_name: 'Usuario Auth' })).toBe('Usuario Auth')
    expect(getOrderCustomerName({ customer_email: 'cliente@example.com' })).toBe('cliente@example.com')
  })
})
