import { describe, expect, it } from 'vitest'
import { buildEditOrderPayload } from './buildEditOrderPayload'

const user = {
  id: 'user-1',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' }
}

describe('buildEditOrderPayload', () => {
  it('preserves Genneia dinner override beverage with canonical title', () => {
    const payload = buildEditOrderPayload({
      formData: {
        location: 'Genneia',
        name: '',
        email: '',
        phone: '',
        comments: ''
      },
      user,
      service: 'dinner',
      selectedItemsList: [],
      customOptions: [
        { id: 'dinner-special', title: 'Opción de cena', active: true },
        { id: 'bebida-cena', title: 'Bebida', active: true, options: ['Agua', 'Coca cola', 'Coca Zero', 'Soda'] }
      ],
      customResponses: {
        'dinner-special': 'Menú principal cena',
        'bebida-cena': 'Coca Zero'
      },
      originalOrder: {
        service: 'dinner',
        location: 'Genneia',
        items: []
      }
    })

    expect(payload.items).toEqual([
      { id: 'dinner-override', name: 'Cena: Menú principal cena', quantity: 1, isDinnerOverride: true }
    ])
    expect(payload.custom_responses).toEqual([
      { id: 'dinner-special', title: 'Opción de cena', response: 'Menú principal cena' },
      { id: 'bebida-cena', title: 'Bebidas (solo Genneia)', response: 'Coca Zero' }
    ])
  })
})
