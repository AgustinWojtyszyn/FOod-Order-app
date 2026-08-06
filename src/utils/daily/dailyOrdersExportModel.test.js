import { describe, expect, it } from 'vitest'
import {
  buildDailyOrdersExcelDetailRows,
  buildDailyOrdersExcelFileName,
  buildDailyOrdersSummary,
  extractCustomResponses,
  extractOrderItems,
  formatDailyOrdersForWhatsApp
} from './dailyOrdersExportModel'

const baseOrder = {
  id: 'order-1',
  created_at: '2026-06-24T13:45:00.000Z',
  delivery_date: '2026-06-25',
  status: 'pending',
  service: 'lunch',
  customer_name: 'Ana Cliente',
  customer_email: 'ana@example.com',
  customer_phone: '',
  location: 'Genneia',
  total_items: 3,
  items: [
    { name: 'Opción 1 - BIDE DEL DIA', quantity: 2 },
    { name: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 1 }
  ],
  custom_responses: [
    { title: 'Guarnición', response: 'Puré' },
    { title: 'Bebida', response: 'Coca cola' },
    { title: 'Pan', response: 'Sin pan' }
  ],
  comments: 'Sin sal'
}

describe('daily orders export model', () => {
  it('extrae items normalizados sin mutar nombres de menú', () => {
    const items = extractOrderItems(baseOrder)

    expect(items).toEqual([
      expect.objectContaining({ label: 'Opción 1 - BIDE DEL DIA', quantity: 1 })
    ])
  })

  it('extrae bebida, guarnición y opciones adicionales', () => {
    const responses = extractCustomResponses(baseOrder)

    expect(responses.side).toBe('Puré')
    expect(responses.beverage).toBe('Coca cola')
    expect(responses.additional).toBe('Pan: Sin pan')
  })

  it('tolera pedido sin teléfono y custom_responses vacío', () => {
    const summary = buildDailyOrdersSummary([{ ...baseOrder, custom_responses: [], customer_phone: null }], 'pending')

    expect(summary.rows[0].telefono).toBe('')
    expect(summary.rows[0].guarnicion).toBe('')
    expect(summary.rows[0].bebida).toBe('')
    expect(summary.rows[0].opcionesAdicionales).toBe('')
  })

  it('calcula agrupación por ubicación y totales por menú', () => {
    const orders = [
      baseOrder,
      {
        ...baseOrder,
        id: 'order-2',
        customer_name: 'Bruno Cliente',
        location: 'La Laja',
        total_items: 1,
        items: [{ name: 'Opción 1 - BIDE DEL DIA', quantity: 1 }],
        comments: ''
      }
    ]

    const summary = buildDailyOrdersSummary(orders, 'pending')

    expect(summary.byLocation).toContainEqual({ label: 'Genneia', orders: 1, items: 1 })
    expect(summary.byLocation).toContainEqual({ label: 'La Laja', orders: 1, items: 1 })
    expect(summary.byMenu).toContainEqual({ label: 'Opción 1 - BIDE DEL DIA', quantity: 2 })
    expect(summary.byMenu).not.toContainEqual({ label: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 1 })
    expect(summary.byLocationMenu).toContainEqual({
      label: 'Genneia',
      orders: 1,
      items: 1,
      menus: [
        { label: 'Opción 1 - BIDE DEL DIA', quantity: 1 }
      ]
    })
    expect(summary.additionalByLocation).toContainEqual({
      label: 'Genneia',
      items: [
        { label: 'Coca cola', quantity: 1 },
        { label: 'Guarnición: Puré', quantity: 1 },
        { label: 'Pan: Sin pan', quantity: 1 }
      ]
    })
    expect(summary.commentsByLocation).toContainEqual({
      label: 'Genneia',
      comments: [{ comment: 'Sin sal', count: 1 }]
    })
    expect(summary.commentsCount).toBe(1)
  })

  it('mantiene Administración ServiFood como ubicación independiente en resúmenes y exportaciones', () => {
    const order = {
      ...baseOrder,
      id: 'order-admin-servifood',
      location: 'Administración ServiFood',
      total_items: 1,
      items: [{ name: 'Opción 1 - BIDE DEL DIA', quantity: 1 }],
      custom_responses: []
    }

    const summary = buildDailyOrdersSummary([order], 'pending')
    const rows = buildDailyOrdersExcelDetailRows([order])
    const text = formatDailyOrdersForWhatsApp([order], 'pending')

    expect(summary.byLocation).toContainEqual({ label: 'Administración ServiFood', orders: 1, items: 1 })
    expect(rows[0]['Ubicación / empresa']).toBe('Administración ServiFood')
    expect(text).toContain('Administración ServiFood')
    expect(text).toContain('Total Administración ServiFood: 1')
  })

  it('mantiene cantidad real y origen para pedidos extra administrativos', () => {
    const extraOrder = {
      ...baseOrder,
      order_origin: 'admin_extra',
      total_items: 5,
      items: [
        { name: 'Opción 1 - BIDE DEL DIA', quantity: 3 },
        { name: 'Opción 2 - Pollo', quantity: 2 }
      ],
      custom_responses: [
        { title: 'Bebida', response: ['Coca Cola', 'Coca Cola'], quantities: { 'Coca Cola': 2 } },
        { title: 'Postre', response: ['Flan', 'Flan', 'Fruta'], quantities: { Flan: 2, Fruta: 1 } }
      ]
    }

    const summary = buildDailyOrdersSummary([extraOrder], 'pending')
    const [row] = buildDailyOrdersExcelDetailRows([extraOrder])
    const whatsapp = formatDailyOrdersForWhatsApp([extraOrder], 'pending')

    expect(summary.totalItems).toBe(5)
    expect(summary.extraOrdersCount).toBe(1)
    expect(row.Origen).toBe('Extra')
    expect(row['Menú elegido']).toContain('Opción 1 - BIDE DEL DIA')
    expect(row['Menú elegido']).toContain('Opción 2 - Pollo')
    expect(summary.rows[0].bebida).toBe('Coca Cola (x2)')
    expect(row['Respuestas personalizadas']).toContain('Postre: Flan (x2), Fruta')
    expect(whatsapp).toContain('TOTAL GENERAL: 5 pedidos')
    expect(whatsapp).toContain('Extras cargados por admin: 1')
  })

  it('genera nombre de Excel con delivery_date y estado', () => {
    const summary = buildDailyOrdersSummary([baseOrder], 'pending')

    expect(buildDailyOrdersExcelFileName(summary)).toBe('Pedidos_ServiFood_2026-06-25_pending.xlsx')
  })

  it('genera filas de Excel manual con las mismas columnas de detalle que el reporte automático', () => {
    const rows = buildDailyOrdersExcelDetailRows([{
      ...baseOrder,
      customer_name: '',
      user_name: '',
      user_full_name: 'Nombre Desde Vista',
      customer_email: '',
      user_email: 'vista@example.com',
      customer_phone: null
    }])

    expect(Object.keys(rows[0])).toEqual([
      'Cliente',
      'Organización',
      'Ubicación / empresa',
      'Lugar de entrega',
      'Fecha de entrega',
      'Turno / servicio',
      'Menú elegido',
      'Opción elegida',
      'Guarniciones',
      'Respuestas personalizadas',
      'Origen',
      'Comentarios',
      'Estado'
    ])
    expect(rows[0]).toMatchObject({
      Cliente: 'Nombre Desde Vista',
      'Ubicación / empresa': 'Genneia',
      'Fecha de entrega': '25/06/2026',
      'Turno / servicio': 'Almuerzo',
      'Menú elegido': 'Opción 1 - BIDE DEL DIA',
      'Opción elegida': 'Opción 1 - BIDE DEL DIA (x1)',
      Guarniciones: 'Puré',
      'Respuestas personalizadas': 'Bebida: Coca cola | Pan: Sin pan',
      Origen: 'Normal',
      Comentarios: 'Sin sal',
      Estado: 'Pendiente'
    })
  })

  it('genera WhatsApp agrupando guarniciones debajo de cada menú por empresa', () => {
    const text = formatDailyOrdersForWhatsApp([
      {
        ...baseOrder,
        id: 'order-1',
        total_items: 5,
        items: [{ name: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 5 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
        comments: ''
      },
      {
        ...baseOrder,
        id: 'order-2',
        total_items: 1,
        items: [{ name: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Verduras' }],
        comments: ''
      },
      {
        ...baseOrder,
        id: 'order-3',
        total_items: 2,
        items: [{ name: 'Opción 5 - ENSALADA DEL FOOD', quantity: 2 }],
        custom_responses: [],
        comments: ''
      }
    ], 'pending')

    expect(text).toContain('📋 PEDIDOS SERVIFOOD')
    expect(text).toContain('Genneia')
    expect(text).toContain('Opción 4 - BIFE DEL DÍA CARNE: 2\n\n* 1 Puré\n* 1 Verduras')
    expect(text).toContain('Opción 5 - ENSALADA DEL FOOD: 1')
    expect(text).toContain('Total Genneia: 3')
    expect(text).toContain('✅ TOTAL GENERAL: 3 pedidos')
    expect(text).not.toContain('Ana Cliente')
    expect(text).not.toContain('ana@example.com')
    expect(text).not.toContain('Guarnición:')
  })

  it('incluye todos los menús de WhatsApp dentro de su empresa', () => {
    const orders = Array.from({ length: 11 }, (_, index) => ({
      ...baseOrder,
      id: `order-${index}`,
      customer_name: `Cliente ${index}`,
      customer_email: `cliente${index}@example.com`,
      items: [{ name: `Opción ${index + 1}`, quantity: 1 }],
      total_items: 1,
      comments: ''
    }))

    const text = formatDailyOrdersForWhatsApp(orders, 'pending')

    expect(text).toContain('Genneia')
    expect(text).toContain('Opción 11: 1')
    expect(text).not.toContain('opciones más en el Excel')
    expect(text).not.toContain('Cliente 1')
  })

  it('no duplica menú de cena como adicional en WhatsApp manual', () => {
    const text = formatDailyOrdersForWhatsApp([{
      ...baseOrder,
      id: 'dinner-1',
      location: 'Genneia',
      items: [{ name: 'Cena: PASTEL DE PAPAS', quantity: 1 }],
      custom_responses: [
        { title: 'Menú de cena', response: 'PASTEL DE PAPAS' },
        { title: 'Bebida', response: 'Coca cola' },
        { title: 'Postre (solo Genneia)', response: 'Fruta' }
      ],
      total_items: 1,
      comments: ''
    }], 'pending')

    expect(text).toContain('Cena: PASTEL DE PAPAS: 1')
    expect(text).toContain('Adicionales:')
    expect(text).toContain('* 1 Coca cola')
    expect(text).toContain('* 1 Postre (solo Genneia): Fruta')
    expect(text).not.toContain('Menú de cena: PASTEL DE PAPAS')
  })

  it('incluye bebida y fruta de DistroCuyo en resumen y Excel sin contarlas como menú', () => {
    const order = {
      ...baseOrder,
      id: 'distro-bebida-fruta',
      location: 'DistroCuyo',
      total_items: 1,
      items: [{ name: 'Opción 1 - POLLO', quantity: 1 }],
      custom_responses: [
        { title: 'Bebida', response: 'Coca Zero' },
        { title: 'Fruta', response: 'Fruta' }
      ],
      comments: ''
    }

    const summary = buildDailyOrdersSummary([order], 'pending')
    const rows = buildDailyOrdersExcelDetailRows([order])
    const text = formatDailyOrdersForWhatsApp([order], 'pending')

    expect(summary.additionalByLocation).toContainEqual({
      label: 'DistroCuyo',
      items: [
        { label: 'Coca Zero', quantity: 1 },
        { label: 'Fruta: Fruta', quantity: 1 }
      ]
    })
    expect(rows[0]).toMatchObject({
      'Ubicación / empresa': 'DistroCuyo',
      'Respuestas personalizadas': 'Bebida: Coca Zero | Fruta: Fruta'
    })
    expect(text).toContain('DistroCuyo')
    expect(text).toContain('Opción 1 - POLLO: 1')
    expect(text).toContain('Adicionales:')
    expect(text).toContain('* 1 Coca Zero')
    expect(text).toContain('* 1 Fruta: Fruta')
    expect(text).toContain('Total DistroCuyo: 1')
  })

  it('corrige formato de totales para muchos pedidos en WhatsApp', () => {
    const orders = Array.from({ length: 19 }, (_, index) => ({
      ...baseOrder,
      id: `bulk-${index}`,
      customer_name: `Cliente Bulk ${index}`,
      customer_email: `bulk${index}@example.com`,
      customer_phone: `26155599${index}`,
      items: [{ name: 'Menú principal - FILETE DE MERLUZA A LA ROMANA CON PURE MIXTO', quantity: 1 }],
      total_items: 1,
      comments: ''
    }))

    const text = formatDailyOrdersForWhatsApp(orders, 'pending')

    expect(text).toContain('Total Genneia: 19')
    expect(text).toContain('✅ TOTAL GENERAL: 19 pedidos')
    expect(text).not.toContain('Total de 19 pedidos')
    expect(text).not.toContain('bulk1@example.com')
    expect(text).not.toContain('261555991')
    expect(text).not.toContain('Cliente Bulk')
  })

  it('no mezcla la misma guarnición entre menús distintos', () => {
    const text = formatDailyOrdersForWhatsApp([
      {
        ...baseOrder,
        id: 'same-side-1',
        items: [{ id: 'op4', name: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Papas fritas', itemId: 'op4' }],
        total_items: 1,
        comments: ''
      },
      {
        ...baseOrder,
        id: 'same-side-2',
        items: [{ id: 'op5', name: 'Opción 5 - ENSALADA DEL FOOD', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Papas fritas', itemId: 'op5' }],
        total_items: 1,
        comments: ''
      }
    ], 'pending')

    expect(text).toContain('Opción 4 - BIFE DEL DÍA CARNE: 1\n\n* 1 Papas fritas')
    expect(text).toContain('Opción 5 - ENSALADA DEL FOOD: 1\n\n* 1 Papas fritas')
    expect(text).not.toContain('* 2 Papas fritas')
    expect(text).toContain('✅ TOTAL GENERAL: 2 pedidos')
  })

  it('fusiona una opción corta bajo el nombre completo del menú disponible', () => {
    const text = formatDailyOrdersForWhatsApp([
      {
        ...baseOrder,
        id: 'full-menu',
        items: [{ id: 'full-op4', name: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 1 }],
        custom_responses: [],
        total_items: 1,
        comments: ''
      },
      {
        ...baseOrder,
        id: 'short-menu',
        items: [{ id: 'short-op4', name: 'Opción 4', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Papas fritas', itemId: 'short-op4' }],
        total_items: 1,
        comments: ''
      }
    ], 'pending')

    expect(text).toContain('Opción 4 - BIFE DEL DÍA CARNE: 2\n\n* 1 Papas fritas')
    expect(text).not.toContain('\nOpción 4: 1\n')
    expect(text).toContain('Total Genneia: 2')
    expect(text).toContain('✅ TOTAL GENERAL: 2 pedidos')
  })

  it('normaliza múltiples menús históricos y asocia guarnición al menú preservado', () => {
    const text = formatDailyOrdersForWhatsApp([{
      ...baseOrder,
      id: 'unassigned-side',
      items: [
        { id: 'op4', name: 'Opción 4 - BIFE DEL DÍA CARNE', quantity: 1 },
        { id: 'op5', name: 'Opción 5 - ENSALADA DEL FOOD', quantity: 1 }
      ],
      custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
      total_items: 2,
      comments: ''
    }], 'pending')

    expect(text).toContain('Opción 4 - BIFE DEL DÍA CARNE: 1')
    expect(text).not.toContain('Opción 5 - ENSALADA DEL FOOD: 1')
    expect(text).toContain('* 1 Puré')
  })

  it('reporta inconsistencias por datos faltantes y cantidades inválidas', () => {
    const summary = buildDailyOrdersSummary([{
      id: 'bad-order',
      status: 'pending',
      delivery_date: '2026-06-25',
      items: [{ name: 'Opción X', quantity: 0 }],
      custom_responses: []
    }], 'pending')

    expect(summary.inconsistencies.map((row) => row.problema)).toEqual(
      expect.arrayContaining(['Sin cliente', 'Sin email', 'Sin ubicación', 'Cantidad histórica normalizada'])
    )
  })

  it('reporta cliente inválido si customer_name es numérico', () => {
    const summary = buildDailyOrdersSummary([{
      ...baseOrder,
      id: 'numeric-customer',
      customer_name: '125',
      items: [{ name: 'Menú principal - Pastel de papas', quantity: 1 }],
      total_items: 1
    }], 'archived')

    expect(summary.inconsistencies.map((row) => row.problema)).toContain('Cliente inválido')
  })

  it('no duplica almuerzos históricos inconsistentes y marca inconsistencia', () => {
    const summary = buildDailyOrdersSummary([{
      ...baseOrder,
      id: 'historical-duplicate',
      total_items: 2,
      items: [
        { id: 'main', name: 'Menú principal', quantity: 1 },
        { id: 'option-5', name: 'Opción 5 - Ensalada', quantity: 1 }
      ],
      custom_responses: [
        { title: 'Guarnición', response: 'Puré', itemId: 'main' },
        { title: 'Bebida', response: 'Agua' }
      ]
    }], 'pending')

    expect(summary.totalItems).toBe(1)
    expect(summary.byMenu).toEqual([{ label: 'Menú principal', quantity: 1 }])
    expect(summary.rows[0].bebida).toBe('Agua')
    expect(summary.rows[0].guarnicion).toBe('Puré')
    expect(summary.inconsistencies.map((row) => row.problema)).toEqual(
      expect.arrayContaining([
        'Más de un menú principal en almuerzo/cena',
        'Total histórico no coincide con items normalizados'
      ])
    )
  })
})
