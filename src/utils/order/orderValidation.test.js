import { describe, expect, it } from 'vitest'
import { validateOrderSubmission } from './orderValidation'

const user = {
  id: 'user-1',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' }
}

const baseArgs = (overrides = {}) => ({
  user,
  formData: {
    location: 'Genneia',
    name: '',
    email: '',
    phone: '',
    comments: ''
  },
  selectedTurns: { lunch: true, dinner: false },
  dinnerEnabled: false,
  dinnerMenuEnabled: false,
  pendingLunch: false,
  pendingDinner: false,
  visibleLunchOptions: [],
  visibleDinnerOptions: [],
  customResponses: {},
  customResponsesDinner: {},
  isGenneiaPostreOption: (option) => (option?.title || '').toLowerCase().includes('postre'),
  getSelectedItemsList: () => [{ id: 'main', name: 'Menú principal', slotIndex: 0 }],
  getSelectedItemsListDinner: () => [],
  getDinnerOverrideChoice: () => null,
  dinnerSpecialTitle: '',
  validateDinnerExclusivity: () => '',
  calculateTotal: () => 1,
  _calculateTotalDinner: () => 0,
  companyConfig: { slug: 'genneia', name: 'Genneia' },
  isOutsideWindow: () => false,
  selectedDinnerDate: null,
  ...overrides
})

describe('order validation', () => {
  it('blocks lunch with main menu plus option 5 salad', () => {
    const result = validateOrderSubmission(baseArgs({
      getSelectedItemsList: () => [
        { id: 'main', name: 'Menú principal', slotIndex: 0 },
        { id: 'option-5', name: 'Opción 5 - Ensalada', slotIndex: 5 }
      ],
      calculateTotal: () => 2
    }))

    expect(result.error).toBe('Solo podés seleccionar 1 comida principal por persona para almuerzo o cena.')
  })

  it('uses a valid profile name when form name is numeric', () => {
    const result = validateOrderSubmission(baseArgs({
      formData: {
        location: 'Genneia',
        name: '125',
        email: '',
        phone: '',
        comments: ''
      },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        user_metadata: { full_name: 'Roberto Canete' }
      }
    }))

    expect(result.error).toBe('')
    expect(result.data.confirmationData.name).toBe('Roberto Canete')
  })

  it('blocks submission when customer name is numeric and no valid fallback exists', () => {
    const result = validateOrderSubmission(baseArgs({
      formData: {
        location: 'Genneia',
        name: '125',
        email: '',
        phone: '',
        comments: ''
      },
      user: {
        id: 'user-1',
        email: 'test@example.com',
        user_metadata: {}
      }
    }))

    expect(result.error).toBe('No pudimos validar tu nombre. Completá tu nombre real en el perfil antes de enviar el pedido.')
  })

  it('allows option 5 salad as the only lunch item', () => {
    const result = validateOrderSubmission(baseArgs({
      getSelectedItemsList: () => [{ id: 'option-5', name: 'Opción 5 - Ensalada', slotIndex: 5 }]
    }))

    expect(result.error).toBe('')
    expect(result.data.selectedItemsList).toHaveLength(1)
    expect(result.data.selectedItemsList[0].id).toBe('option-5')
  })

  it('blocks Greif lunch with menu and Refrigerio selected together', () => {
    const result = validateOrderSubmission(baseArgs({
      formData: {
        location: 'Greif',
        name: '',
        email: '',
        phone: '',
        comments: ''
      },
      companyConfig: { slug: 'greif', name: 'Greif' },
      getSelectedItemsList: () => [
        { id: 'main', name: 'Menú principal', slotIndex: 0 },
        { id: 'greif-refrigerio', name: 'Refrigerio', isGreifRefrigerio: true, slotIndex: 6 }
      ],
      calculateTotal: () => 2
    }))

    expect(result.error).toBe('Para Greif elegí Refrigerio o menú, no ambos.')
  })

  it('keeps Genneia beverage and dessert as custom responses, not items', () => {
    const result = validateOrderSubmission(baseArgs({
      visibleLunchOptions: [
        { id: 'bebida', title: 'Bebida', required: false },
        { id: 'postre', title: 'Postre Genneia', required: false }
      ],
      customResponses: {
        bebida: 'Agua',
        postre: 'Fruta'
      }
    }))

    expect(result.error).toBe('')
    expect(result.data.selectedItemsList).toHaveLength(1)
    expect(result.data.customResponsesArray).toEqual([
      { id: 'bebida', title: 'Bebidas (solo Genneia)', response: 'Agua' },
      { id: 'postre', title: 'Postre Genneia', response: 'Fruta' }
    ])
  })

  it('keeps Genneia dinner override beverage with canonical title', () => {
    const result = validateOrderSubmission(baseArgs({
      selectedTurns: { lunch: false, dinner: true },
      dinnerEnabled: true,
      dinnerMenuEnabled: true,
      visibleDinnerOptions: [
        { id: 'bebida-cena', title: 'Bebida', required: true, options: ['Agua', 'Coca cola', 'Coca Zero', 'Soda'] }
      ],
      customResponsesDinner: {
        'bebida-cena': 'Soda'
      },
      getSelectedItemsList: () => [],
      getSelectedItemsListDinner: () => [],
      getDinnerOverrideChoice: () => 'Menú principal cena',
      dinnerSpecialTitle: 'Opción de cena',
      calculateTotal: () => 0
    }))

    expect(result.error).toBe('')
    expect(result.data.customResponsesDinnerArray).toEqual([
      { id: 'dinner-special', title: 'Opción de cena', response: 'Menú principal cena' },
      { id: 'bebida-cena', title: 'Bebidas (solo Genneia)', response: 'Soda' }
    ])
  })

  it('keeps DistroCuyo beverage and dessert as custom responses, not items', () => {
    const result = validateOrderSubmission(baseArgs({
      formData: {
        location: 'DistroCuyo',
        name: '',
        email: '',
        phone: '',
        comments: ''
      },
      companyConfig: { slug: 'distro_cuyo', name: 'DistroCuyo' },
      visibleLunchOptions: [
        { id: 'bebida', title: 'Bebida', required: false },
        { id: 'postre', title: 'Postre', required: false }
      ],
      customResponses: {
        bebida: 'Coca Zero',
        postre: 'Fruta'
      }
    }))

    expect(result.error).toBe('')
    expect(result.data.selectedItemsList).toHaveLength(1)
    expect(result.data.customResponsesArray).toEqual([
      { id: 'bebida', title: 'Bebida', response: 'Coca Zero' },
      { id: 'postre', title: 'Postre', response: 'Fruta' }
    ])
  })

  it('blocks custom side for menus that do not accept it', () => {
    const result = validateOrderSubmission(baseArgs({
      getSelectedItemsList: () => [{ id: 'option-5', name: 'Opción 5 - Ensalada', slotIndex: 5 }],
      visibleLunchOptions: [{ id: 'side', title: 'Guarnición distinta', required: false }],
      customResponses: { side: 'Puré' }
    }))

    expect(result.error).toBe('La guarnición distinta no está disponible para esta opción.')
  })

  it('adds side metadata for menus that accept custom side', () => {
    const result = validateOrderSubmission(baseArgs({
      getSelectedItemsList: () => [{ id: 'option-2', name: 'Opción 2 - Pollo', slotIndex: 2 }],
      visibleLunchOptions: [{ id: 'side', title: 'Guarnición distinta', required: false }],
      customResponses: { side: 'Puré' }
    }))

    expect(result.error).toBe('')
    expect(result.data.customResponsesArray).toEqual([
      {
        id: 'side',
        title: 'Guarnición distinta',
        response: 'Puré',
        item_id: 'option-2',
        itemId: 'option-2',
        itemName: 'Opción 2 - Pollo',
        slotIndex: 2,
        service: 'lunch'
      }
    ])
  })
})
