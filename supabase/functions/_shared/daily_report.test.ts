import { describe, expect, it } from 'vitest'
import {
  DAILY_REPORT_ARCHIVE_STATUSES,
  DAILY_REPORT_SEND_STATUSES,
  buildArchiveCompletedPayload,
  buildArchiveFailedPayload,
  buildDailyReportFailurePayload,
  buildDailyReportRunPayload,
  buildDailySummary,
  buildEmailHtml,
  buildEmailText,
  createMockOrders,
  getArchiveOrdersRpcCall,
  getDefaultReportDate,
  getEmailSubject,
  getRecipientsForMode,
  canArchiveSuccessfulDailyReportRun,
  isOrderEligibleForReportArchive,
  isRecentSuccessfulDailyReportRun,
  isStaleRunningRun,
  isAuthorized,
  normalizeOrder,
  shouldArchiveOrdersForMode,
  shouldSendEmailForMode,
  shouldSkipExistingRun,
  shouldWriteDailyReportRun,
  usesMockOrdersForMode,
  usesRealOrdersForMode
} from './daily_report'

describe('daily report helpers', () => {
  it('calcula por defecto el día siguiente en America/Argentina/Buenos_Aires', () => {
    const runAt2210Art = new Date('2026-06-23T01:10:00.000Z')

    expect(getDefaultReportDate(runAt2210Art)).toBe('2026-06-23')
  })

  it('genera resumen con pedidos, ítems, ubicaciones, menú/opción, comentarios y warnings', () => {
    const orders = [
      normalizeOrder({
        id: '1',
        customer_name: 'Ana',
        customer_email: 'ana@example.com',
        location: 'Planta Norte',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 2,
        items: [{ name: 'Menú principal', option: 'Pollo', quantity: 2 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
        comments: 'Sin sal'
      }),
      normalizeOrder({
        id: '2',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 1,
        items: []
      })
    ]

    const summary = buildDailySummary(orders, '2026-06-23')

    expect(summary.totalOrders).toBe(2)
    expect(summary.totalItems).toBe(3)
    expect(summary.byLocation[0]).toEqual({ label: 'Planta Norte', orders: 1, items: 2 })
    expect(summary.byMenuOption).toContainEqual({ label: 'Menú principal - Pollo', quantity: 2 })
    expect(summary.byLocationMenu).toContainEqual({
      label: 'Planta Norte',
      orders: 1,
      items: 2,
      menus: [{
        label: 'Menú principal - Pollo',
        quantity: 2,
        sides: [{ label: 'Puré', quantity: 2 }]
      }]
    })
    expect(summary.additionalByLocation).toContainEqual({
      label: 'Planta Norte',
      items: [
        { label: 'Bebida: Agua sin gas', quantity: 2 },
        { label: 'Postre: Fruta', quantity: 2 }
      ]
    })
    expect(summary.commentsByLocation).toContainEqual({
      label: 'Planta Norte',
      comments: [{ comment: 'Sin sal', count: 1 }]
    })
    expect(summary.comments).toEqual(['Ana: Sin sal'])
    expect(summary.warnings.some((warning) => warning.includes('Pedido 2'))).toBe(true)
  })

  it('contabiliza pedidos extra administrativos desde la cantidad real del pedido', () => {
    const order = normalizeOrder({
      id: 'extra-1',
      user_id: null,
      customer_name: null,
      customer_email: null,
      location: 'CCP',
      company_slug: 'ccp',
      delivery_date: '2026-08-11',
      service: 'lunch',
      status: 'pending',
      order_origin: 'admin_extra',
      created_by_admin_id: 'admin-1',
      created_by_admin_email: 'admin@example.com',
      created_by_admin_name: 'Admin',
      total_items: 20,
      items: [{ name: 'Opción 1 - Pollo', quantity: 20 }],
      custom_responses: [{ title: 'Guarnición', response: ['Puré'], quantities: { Puré: 20 } }]
    })

    const summary = buildDailySummary([order], '2026-08-11')

    expect(order.total_items).toBe(20)
    expect(order.items).toEqual([{ name: 'Opción 1 - Pollo', quantity: 20 }])
    expect(summary.totalOrders).toBe(1)
    expect(summary.totalItems).toBe(20)
    expect(summary.byLocation).toContainEqual({ label: 'CCP', orders: 1, items: 20 })
    expect(summary.byMenuOption).toContainEqual({ label: 'Opción 1 - Pollo', quantity: 20 })
  })

  it('no duplica menú de cena como adicional pero lo conserva en detalle por empresa', () => {
    const summary = buildDailySummary([
      normalizeOrder({
        id: 'dinner-1',
        customer_name: 'Ana Cliente',
        customer_email: 'ana@example.com',
        location: 'Genneia',
        delivery_date: '2026-06-26',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Cena: PASTEL DE PAPAS', quantity: 1 }],
        custom_responses: [
          { title: 'Menú de cena', response: 'PASTEL DE PAPAS' },
          { title: 'Bebida', response: 'Coca cola' },
          { title: 'Postre (solo Genneia)', response: 'Fruta' }
        ],
        comments: ''
      })
    ], '2026-06-26')
    const html = buildEmailHtml(summary)
    const text = buildEmailText(summary)

    expect(summary.byLocationMenu[0].menus).toContainEqual({
      label: 'Cena: PASTEL DE PAPAS',
      quantity: 1,
      sides: []
    })
    expect(summary.additionalByLocation[0].items).toEqual([
      { label: 'Bebida: Coca cola', quantity: 1 },
      { label: 'Postre: Fruta', quantity: 1 }
    ])
    expect(html).toContain('Cena: PASTEL DE PAPAS')
    expect(text).toContain('- Cena: PASTEL DE PAPAS: 1')
    expect(html).toContain('Coca cola')
    expect(html).toContain('Postre: Fruta')
    expect(html).not.toContain('Menú de cena: PASTEL DE PAPAS')
    expect(text).not.toContain('Menú de cena: PASTEL DE PAPAS')
  })

  it('genera resumen y aviso cuando no hay pedidos', () => {
    const summary = buildDailySummary([], '2026-06-23')
    const text = buildEmailText(summary)

    expect(summary.totalOrders).toBe(0)
    expect(summary.emptyMessage).toBe('No hay pedidos pendientes para la fecha de entrega 23/06/2026.')
    expect(text).toContain('No hay pedidos pendientes')
  })

  it('deduplica comentarios exactos, escapa contenido dinámico y no muestra clientes en el HTML', () => {
    const orders = [
      normalizeOrder({
        id: '1',
        customer_name: '<Ana>',
        customer_email: 'ana@example.com',
        location: 'Planta <Norte>',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Menú <script>', option: 'Pollo', quantity: 1 }],
        comments: '<b>Sin sal</b>'
      }),
      normalizeOrder({
        id: '2',
        customer_name: '<Ana>',
        customer_email: 'ana@example.com',
        location: 'Planta <Norte>',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Menú <script>', option: 'Pollo', quantity: 1 }],
        comments: '<b>Sin sal</b>'
      })
    ]

    const summary = buildDailySummary(orders, '2026-06-23')
    const html = buildEmailHtml(summary, false, { logoUrl: 'https://example.com/logo.png?name="brand"' })

    expect(summary.comments).toEqual(['<Ana>: <b>Sin sal</b> (x2)'])
    expect(html).toContain('background:#2E3168')
    expect(html).toContain('bgcolor="#2E3168"')
    expect(html).toContain('src="https://example.com/logo.png?name=&quot;brand&quot;"')
    expect(html).toContain('alt="ServiFood Catering"')
    expect(html).toContain('display:block;margin:0 auto;max-width:180px;width:180px;height:auto;')
    expect(html).toContain('&lt;b&gt;Sin sal&lt;/b&gt;')
    expect(html).toContain('Planta &lt;Norte&gt;')
    expect(html).toContain('Detalle por ubicación / empresa')
    expect(html).toContain('Comentarios / observaciones por ubicación / empresa')
    expect(html).not.toContain('Totales por menú / opción')
    expect(html).not.toContain('Comentarios destacados')
    expect(html).not.toContain('Cliente')
    expect(html).not.toContain('&lt;Ana&gt;')
    expect(html).not.toContain('<Ana>')
    expect(html).not.toContain('<b>Sin sal</b>')
  })

  it('genera texto automático con detalle por ubicación sin datos personales', () => {
    const orders = [
      normalizeOrder({
        id: '1',
        customer_name: 'Ana Cliente',
        customer_email: 'ana@example.com',
        customer_phone: '2615551234',
        location: 'La Laja',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 2,
        items: [{ name: 'Opción 4', option: 'Bife', quantity: 2 }],
        custom_responses: [{ title: 'Bebida', response: 'Coca Zero' }],
        comments: 'Coca Zero'
      }),
      normalizeOrder({
        id: '2',
        customer_name: 'Bruno Cliente',
        customer_email: 'bruno@example.com',
        customer_phone: '2615555678',
        location: 'La Laja',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Menú principal', option: 'Merluza', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
        comments: 'Coca Zero'
      }),
      normalizeOrder({
        id: '3',
        customer_name: 'Carla Cliente',
        customer_email: 'carla@example.com',
        customer_phone: '2615559999',
        location: 'Genneia',
        delivery_date: '2026-06-23',
        status: 'pending',
        total_items: 3,
        items: [{ name: 'Opción 1', option: 'Pan de carne', quantity: 3 }],
        comments: ''
      })
    ]

    const text = buildEmailText(buildDailySummary(orders, '2026-06-23'))

    expect(text).toContain('Detalle por ubicación / empresa')
    expect(text).toContain('La Laja')
    expect(text).toContain('- Opción 4 - Bife: 2')
    expect(text).toContain('- Menú principal - Merluza: 1')
    expect(text).toContain('- Subtotal La Laja: 3 ítems')
    expect(text).toContain('Genneia')
    expect(text).toContain('- Opción 1 - Pan de carne: 3')
    expect(text).toContain('Adicionales por ubicación / empresa')
    expect(text).toContain('- Bebida: Coca Zero (x2)')
    expect(text).toContain('- Bebida: Agua sin gas')
    expect(text).toContain('- Postre: Fruta (x3)')
    expect(text).toContain('Guarnición: Puré')
    expect(text).toContain('Comentarios / observaciones por ubicación / empresa')
    expect(text).toContain('- Coca Zero (x2)')
    expect(text).toContain('- Sin comentarios destacados.')
    expect(text).not.toContain('Totales por menú / opción')
    expect(text).not.toContain('Comentarios destacados')
    expect(text).not.toContain('Ana Cliente')
    expect(text).not.toContain('Bruno Cliente')
    expect(text).not.toContain('Carla Cliente')
    expect(text).not.toContain('ana@example.com')
    expect(text).not.toContain('bruno@example.com')
    expect(text).not.toContain('carla@example.com')
    expect(text).not.toContain('2615551234')
    expect(text).not.toContain('2615555678')
  })

  it('asocia guarniciones al menú correspondiente sin agruparlas globalmente', () => {
    const summary = buildDailySummary([
      normalizeOrder({
        id: '1',
        customer_name: 'Ana Cliente',
        customer_email: 'ana@example.com',
        location: 'La Laja',
        delivery_date: '2026-06-23',
        service: 'lunch',
        status: 'pending',
        items: [{ name: 'Menú principal', option: 'Pollo', quantity: 2 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
        total_items: 2
      }),
      normalizeOrder({
        id: '2',
        customer_name: 'Bruno Cliente',
        customer_email: 'bruno@example.com',
        location: 'La Laja',
        delivery_date: '2026-06-23',
        service: 'dinner',
        status: 'pending',
        items: [{ name: 'Cena', option: 'Milanesa', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
        total_items: 1
      }),
      normalizeOrder({
        id: '3',
        customer_name: 'Carla Cliente',
        customer_email: 'carla@example.com',
        location: 'La Laja',
        delivery_date: '2026-06-23',
        service: 'lunch',
        status: 'pending',
        items: [{ name: 'Menú principal', option: 'Pollo', quantity: 1 }],
        custom_responses: [],
        total_items: 1
      })
    ], '2026-06-23')
    const text = buildEmailText(summary)

    expect(summary.totalItems).toBe(4)
    expect(summary.byLocationMenu[0].menus).toEqual([
      {
        label: 'Menú principal - Pollo',
        quantity: 3,
        sides: [{ label: 'Puré', quantity: 2 }]
      },
      {
        label: 'Cena - Milanesa',
        quantity: 1,
        sides: [{ label: 'Puré', quantity: 1 }]
      }
    ])
    expect(summary.additionalByLocation[0].items).toEqual([
      { label: 'Bebida: Agua sin gas', quantity: 4 },
      { label: 'Postre: Fruta', quantity: 4 }
    ])
    expect(text).toContain('- Menú principal - Pollo: 3\n  Guarnición: Puré (x2)')
    expect(text).toContain('- Cena - Milanesa: 1\n  Guarnición: Puré')
    expect(text).not.toContain('- Guarnición: Puré (x3)')
  })

  it('renderiza el HTML automático con detalle por empresa, adicionales y sin ranking global', () => {
    const summary = buildDailySummary([
      normalizeOrder({
        id: '1',
        customer_name: 'Ana Cliente',
        customer_email: 'ana@example.com',
        customer_phone: '2615551234',
        location: 'Genneia',
        delivery_date: '2026-06-26',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Cena', option: 'PASTEL DE PAPAS', quantity: 1 }],
        custom_responses: [{ title: 'Bebida', response: 'Coca cola' }],
        comments: 'Coca Zero almuerzo y cena por favor'
      }),
      normalizeOrder({
        id: '2',
        customer_name: 'Bruno Cliente',
        customer_email: 'bruno@example.com',
        customer_phone: '2615555678',
        location: 'Padre Bueno',
        delivery_date: '2026-06-26',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Opción 4', option: 'BIFE DEL DIA POLLO', quantity: 1 }],
        custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
        comments: ''
      }),
      normalizeOrder({
        id: '3',
        customer_name: 'Carla Cliente',
        customer_email: 'carla@example.com',
        customer_phone: '2615559999',
        location: 'La Laja',
        delivery_date: '2026-06-26',
        status: 'pending',
        total_items: 1,
        items: [{ name: 'Menú principal', option: 'PECHUGUITAS A LA CREMA CON PAPAS AL VERDEO', quantity: 1 }],
        custom_responses: [],
        comments: ''
      })
    ], '2026-06-26')

    const html = buildEmailHtml(summary, true)

    expect(html).toContain('PRUEBA - NO USAR PARA PRODUCCIÓN')
    expect(html).toContain('Detalle por ubicación / empresa')
    expect(html).toContain('Adicionales por ubicación / empresa')
    expect(html).toContain('Comentarios / observaciones por ubicación / empresa')
    expect(html).toContain('Genneia')
    expect(html).toContain('Cena - PASTEL DE PAPAS')
    expect(html).toContain('Padre Bueno')
    expect(html).toContain('Opción 4 - BIFE DEL DIA POLLO')
    expect(html).toContain('La Laja')
    expect(html).toContain('Menú principal - PECHUGUITAS A LA CREMA CON PAPAS AL VERDEO')
    expect(html).toContain('Coca cola')
    expect(html).toContain('Guarnición: Puré')
    expect(html).toContain('Bebida: Agua sin gas')
    expect(html).toContain('Postre: Fruta')
    expect(html).toContain('Coca Zero almuerzo y cena por favor')
    expect(html).toContain('Sin comentarios destacados.')
    expect(html).not.toContain('Totales por menú / opción')
    expect(html).not.toContain('Comentarios destacados')
    expect(html).not.toContain('Cliente')
    expect(html).not.toContain('Ana Cliente')
    expect(html).not.toContain('Bruno Cliente')
    expect(html).not.toContain('Carla Cliente')
    expect(html).not.toContain('ana@example.com')
    expect(html).not.toContain('2615551234')
  })

  it('mantiene fallback textual del logo dentro del header azul', () => {
    const summary = buildDailySummary([], '2026-06-23')
    const html = buildEmailHtml(summary, false, { logoUrl: '' })

    expect(html).toContain('background:#2E3168')
    expect(html).toContain('color:#ffffff;text-align:center;">ServiFood Catering</div>')
    expect(html).not.toContain('<img src=')
  })

  it('dryRun puede reutilizar resumen sin necesitar envío de email', () => {
    const summary = buildDailySummary(createMockOrders('2026-06-23'), '2026-06-23')

    expect(summary.totalOrders).toBe(3)
    expect(summary.totalItems).toBe(4)
  })

  it('testEmail usa mock interno y destinatario seguro por defecto', () => {
    const recipients = getRecipientsForMode({
      mode: 'testEmail',
      configuredRecipients: ['sarmientoclaudia985@gmail.com', 'agustinwojtyszyn99@gmail.com']
    })

    expect(createMockOrders('2026-06-23')).toHaveLength(3)
    expect(recipients).toEqual(['agustinwojtyszyn99@gmail.com'])
  })

  it('send incluye siempre los cuatro destinatarios productivos sin duplicados', () => {
    const recipients = getRecipientsForMode({
      mode: 'send',
      configuredRecipients: ['sarmientoclaudia985@gmail.com', 'agustinwojtyszyn99@gmail.com']
    })

    expect(recipients).toEqual([
      'sarmientoclaudia985@gmail.com',
      'agustinwojtyszyn99@gmail.com',
      'servifoodrecepcion@gmail.com',
      'sesquivel@calidra.com.ar'
    ])
  })

  it('testEmail respeta sendTo explícito', () => {
    const recipients = getRecipientsForMode({
      mode: 'testEmail',
      configuredRecipients: ['sarmientoclaudia985@gmail.com', 'agustinwojtyszyn99@gmail.com'],
      sendTo: 'sarmientoclaudia985@gmail.com'
    })

    expect(recipients).toEqual(['sarmientoclaudia985@gmail.com'])
  })

  it('testEmailReal usa pedidos reales y no mocks', () => {
    expect(usesRealOrdersForMode('testEmailReal')).toBe(true)
    expect(usesMockOrdersForMode('testEmailReal')).toBe(false)
    expect(usesRealOrdersForMode('testEmail', true)).toBe(true)
    expect(usesMockOrdersForMode('testEmail', true)).toBe(false)
    expect(usesMockOrdersForMode('testEmail')).toBe(true)
  })

  it('solo archiveAfterSuccessfulReport archiva y no envía email', () => {
    expect(shouldArchiveOrdersForMode('testEmailReal')).toBe(false)
    expect(shouldArchiveOrdersForMode('dryRun')).toBe(false)
    expect(shouldArchiveOrdersForMode('testEmail')).toBe(false)
    expect(shouldArchiveOrdersForMode('send')).toBe(false)
    expect(shouldArchiveOrdersForMode('archiveAfterSuccessfulReport')).toBe(true)
    expect(shouldWriteDailyReportRun('testEmailReal')).toBe(false)
    expect(shouldWriteDailyReportRun('send')).toBe(true)
    expect(shouldWriteDailyReportRun('archiveAfterSuccessfulReport')).toBe(false)
    expect(shouldSendEmailForMode('dryRun')).toBe(false)
    expect(shouldSendEmailForMode('archiveAfterSuccessfulReport')).toBe(false)
    expect(shouldSendEmailForMode('testEmail')).toBe(true)
    expect(shouldSendEmailForMode('send')).toBe(true)
  })

  it('archivado post reporte usa RPC seguro por delivery_date y status pending', () => {
    expect(getArchiveOrdersRpcCall('2026-06-26')).toEqual({
      rpcName: 'archive_orders_bulk_by_delivery_date',
      args: {
        p_delivery_date: '2026-06-26',
        p_statuses: ['pending']
      }
    })
  })

  it('archiveAfterSuccessfulReport no archiva si no existe daily_report_runs sent', () => {
    const now = new Date('2026-06-26T01:15:00.000Z')

    expect(isRecentSuccessfulDailyReportRun(null, now)).toBe(false)
  })

  it('archiveAfterSuccessfulReport no archiva si daily_report_runs está failed', () => {
    const now = new Date('2026-06-26T01:15:00.000Z')

    expect(isRecentSuccessfulDailyReportRun({
      status: 'failed',
      sent_at: '2026-06-26T01:10:00.000Z'
    }, now)).toBe(false)
  })

  it('archiveAfterSuccessfulReport no archiva si sent_at es null', () => {
    const now = new Date('2026-06-26T01:15:00.000Z')

    expect(isRecentSuccessfulDailyReportRun({
      status: 'sent',
      sent_at: null
    }, now)).toBe(false)
  })

  it('archiveAfterSuccessfulReport no archiva si sent_at es viejo', () => {
    const now = new Date('2026-06-26T01:45:01.000Z')

    expect(isRecentSuccessfulDailyReportRun({
      status: 'sent',
      sent_at: '2026-06-26T01:10:00.000Z'
    }, now)).toBe(false)
  })

  it('archiveAfterSuccessfulReport permite archivar si daily_report_runs está sent reciente', () => {
    const now = new Date('2026-06-26T01:15:00.000Z')

    expect(isRecentSuccessfulDailyReportRun({
      status: 'sent',
      sent_at: '2026-06-26T01:10:00.000Z'
    }, now)).toBe(true)
  })

  it('registra envío exitoso con pedidos y archivado pendiente', () => {
    const payload = buildDailyReportRunPayload({
      reportDate: '2026-06-26',
      reportType: 'daily_orders',
      status: DAILY_REPORT_SEND_STATUSES.SENT,
      ordersCount: 7,
      recipients: ['ops@example.com'],
      now: new Date('2026-06-25T22:05:00.000Z')
    })

    expect(payload).toMatchObject({
      status: 'sent',
      orders_count: 7,
      recipients: ['ops@example.com'],
      sent_at: '2026-06-25T22:05:00.000Z',
      archive_status: 'pending',
      archived_count: null,
      archive_error: null,
      archived_at: null
    })
  })

  it('deja archivado nulo para envío exitoso sin pedidos', () => {
    const payload = buildDailyReportRunPayload({
      reportDate: '2026-06-26',
      reportType: 'daily_orders',
      status: DAILY_REPORT_SEND_STATUSES.SENT_EMPTY,
      ordersCount: 0,
      recipients: ['ops@example.com'],
      now: new Date('2026-06-25T22:05:00.000Z')
    })

    expect(payload).toMatchObject({
      status: 'sent_empty',
      sent_at: '2026-06-25T22:05:00.000Z',
      archive_status: null,
      archived_count: null,
      archive_error: null,
      archived_at: null
    })
  })

  it('conserva envío aceptado si falla una persistencia posterior', () => {
    const payload = buildDailyReportFailurePayload({
      reportDate: '2026-06-26',
      reportType: 'daily_orders',
      ordersCount: 3,
      recipients: ['ops@example.com'],
      error: 'upsert failed after provider accepted email',
      emailAccepted: true,
      sentStatus: DAILY_REPORT_SEND_STATUSES.SENT,
      now: new Date('2026-06-25T22:06:00.000Z')
    })

    expect(payload).toMatchObject({
      status: 'sent',
      orders_count: 3,
      recipients: ['ops@example.com'],
      sent_at: '2026-06-25T22:06:00.000Z',
      error: 'upsert failed after provider accepted email',
      archive_status: 'pending'
    })
  })

  it('registra fallo real del proveedor sin perder ordersCount ni recipients', () => {
    const payload = buildDailyReportFailurePayload({
      reportDate: '2026-06-26',
      reportType: 'daily_orders',
      ordersCount: 4,
      recipients: ['ops@example.com', 'admin@example.com'],
      error: 'Resend respondió 500',
      emailAccepted: false
    })

    expect(payload).toMatchObject({
      status: 'failed',
      orders_count: 4,
      recipients: ['ops@example.com', 'admin@example.com'],
      sent_at: null,
      error: 'Resend respondió 500',
      archive_status: null,
      archived_count: null
    })
  })

  it('registra archivado exitoso y fallo de archivado separadamente del envío', () => {
    expect(buildArchiveCompletedPayload(5, new Date('2026-06-25T22:15:00.000Z'))).toEqual({
      archive_status: DAILY_REPORT_ARCHIVE_STATUSES.ARCHIVED,
      archived_count: 5,
      archive_error: null,
      archived_at: '2026-06-25T22:15:00.000Z'
    })

    expect(buildArchiveFailedPayload('rpc failed')).toEqual({
      archive_status: DAILY_REPORT_ARCHIVE_STATUSES.FAILED,
      archive_error: 'rpc failed',
      archived_count: null,
      archived_at: null
    })
  })

  it('permite reintentar archivado sin reenviar si existe envío exitoso', () => {
    expect(canArchiveSuccessfulDailyReportRun({
      status: 'sent',
      sent_at: '2026-06-25T22:00:00.000Z',
      archive_status: 'failed'
    })).toBe(true)
    expect(canArchiveSuccessfulDailyReportRun({
      status: 'sent',
      sent_at: '2026-06-25T22:00:00.000Z',
      archive_status: 'pending'
    })).toBe(true)
  })

  it('rechaza autoarchivado sin envío exitoso correspondiente', () => {
    expect(canArchiveSuccessfulDailyReportRun(null)).toBe(false)
    expect(canArchiveSuccessfulDailyReportRun({ status: 'failed', sent_at: null })).toBe(false)
    expect(canArchiveSuccessfulDailyReportRun({ status: 'sent', sent_at: null })).toBe(false)
    expect(canArchiveSuccessfulDailyReportRun({ status: 'sent_empty', sent_at: '2026-06-25T22:00:00.000Z' })).toBe(false)
    expect(canArchiveSuccessfulDailyReportRun({ status: 'sent', sent_at: '2026-06-25T22:00:00.000Z', archive_status: null })).toBe(false)
  })

  it('una ejecución repetida no reenvía si ya existe envío aceptado persistido', () => {
    expect(shouldSkipExistingRun({
      existingStatus: 'sent',
      existingCreatedAt: '2026-06-25T22:00:00.000Z',
      existingUpdatedAt: '2026-06-25T22:00:00.000Z'
    })).toBe(true)
  })

  it('archiva solo pending de reportDate y no toca otra fecha ni archived existentes', () => {
    const orders = [
      { id: 'pending-report-date', delivery_date: '2026-06-26', status: 'pending' },
      { id: 'pending-other-date', delivery_date: '2026-06-27', status: 'pending' },
      { id: 'archived-report-date', delivery_date: '2026-06-26', status: 'archived' }
    ]

    expect(orders.filter((order) => isOrderEligibleForReportArchive(order, '2026-06-26')).map((order) => order.id))
      .toEqual(['pending-report-date'])
  })

  it('archivado post reporte es idempotente si se ejecuta dos veces', () => {
    const orders = [
      { id: '1', delivery_date: '2026-06-26', status: 'pending' },
      { id: '2', delivery_date: '2026-06-26', status: 'archived' }
    ]
    const firstRun = orders.filter((order) => isOrderEligibleForReportArchive(order, '2026-06-26'))
    const afterFirstRun = orders.map((order) =>
      isOrderEligibleForReportArchive(order, '2026-06-26')
        ? { ...order, status: 'archived' }
        : order
    )
    const secondRun = afterFirstRun.filter((order) => isOrderEligibleForReportArchive(order, '2026-06-26'))

    expect(firstRun).toHaveLength(1)
    expect(secondRun).toHaveLength(0)
  })

  it('testEmailReal envía solo a destinatario de prueba', () => {
    const recipients = getRecipientsForMode({
      mode: 'testEmailReal',
      configuredRecipients: ['produccion1@example.com', 'produccion2@example.com'],
      configuredTestRecipients: ['test@example.com', 'otro-test@example.com']
    })

    expect(recipients).toEqual(['test@example.com'])
  })

  it('testEmailReal usa fallback de destinatario de prueba y asunto con fecha', () => {
    const recipients = getRecipientsForMode({
      mode: 'testEmailReal',
      configuredRecipients: ['produccion@example.com']
    })

    expect(recipients).toEqual(['agustinwojtyszyn99@gmail.com'])
    expect(getEmailSubject('2026-06-25', true)).toBe('PRUEBA - Reporte diario de pedidos ServiFood - 25/06/2026')
  })

  it('send evita duplicados salvo force', () => {
    expect(shouldSkipExistingRun({ existingStatus: 'sent', force: false })).toBe(true)
    expect(shouldSkipExistingRun({ existingStatus: 'sent_empty', force: false })).toBe(true)
    expect(shouldSkipExistingRun({ existingStatus: 'running', force: false })).toBe(true)
    expect(shouldSkipExistingRun({
      existingStatus: 'running',
      existingCreatedAt: '2026-06-25T10:31:00.000Z',
      existingUpdatedAt: '2026-06-25T10:00:00.000Z',
      now: new Date('2026-06-25T10:31:00.000Z'),
      force: false
    })).toBe(false)
    expect(shouldSkipExistingRun({ existingStatus: 'failed', force: false })).toBe(false)
    expect(shouldSkipExistingRun({ existingStatus: 'sent', force: true })).toBe(false)
  })

  it('detecta locks running stale solo después de 30 minutos', () => {
    const now = new Date('2026-06-25T10:31:00.000Z')

    expect(isStaleRunningRun({ updatedAt: '2026-06-25T10:00:00.000Z' }, now)).toBe(true)
    expect(isStaleRunningRun({ createdAt: '2026-06-25T10:00:00.000Z', updatedAt: '2026-06-25T10:30:00.000Z' }, now)).toBe(true)
    expect(isStaleRunningRun({ updatedAt: '2026-06-25T10:05:00.000Z' }, now)).toBe(false)
    expect(isStaleRunningRun({ updatedAt: null }, now)).toBe(false)
  })

  it('rechaza requests sin x-cron-secret correcto', () => {
    expect(isAuthorized(new Headers(), 'secret')).toBe(false)
    expect(isAuthorized(new Headers({ 'x-cron-secret': 'mal' }), 'secret')).toBe(false)
    expect(isAuthorized(new Headers({ 'x-cron-secret': 'secret' }), 'secret')).toBe(true)
  })
})
