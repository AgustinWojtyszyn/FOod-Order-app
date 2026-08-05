import { describe, expect, it } from 'vitest'
import {
  buildLabelOrder,
  getFruitDessertChoice,
  getOrderCustomerEmail,
  getOrderCustomerName
} from './labelOrderUtils'

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

  it('obtiene fruta o postre desde custom_responses para cualquier empresa', () => {
    const order = {
      location: 'Otra empresa',
      custom_responses: [
        { title: 'Bebida', response: 'Coca cola' },
        { title: 'Fruta o postre', response: 'Postre' }
      ]
    }

    expect(getFruitDessertChoice(order)).toBe('Postre')
    expect(buildLabelOrder(order).fruitDessertChoice).toBe('Postre')
  })

  it('no expone fruta o postre cuando la respuesta no es valida', () => {
    expect(getFruitDessertChoice({
      custom_responses: [
        { title: 'Fruta o postre', response: 'Sin elegir' }
      ]
    })).toBe('')

    expect(buildLabelOrder({
      custom_responses: [
        { title: 'Bebida', response: 'Agua' }
      ]
    }).fruitDessertChoice).toBe('')
  })
})
