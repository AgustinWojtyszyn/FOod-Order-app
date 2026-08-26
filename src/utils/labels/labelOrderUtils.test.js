import { describe, expect, it } from 'vitest'
import {
  buildLabelOrder,
  getFruitDessertChoice,
  getOrderCustomerEmail,
  getOrderCustomerName,
  orderMatchesLabelFilters
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

  it('agrega la sede de origen a las etiquetas EPSE', () => {
    expect(buildLabelOrder({
      company_slug: 'epse',
      company_name: 'EPSE',
      location: 'EPSE – Anchipurac',
      delivery_location: 'EPSE – Planta Fotovoltaica'
    }).companyLabel).toBe('EPSE – Anchipurac')

    expect(buildLabelOrder({
      company_slug: 'epse',
      company_name: 'EPSE',
      location: 'EPSE – Planta Fotovoltaica',
      delivery_location: 'EPSE – Planta Fotovoltaica'
    }).companyLabel).toBe('EPSE – Planta FV')
  })

  it('usa el snapshot de origen y deja EPSE solo si falta la locación', () => {
    expect(buildLabelOrder({
      company_slug: 'epse',
      company_name: 'EPSE',
      requesting_location_code: 'EPSE_ESTACION',
      delivery_location: 'EPSE – Planta Fotovoltaica'
    }).companyLabel).toBe('EPSE – Estación')

    expect(buildLabelOrder({ company_slug: 'epse', company_name: 'EPSE' }).companyLabel).toBe('EPSE')
  })

  it('mantiene sin cambios las etiquetas de otras empresas', () => {
    expect(buildLabelOrder({
      company_slug: 'laja',
      company_name: 'La Laja',
      location: 'La Laja',
      delivery_location: 'Otra sede'
    }).companyLabel).toBe('La Laja')
  })

  it('oculta las bebidas en todas las etiquetas EPSE y las mantiene para otras empresas', () => {
    const orderWithDrink = {
      company_slug: 'epse',
      company_name: 'EPSE',
      location: 'EPSE – Anchipurac',
      custom_responses: [{ title: 'Bebida', response: 'Agua' }]
    }

    expect(buildLabelOrder(orderWithDrink).beverages).toEqual([])
    expect(buildLabelOrder({ ...orderWithDrink, company_slug: 'laja', company_name: 'La Laja' }).beverages).toEqual(['Agua'])
  })

  it('filtra explícitamente por empresa sin confundir empresas representativas', () => {
    const orders = [
      { company_slug: 'genneia', company_name: 'Genneia' },
      { company_slug: 'greif', company_name: 'Greif' },
      { company_slug: 'molinos', company_name: 'Molinos' },
      { company_slug: 'placo', company_name: 'Placo' },
      { company_slug: 'epse', company_name: 'EPSE', location: 'EPSE – Planta Fotovoltaica' }
    ]

    orders.forEach((order) => {
      expect(orderMatchesLabelFilters(order, { company: order.company_slug })).toBe(true)
      expect(orders.filter(candidate => orderMatchesLabelFilters(candidate, { company: order.company_slug }))).toEqual([order])
    })
  })
})
