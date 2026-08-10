export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'
export const DAILY_REPORT_TYPE = 'daily_orders'
export const DAILY_REPORT_TEST_TYPE = 'daily_orders_test'

export const DAILY_REPORT_SEND_STATUSES = {
  RUNNING: 'running',
  SENT: 'sent',
  SENT_EMPTY: 'sent_empty',
  FAILED: 'failed'
} as const

export const DAILY_REPORT_ARCHIVE_STATUSES = {
  PENDING: 'pending',
  ARCHIVED: 'archived',
  FAILED: 'failed'
} as const

const DEFAULT_TEST_RECIPIENT = 'agustinwojtyszyn99@gmail.com'
const PERMANENT_REPORT_RECIPIENTS = [
  'sarmientoclaudia985@gmail.com',
  'agustinwojtyszyn99@gmail.com',
  'servifoodrecepcion@gmail.com',
  'sesquivel@calidra.com.ar'
]

const pad = (value: number) => String(value).padStart(2, '0')

export type DailyReportMode = 'send' | 'dryRun' | 'testEmail' | 'testEmailReal' | 'archiveAfterSuccessfulReport'

export type DailyReportPayload = {
  mode?: DailyReportMode
  reportDate?: string
  force?: boolean
  allowEmpty?: boolean
  sendTo?: string
  useRealData?: boolean
}

export type NormalizedOrder = {
  id?: string
  customer_name?: string | null
  user_name?: string | null
  customer_email?: string | null
  user_email?: string | null
  customer_phone?: string | null
  location?: string | null
  delivery_location?: string | null
  organization?: string | null
  company?: string | null
  company_name?: string | null
  delivery_date?: string | null
  service?: string | null
  items: Array<Record<string, unknown>>
  custom_responses: Array<Record<string, unknown>>
  comments?: string | null
  status?: string | null
  total_items?: number | null
  order_origin?: string | null
  created_by_admin_id?: string | null
  admin_extra_created_at?: string | null
  created_at?: string | null
  normalization_warnings?: string[]
}

export type DailyReportRunLike = {
  status?: string | null
  sent_at?: string | null
  archive_status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type DailySummary = {
  reportDate: string
  displayDate: string
  totalOrders: number
  totalItems: number
  byLocation: Array<{ label: string; orders: number; items: number }>
  byDeliveryLocation: Array<{ label: string; orders: number; items: number }>
  byMenuOption: Array<{ label: string; quantity: number }>
  byLocationMenu: Array<{
    label: string
    orders: number
    items: number
    menus: Array<{ label: string; quantity: number; sides: Array<{ label: string; quantity: number }> }>
  }>
  additionalByLocation: Array<{ label: string; items: Array<{ label: string; quantity: number }> }>
  comments: Array<string>
  commentRows: Array<{ customer: string; comment: string; count: number }>
  commentsByLocation: Array<{ label: string; comments: Array<{ comment: string; count: number }> }>
  warnings: Array<string>
  emptyMessage?: string
}

export const parseRecipients = (raw = ''): string[] =>
  raw
    .split(',')
    .map((value) => value.replace(/^mailto:/i, '').trim())
    .filter(Boolean)

const uniqueRecipients = (recipients: string[]) => {
  const seen = new Set<string>()
  return recipients.filter((recipient) => {
    const key = recipient.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const isValidISODate = (value?: string): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))

export const getArgentinaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  }
}

export const toISODate = ({ year, month, day }: { year: number; month: number; day: number }) =>
  `${year}-${pad(month)}-${pad(day)}`

export const getDefaultReportDate = (now = new Date()) => {
  const argentina = getArgentinaDateParts(now)
  const utcNoon = new Date(Date.UTC(argentina.year, argentina.month - 1, argentina.day + 1, 12, 0, 0))
  return toISODate({
    year: utcNoon.getUTCFullYear(),
    month: utcNoon.getUTCMonth() + 1,
    day: utcNoon.getUTCDate()
  })
}

export const formatDateEs = (isoDate: string) => {
  if (!isValidISODate(isoDate)) return isoDate
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
}

export const getEmailSubject = (reportDate: string, isTest = false) =>
  isTest
    ? `PRUEBA - Reporte diario de pedidos ServiFood - ${formatDateEs(reportDate)}`
    : `Reporte diario de pedidos - ServiFood - ${formatDateEs(reportDate)}`

const safeArray = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? safeArray(parsed) : []
    } catch {
      return []
    }
  }
  return []
}

const getNormalizedService = (service?: unknown) => String(service || 'lunch').trim().toLowerCase()

const isMealService = (service?: unknown) => {
  const normalized = getNormalizedService(service)
  return normalized === 'lunch' || normalized === 'dinner'
}

const isAdminExtraOrder = (order: Record<string, unknown>) =>
  String(order.order_origin || '').trim().toLowerCase() === 'admin_extra' ||
  Boolean(order.created_by_admin_id || order.admin_extra_created_at)

const getItemsQuantity = (items: Array<Record<string, unknown>>) =>
  items.reduce((sum, item) => sum + (Number(item.quantity ?? item.qty ?? 1) || 1), 0)

const normalizeItemsForService = (
  service: unknown,
  items: Array<Record<string, unknown>>,
  preserveQuantities = false
): Array<Record<string, unknown>> => {
  if (preserveQuantities) return items.map((item) => ({ ...item }))
  if (!isMealService(service)) return items.map((item) => ({ ...item }))
  return items.slice(0, 1).map((item) => ({
    ...item,
    quantity: 1
  }))
}

export const normalizeOrder = (order: Record<string, unknown>): NormalizedOrder => {
  const rawItems = safeArray(order.items)
  const isExtra = isAdminExtraOrder(order)
  const normalizedItems = normalizeItemsForService(order.service, rawItems, isExtra)
  const service = getNormalizedService(order.service)
  const warnings: string[] = []

  if (!isExtra && isMealService(service)) {
    if (rawItems.length > 1) warnings.push('más de un menú principal')
    if (rawItems.some((item) => Number(item.quantity || item.qty || 1) !== 1)) warnings.push('cantidad histórica normalizada')
    if (Number.isFinite(Number(order.total_items)) && Number(order.total_items) !== normalizedItems.length) {
      warnings.push('total histórico no coincide con items normalizados')
    }
  }

  const storedTotal = Number(order.total_items)
  const totalItems = isExtra && Number.isFinite(storedTotal) && storedTotal > 0
    ? storedTotal
    : getItemsQuantity(normalizedItems)

  return {
    ...order,
    service,
    items: normalizedItems,
    custom_responses: safeArray(order.custom_responses),
    total_items: totalItems,
    normalization_warnings: warnings
  }
}

const normalizeValue = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ')
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

export const getCustomSide = (order: NormalizedOrder) => {
  const match = order.custom_responses.find((response) =>
    String(response.title || response.label || '').toLowerCase().includes('guarn')
  )
  return normalizeValue(match?.answer ?? match?.response)
}

export const getCustomResponsesText = (order: NormalizedOrder) => {
  const side = getCustomSide(order)
  return order.custom_responses
    .filter((response) => !String(response.title || response.label || '').toLowerCase().includes('guarn'))
    .map((response) => {
      const title = String(response.title || response.label || 'Respuesta')
      const value = normalizeValue(response.answer ?? response.response)
      return value ? `${title}: ${value}` : ''
    })
    .filter(Boolean)
    .join(' | ') || (side ? 'Sin otras respuestas' : 'Sin respuestas')
}

export const getMenuOptionText = (order: NormalizedOrder) => {
  const itemText = order.items
    .map((item) => {
      const name = String(item.name || item.title || item.menu || '').trim()
      const option = String(item.option || item.selected_option || item.choice || '').trim()
      const quantity = Number(item.quantity || item.qty || 1)
      const base = [name, option].filter(Boolean).join(' - ')
      return base ? `${base} (x${quantity || 1})` : ''
    })
    .filter(Boolean)

  return itemText.join('; ') || 'Sin menú/opción'
}

export const getServiceLabel = (service?: string | null) =>
  String(service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo'

export const getOrderTotalItems = (order: NormalizedOrder) => {
  if (isAdminExtraOrder(order as unknown as Record<string, unknown>)) {
    const storedTotal = Number(order.total_items || 0)
    if (storedTotal > 0) return storedTotal
    return getItemsQuantity(order.items)
  }
  if (isMealService(order.service)) return order.items.length
  const storedTotal = Number(order.total_items || 0)
  if (storedTotal > 0) return storedTotal
  return order.items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0)
}

const plural = (count: number, singular: string, pluralText: string) =>
  `${count} ${count === 1 ? singular : pluralText}`

const getLocationLabel = (order: NormalizedOrder) =>
  String(order.location || order.company_name || order.company || 'Sin ubicación / empresa').trim() || 'Sin ubicación / empresa'

const getDeliveryLocationLabel = (order: NormalizedOrder) =>
  String(order.delivery_location || getLocationLabel(order)).trim() || 'Sin ubicación / empresa'

const getMenuLabel = (item: Record<string, unknown>) => {
  const name = String(item.name || item.title || item.menu || 'Sin menú').trim()
  const option = String(item.option || item.selected_option || item.choice || '').trim()
  return [name, option].filter(Boolean).join(' - ') || 'Sin menú/opción'
}

const incrementMap = <T extends string>(map: Map<T, number>, key: T, amount = 1) => {
  map.set(key, (map.get(key) || 0) + amount)
}

const sortQuantityRows = (a: { label: string; quantity: number }, b: { label: string; quantity: number }) =>
  b.quantity - a.quantity || a.label.localeCompare(b.label)

const isBaseMenuAdditionalTitle = (title = '') => {
  const normalized = title.trim().toLowerCase()
  return normalized === 'cena' ||
    normalized === 'menú de cena' ||
    normalized === 'menu de cena' ||
    normalized === 'menú principal' ||
    normalized === 'menu principal' ||
    normalized === 'plato principal'
}

const getAdditionalLabels = (order: NormalizedOrder) => {
  const labels: string[] = []

  order.custom_responses.forEach((response) => {
    const title = String(response.title || response.label || '').trim()
    const lowerTitle = title.toLowerCase()
    if (isBaseMenuAdditionalTitle(title)) return

    const value = normalizeValue(response.answer ?? response.response ?? response.value)
    const options = normalizeValue(response.options)
    const combined = [value, options].filter(Boolean).join(', ')
    if (!combined) return

    if (lowerTitle.includes('guarn')) return

    if (lowerTitle.includes('bebida')) {
      labels.push(combined)
      return
    }

    labels.push(title ? `${title}: ${combined}` : combined)
  })

  return labels
}

export const buildDailySummary = (orders: NormalizedOrder[], reportDate: string): DailySummary => {
  const byLocation = new Map<string, { orders: number; items: number }>()
  const byDeliveryLocation = new Map<string, { orders: number; items: number }>()
  const byMenuOption = new Map<string, number>()
  const commentsByCustomerAndText = new Map<string, { customer: string; comment: string; count: number }>()
  const menuByLocation = new Map<string, Map<string, number>>()
  const sidesByLocationMenu = new Map<string, Map<string, Map<string, number>>>()
  const commentsByLocationText = new Map<string, Map<string, number>>()
  const additionalByLocationText = new Map<string, Map<string, number>>()
  const warnings: string[] = []
  let totalItems = 0

  orders.forEach((order, index) => {
    const items = getOrderTotalItems(order)
    totalItems += items

    const location = getLocationLabel(order)
    const deliveryLocation = getDeliveryLocationLabel(order)
    const locationRow = byLocation.get(location) || { orders: 0, items: 0 }
    locationRow.orders += 1
    locationRow.items += items
    byLocation.set(location, locationRow)

    const deliveryRow = byDeliveryLocation.get(deliveryLocation) || { orders: 0, items: 0 }
    deliveryRow.orders += 1
    deliveryRow.items += items
    byDeliveryLocation.set(deliveryLocation, deliveryRow)

    if (!menuByLocation.has(location)) menuByLocation.set(location, new Map())
    const scopedMenus = menuByLocation.get(location)!
    if (!sidesByLocationMenu.has(location)) sidesByLocationMenu.set(location, new Map())
    const scopedMenuSides = sidesByLocationMenu.get(location)!
    const customSide = getCustomSide(order)

    const incrementMenuSide = (menuLabel: string, quantity: number) => {
      if (!customSide) return
      if (!scopedMenuSides.has(menuLabel)) scopedMenuSides.set(menuLabel, new Map())
      incrementMap(scopedMenuSides.get(menuLabel)!, customSide, quantity || 1)
    }

    if (order.items.length === 0) {
      const quantity = Math.max(items, 1)
      incrementMap(byMenuOption, 'Sin menú/opción', quantity)
      incrementMap(scopedMenus, 'Sin menú/opción', quantity)
      incrementMenuSide('Sin menú/opción', quantity)
    } else {
      order.items.forEach((item) => {
        const label = getMenuLabel(item)
        const quantity = Number(item.quantity || item.qty || 1)
        incrementMap(byMenuOption, label, quantity || 1)
        incrementMap(scopedMenus, label, quantity || 1)
        incrementMenuSide(label, quantity || 1)
      })
    }

    if (String(order.comments || '').trim()) {
      const customer = String(order.customer_name || order.user_name || `Pedido ${index + 1}`).trim()
      const comment = String(order.comments).trim()
      const key = `${customer}\u0000${comment}`
      const existing = commentsByCustomerAndText.get(key)
      commentsByCustomerAndText.set(key, {
        customer,
        comment,
        count: (existing?.count || 0) + 1
      })

      if (!commentsByLocationText.has(location)) commentsByLocationText.set(location, new Map())
      incrementMap(commentsByLocationText.get(location)!, comment, 1)
    }

    const additionalLabels = getAdditionalLabels(order)
    if (additionalLabels.length) {
      if (!additionalByLocationText.has(location)) additionalByLocationText.set(location, new Map())
      const scopedAdditional = additionalByLocationText.get(location)!
      additionalLabels.forEach((label) => incrementMap(scopedAdditional, label, 1))
    }

    const missing = []
    if (!order.customer_name && !order.user_name) missing.push('cliente')
    if (!order.customer_email && !order.user_email) missing.push('email')
    if (!order.location && !order.company && !order.company_name) missing.push('ubicación / empresa')
    if (order.items.length === 0) missing.push('menú/opción')
    if (missing.length > 0) {
      warnings.push(`Pedido ${order.id || index + 1} con datos incompletos: ${missing.join(', ')}`)
    }

    if (order.normalization_warnings?.length) {
      warnings.push(`Pedido ${order.id || index + 1} normalizado: ${order.normalization_warnings.join(', ')}`)
    }
  })

  const displayDate = formatDateEs(reportDate)
  const commentRows = [...commentsByCustomerAndText.values()].sort((a, b) =>
    a.customer.localeCompare(b.customer) || a.comment.localeCompare(b.comment)
  )
  const sortedLocations = [...byLocation.entries()]
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label))
  const sortedDeliveryLocations = [...byDeliveryLocation.entries()]
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.items - a.items || a.label.localeCompare(b.label))

  return {
    reportDate,
    displayDate,
    totalOrders: orders.length,
    totalItems,
    byLocation: sortedLocations,
    byDeliveryLocation: sortedDeliveryLocations,
    byMenuOption: [...byMenuOption.entries()]
      .map(([label, quantity]) => ({ label, quantity }))
      .sort(sortQuantityRows),
    byLocationMenu: sortedLocations.map((location) => ({
      ...location,
      menus: [...(menuByLocation.get(location.label) || new Map()).entries()]
        .map(([label, quantity]) => ({
          label,
          quantity,
          sides: [...(sidesByLocationMenu.get(location.label)?.get(label) || new Map()).entries()]
            .map(([sideLabel, sideQuantity]) => ({ label: sideLabel, quantity: sideQuantity }))
            .sort(sortQuantityRows)
        }))
        .sort(sortQuantityRows)
    })),
    additionalByLocation: sortedLocations.map((location) => ({
      label: location.label,
      items: [...(additionalByLocationText.get(location.label) || new Map()).entries()]
        .map(([label, quantity]) => ({ label, quantity }))
        .sort(sortQuantityRows)
    })),
    comments: commentRows.map((row) => `${row.customer}: ${row.comment}${row.count > 1 ? ` (x${row.count})` : ''}`),
    commentRows,
    commentsByLocation: sortedLocations.map((location) => ({
      label: location.label,
      comments: [...(commentsByLocationText.get(location.label) || new Map()).entries()]
        .map(([comment, count]) => ({ comment, count }))
        .sort((a, b) => b.count - a.count || a.comment.localeCompare(b.comment))
    })),
    warnings,
    emptyMessage: orders.length === 0
      ? `No hay pedidos pendientes para la fecha de entrega ${displayDate}.`
      : undefined
  }
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const cellStyle = 'padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;line-height:20px;color:#111827;vertical-align:top;'
const headerCellStyle = 'padding:10px 12px;background:#eef2ff;border-bottom:1px solid #dbe4ff;font-size:12px;line-height:16px;color:#374151;text-transform:uppercase;font-weight:700;text-align:left;'
const SERVIFOOD_LOGO_BLUE = '#2E3168'
const logoHeaderStyle = `padding:24px 20px;background:${SERVIFOOD_LOGO_BLUE};text-align:center;`

const renderLogoHeader = (logoUrl?: string | null) => {
  const src = String(logoUrl || '').trim()
  return src
    ? `<div style="${logoHeaderStyle}"><img src="${escapeHtml(src)}" width="180" alt="ServiFood Catering" style="display:block;margin:0 auto;max-width:180px;width:180px;height:auto;border:0;outline:none;text-decoration:none;"></div>`
    : `<div style="${logoHeaderStyle}"><div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:30px;font-weight:700;color:#ffffff;text-align:center;">ServiFood Catering</div></div>`
}

const renderLocationRows = (summary: DailySummary) => {
  if (!summary.byLocation.length) {
    return `<tr><td colspan="3" style="${cellStyle}color:#6b7280;">Sin ubicaciones para listar.</td></tr>`
  }

  const rows = summary.byLocation.map((row) => `
    <tr>
      <td style="${cellStyle}">${escapeHtml(row.label)}</td>
      <td align="right" style="${cellStyle}text-align:right;">${row.orders}</td>
      <td align="right" style="${cellStyle}text-align:right;">${row.items}</td>
    </tr>
  `).join('')

  return `${rows}
    <tr>
      <td style="${cellStyle}font-weight:700;background:#f9fafb;">Total general</td>
      <td align="right" style="${cellStyle}font-weight:700;text-align:right;background:#f9fafb;">${summary.totalOrders}</td>
      <td align="right" style="${cellStyle}font-weight:700;text-align:right;background:#f9fafb;">${summary.totalItems}</td>
    </tr>`
}

const renderDeliveryLocationRows = (summary: DailySummary) => {
  if (!summary.byDeliveryLocation.length) {
    return `<tr><td colspan="3" style="${cellStyle}color:#6b7280;">Sin lugares de entrega para listar.</td></tr>`
  }

  return summary.byDeliveryLocation.map((row) => `
    <tr>
      <td style="${cellStyle}">${escapeHtml(row.label)}</td>
      <td align="right" style="${cellStyle}text-align:right;">${row.orders}</td>
      <td align="right" style="${cellStyle}text-align:right;">${row.items}</td>
    </tr>
  `).join('')
}

const renderLocationMenuSections = (summary: DailySummary) =>
  summary.byLocationMenu.length
    ? summary.byLocationMenu.map((location) => `
      <h3 style="margin:18px 0 8px 0;font-size:15px;line-height:22px;color:#111827;">${escapeHtml(location.label)}</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin:0 0 12px 0;">
        <tr>
          <th align="left" style="${headerCellStyle}">Menú / opción</th>
          <th align="right" style="${headerCellStyle}text-align:right;">Cantidad</th>
        </tr>
        ${location.menus.length
          ? location.menus.map((row) => `
            <tr>
              <td style="${cellStyle}">
                <div>${escapeHtml(row.label)}</div>
                ${row.sides.length
                  ? `<div style="margin-top:6px;color:#4b5563;font-size:13px;line-height:18px;">${row.sides.map((side) => `Guarnición: ${escapeHtml(side.label)}${side.quantity > 1 ? ` (x${side.quantity})` : ''}`).join('<br>')}</div>`
                  : ''}
              </td>
              <td align="right" style="${cellStyle}text-align:right;">${row.quantity}</td>
            </tr>
          `).join('')
          : `<tr><td colspan="2" style="${cellStyle}color:#6b7280;">Sin menús/opciones para listar.</td></tr>`}
        <tr>
          <td style="${cellStyle}font-weight:700;background:#f9fafb;">Subtotal ${escapeHtml(location.label)}</td>
          <td align="right" style="${cellStyle}font-weight:700;text-align:right;background:#f9fafb;">${plural(location.items, 'ítem', 'ítems')}</td>
        </tr>
      </table>
    `).join('')
    : `<div style="${cellStyle}color:#6b7280;border:1px solid #e5e7eb;">Sin detalle por ubicación.</div>`

const renderLocationAdditionalSections = (summary: DailySummary) =>
  summary.additionalByLocation.length
    ? summary.additionalByLocation.map((location) => `
      <h3 style="margin:18px 0 8px 0;font-size:15px;line-height:22px;color:#111827;">${escapeHtml(location.label)}</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin:0 0 12px 0;">
        <tr>
          <th align="left" style="${headerCellStyle}">Guarnición / adicional</th>
          <th align="right" style="${headerCellStyle}text-align:right;">Cantidad</th>
        </tr>
        ${location.items.length
          ? location.items.map((row) => `
            <tr>
              <td style="${cellStyle}">${escapeHtml(row.label)}</td>
              <td align="right" style="${cellStyle}text-align:right;">${row.quantity}</td>
            </tr>
          `).join('')
          : `<tr><td colspan="2" style="${cellStyle}color:#6b7280;">Sin guarniciones/adicionales destacados.</td></tr>`}
      </table>
    `).join('')
    : `<div style="${cellStyle}color:#6b7280;border:1px solid #e5e7eb;">Sin guarniciones/adicionales destacados.</div>`

const renderLocationCommentSections = (summary: DailySummary) =>
  summary.commentsByLocation.length
    ? summary.commentsByLocation.map((location) => `
      <h3 style="margin:18px 0 8px 0;font-size:15px;line-height:22px;color:#111827;">${escapeHtml(location.label)}</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin:0 0 12px 0;">
        <tr>
          <th align="left" style="${headerCellStyle}">Comentario / observación</th>
        </tr>
        ${location.comments.length
          ? location.comments.map((row) => `
            <tr>
              <td style="${cellStyle}">${escapeHtml(row.comment)}${row.count > 1 ? ` <span style="color:#6b7280;">(x${row.count})</span>` : ''}</td>
            </tr>
          `).join('')
          : `<tr><td style="${cellStyle}color:#6b7280;">Sin comentarios destacados.</td></tr>`}
      </table>
    `).join('')
    : `<div style="${cellStyle}color:#6b7280;border:1px solid #e5e7eb;">Sin comentarios destacados.</div>`

const renderWarnings = (summary: DailySummary) =>
  summary.warnings.length
    ? `<ul style="margin:0;padding:0 0 0 20px;">${summary.warnings.map((warning) => `<li style="margin:0 0 6px 0;">⚠️ ${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '✅ No se detectaron datos incompletos o inconsistentes.'

export const buildEmailHtml = (
  summary: DailySummary,
  isTest = false,
  options: { logoUrl?: string | null } = {}
) => `
  <div style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f7fb;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border-collapse:collapse;border:1px solid #e5e7eb;">
            <tr>
              <td bgcolor="${SERVIFOOD_LOGO_BLUE}" style="padding:0;background:${SERVIFOOD_LOGO_BLUE};">
                ${renderLogoHeader(options.logoUrl)}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 22px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                ${isTest ? '<div style="margin:0 0 14px 0;padding:10px 12px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:13px;font-weight:700;">PRUEBA - NO USAR PARA PRODUCCIÓN</div>' : ''}
                <h1 style="margin:0 0 8px 0;font-size:24px;line-height:32px;font-weight:700;color:#111827;">Reporte diario de pedidos ServiFood</h1>
                <p style="margin:0;font-size:15px;line-height:22px;color:#4b5563;">Fecha de entrega reportada: <strong style="color:#111827;">${escapeHtml(summary.displayDate)}</strong></p>
                ${summary.emptyMessage ? `<p style="margin:14px 0 0 0;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;line-height:20px;color:#374151;"><strong>${escapeHtml(summary.emptyMessage)}</strong></p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Resumen general</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
                  <tr>
                    <td style="padding:12px;background:#f9fafb;border-right:1px solid #e5e7eb;width:33.33%;">
                      <div style="font-size:12px;line-height:16px;color:#6b7280;text-transform:uppercase;font-weight:700;">Total de pedidos</div>
                      <div style="font-size:24px;line-height:30px;color:#111827;font-weight:700;">${summary.totalOrders}</div>
                    </td>
                    <td style="padding:12px;background:#f9fafb;border-right:1px solid #e5e7eb;width:33.33%;">
                      <div style="font-size:12px;line-height:16px;color:#6b7280;text-transform:uppercase;font-weight:700;">Total de ítems</div>
                      <div style="font-size:24px;line-height:30px;color:#111827;font-weight:700;">${summary.totalItems}</div>
                    </td>
                    <td style="padding:12px;background:#f9fafb;width:33.33%;">
                      <div style="font-size:12px;line-height:16px;color:#6b7280;text-transform:uppercase;font-weight:700;">Estado del reporte</div>
                      <div style="font-size:15px;line-height:22px;color:#111827;font-weight:700;">${summary.warnings.length ? 'Con avisos' : 'Completo'}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Totales por ubicación / empresa</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
                  <tr>
                    <th align="left" style="${headerCellStyle}">Ubicación / empresa</th>
                    <th align="right" style="${headerCellStyle}text-align:right;">Pedidos</th>
                    <th align="right" style="${headerCellStyle}text-align:right;">Ítems</th>
                  </tr>
                  ${renderLocationRows(summary)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Totales por lugar de entrega</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
                  <tr>
                    <th align="left" style="${headerCellStyle}">Lugar de entrega</th>
                    <th align="right" style="${headerCellStyle}text-align:right;">Pedidos</th>
                    <th align="right" style="${headerCellStyle}text-align:right;">Ítems</th>
                  </tr>
                  ${renderDeliveryLocationRows(summary)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Detalle por ubicación / empresa</h2>
                ${renderLocationMenuSections(summary)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Adicionales por ubicación / empresa</h2>
                ${renderLocationAdditionalSections(summary)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Comentarios / observaciones por ubicación / empresa</h2>
                ${renderLocationCommentSections(summary)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px 28px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h2 style="margin:0 0 12px 0;font-size:18px;line-height:24px;color:#111827;">Avisos</h2>
                <div style="padding:12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:14px;line-height:20px;color:#374151;">
                  ${renderWarnings(summary)}
                </div>
                <p style="margin:18px 0 0 0;font-size:14px;line-height:20px;color:#4b5563;">Se adjunta el Excel con el detalle completo de pedidos.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
`

export const buildEmailText = (summary: DailySummary, isTest = false) => [
  isTest ? 'PRUEBA - NO USAR PARA PRODUCCIÓN' : '',
  'Reporte diario de pedidos ServiFood',
  `Fecha de entrega reportada: ${summary.displayDate}`,
  summary.emptyMessage || '',
  '',
  'Resumen general',
  `Total de pedidos: ${summary.totalOrders}`,
  `Total de ítems: ${summary.totalItems}`,
  `Estado del reporte: ${summary.warnings.length ? 'Con avisos' : 'Completo'}`,
  '',
  'Totales por ubicación / empresa',
  ...(summary.byLocation.length
    ? [
        ...summary.byLocation.map((row) => `- ${row.label}: ${plural(row.orders, 'pedido', 'pedidos')} / ${plural(row.items, 'ítem', 'ítems')}`),
        `- Total general: ${plural(summary.totalOrders, 'pedido', 'pedidos')} / ${plural(summary.totalItems, 'ítem', 'ítems')}`
      ]
    : ['- Sin ubicaciones para listar.']),
  '',
  'Totales por lugar de entrega',
  ...(summary.byDeliveryLocation.length
    ? summary.byDeliveryLocation.map((row) => `- ${row.label}: ${plural(row.orders, 'pedido', 'pedidos')} / ${plural(row.items, 'ítem', 'ítems')}`)
    : ['- Sin lugares de entrega para listar.']),
  '',
  'Detalle por ubicación / empresa',
  ...(summary.byLocationMenu.length
    ? summary.byLocationMenu.flatMap((location) => [
        '',
        location.label,
        ...(location.menus.length
          ? location.menus.flatMap((row) => [
              `- ${row.label}: ${row.quantity}`,
              ...row.sides.map((side) => `  Guarnición: ${side.label}${side.quantity > 1 ? ` (x${side.quantity})` : ''}`)
            ])
          : ['- Sin menús/opciones para listar.']),
        `- Subtotal ${location.label}: ${plural(location.items, 'ítem', 'ítems')}`
      ])
    : ['- Sin detalle por ubicación.']),
  '',
  'Adicionales por ubicación / empresa',
  ...(summary.additionalByLocation.length
    ? summary.additionalByLocation.flatMap((location) => [
        '',
        location.label,
        ...(location.items.length
          ? location.items.map((row) => `- ${row.label}${row.quantity > 1 ? ` (x${row.quantity})` : ''}`)
          : ['- Sin guarniciones/adicionales destacados.'])
      ])
    : ['- Sin guarniciones/adicionales destacados.']),
  '',
  'Comentarios / observaciones por ubicación / empresa',
  ...(summary.commentsByLocation.length
    ? summary.commentsByLocation.flatMap((location) => [
        '',
        location.label,
        ...(location.comments.length
          ? location.comments.map((row) => `- ${row.comment}${row.count > 1 ? ` (x${row.count})` : ''}`)
          : ['- Sin comentarios destacados.'])
      ])
    : ['- Sin comentarios destacados.']),
  '',
  'Avisos',
  ...(summary.warnings.length ? summary.warnings.map((item) => `- ${item}`) : ['- No se detectaron datos incompletos o inconsistentes.']),
  'Se adjunta el Excel con el detalle completo de pedidos.'
].filter((line) => line !== null && line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n')

export const getRecipientsForMode = ({
  mode,
  configuredRecipients,
  configuredTestRecipients,
  sendTo
}: {
  mode: DailyReportMode
  configuredRecipients: string[]
  configuredTestRecipients?: string[]
  sendTo?: string
}) => {
  if (isTestEmailMode(mode)) {
    if (sendTo) return parseRecipients(sendTo).slice(0, 1)
    return configuredTestRecipients?.length ? configuredTestRecipients.slice(0, 1) : [DEFAULT_TEST_RECIPIENT]
  }
  return uniqueRecipients([...configuredRecipients, ...PERMANENT_REPORT_RECIPIENTS])
}

export const isTestEmailMode = (mode: DailyReportMode) =>
  mode === 'testEmail' || mode === 'testEmailReal'

export const usesMockOrdersForMode = (mode: DailyReportMode, useRealData = false) =>
  mode === 'testEmail' && !useRealData

export const usesRealOrdersForMode = (mode: DailyReportMode, useRealData = false) =>
  mode === 'send' || mode === 'dryRun' || mode === 'testEmailReal' || (mode === 'testEmail' && useRealData)

export const shouldWriteDailyReportRun = (mode: DailyReportMode) =>
  mode === 'send'

export const shouldArchiveOrdersForMode = (mode: DailyReportMode) =>
  mode === 'archiveAfterSuccessfulReport'

export const shouldSendEmailForMode = (mode: DailyReportMode) =>
  mode === 'send' || mode === 'testEmail' || mode === 'testEmailReal'

export const getArchiveOrdersRpcCall = (reportDate: string) => ({
  rpcName: 'archive_orders_bulk_by_delivery_date',
  args: {
    p_delivery_date: reportDate,
    p_statuses: ['pending']
  }
})

export const isRecentSuccessfulDailyReportRun = (
  run: { status?: string | null; sent_at?: string | null } | null | undefined,
  now = new Date(),
  maxAgeMinutes = 30
) => {
  if (run?.status !== 'sent' || !run.sent_at) return false

  const sentAt = new Date(run.sent_at).getTime()
  if (Number.isNaN(sentAt)) return false

  const ageMs = now.getTime() - sentAt
  return ageMs >= 0 && ageMs <= maxAgeMinutes * 60 * 1000
}

export const isSuccessfulDailyReportRun = (
  run: { status?: string | null; sent_at?: string | null } | null | undefined
) =>
  (run?.status === DAILY_REPORT_SEND_STATUSES.SENT || run?.status === DAILY_REPORT_SEND_STATUSES.SENT_EMPTY) &&
  Boolean(run.sent_at)

export const canArchiveSuccessfulDailyReportRun = (
  run: DailyReportRunLike | null | undefined
) =>
  run?.status === DAILY_REPORT_SEND_STATUSES.SENT &&
  Boolean(run.sent_at) &&
  (
    run.archive_status === DAILY_REPORT_ARCHIVE_STATUSES.PENDING ||
    run.archive_status === DAILY_REPORT_ARCHIVE_STATUSES.FAILED
  )

export const buildDailyReportRunPayload = ({
  reportDate,
  reportType,
  status,
  ordersCount,
  recipients,
  error = null,
  now = new Date()
}: {
  reportDate: string
  reportType: string
  status: string
  ordersCount: number
  recipients: string[]
  error?: string | null
  now?: Date
}) => {
  const sent = status === DAILY_REPORT_SEND_STATUSES.SENT || status === DAILY_REPORT_SEND_STATUSES.SENT_EMPTY
  return {
    report_date: reportDate,
    report_type: reportType,
    status,
    orders_count: ordersCount,
    recipients,
    sent_at: sent ? now.toISOString() : null,
    error: error || null,
    archive_status: status === DAILY_REPORT_SEND_STATUSES.SENT
      ? DAILY_REPORT_ARCHIVE_STATUSES.PENDING
      : null,
    archived_count: null,
    archive_error: null,
    archived_at: null
  }
}

export const buildDailyReportFailurePayload = ({
  reportDate,
  reportType,
  ordersCount,
  recipients,
  error,
  emailAccepted = false,
  sentStatus,
  now = new Date()
}: {
  reportDate: string
  reportType: string
  ordersCount: number
  recipients: string[]
  error: string
  emailAccepted?: boolean
  sentStatus?: string
  now?: Date
}) => {
  if (emailAccepted) {
    return buildDailyReportRunPayload({
      reportDate,
      reportType,
      status: sentStatus || DAILY_REPORT_SEND_STATUSES.SENT,
      ordersCount,
      recipients,
      error,
      now
    })
  }

  return {
    report_date: reportDate,
    report_type: reportType,
    status: DAILY_REPORT_SEND_STATUSES.FAILED,
    orders_count: ordersCount,
    recipients,
    sent_at: null,
    error,
    archive_status: null,
    archived_count: null,
    archive_error: null,
    archived_at: null
  }
}

export const buildArchiveCompletedPayload = (archivedCount: number, now = new Date()) => ({
  archive_status: DAILY_REPORT_ARCHIVE_STATUSES.ARCHIVED,
  archived_count: Math.max(0, archivedCount),
  archive_error: null,
  archived_at: now.toISOString()
})

export const buildArchiveFailedPayload = (error: string) => ({
  archive_status: DAILY_REPORT_ARCHIVE_STATUSES.FAILED,
  archive_error: error,
  archived_count: null,
  archived_at: null
})

export const isOrderEligibleForReportArchive = (
  order: { delivery_date?: string | null; status?: string | null },
  reportDate: string
) =>
  String(order.delivery_date || '').slice(0, 10) === reportDate &&
  order.status === 'pending'

export const isAuthorized = (headers: Headers, expectedSecret?: string | null) => {
  const secret = expectedSecret || ''
  return Boolean(secret && headers.get('x-cron-secret') === secret)
}

export const shouldSkipExistingRun = ({
  existingStatus,
  existingCreatedAt,
  existingUpdatedAt,
  now = new Date(),
  force
}: {
  existingStatus?: string | null
  existingCreatedAt?: string | null
  existingUpdatedAt?: string | null
  now?: Date
  force?: boolean
}) => {
  if (force) return false
  if (existingStatus === DAILY_REPORT_SEND_STATUSES.RUNNING && isStaleRunningRun({ createdAt: existingCreatedAt, updatedAt: existingUpdatedAt }, now)) return false
  return existingStatus === DAILY_REPORT_SEND_STATUSES.SENT ||
    existingStatus === DAILY_REPORT_SEND_STATUSES.SENT_EMPTY ||
    existingStatus === DAILY_REPORT_SEND_STATUSES.RUNNING
}

export const isStaleRunningRun = ({
  createdAt,
  updatedAt
}: {
  createdAt?: string | null
  updatedAt?: string | null
},
  now = new Date(),
  staleAfterMinutes = 30
) => {
  const timestamps = [createdAt, updatedAt]
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => !Number.isNaN(value))
  if (!timestamps.length) return false
  return timestamps.some((value) => now.getTime() - value > staleAfterMinutes * 60 * 1000)
}

export const createMockOrders = (reportDate: string): NormalizedOrder[] => [
  normalizeOrder({
    id: 'mock-1',
    customer_name: 'Pedido de prueba 1',
    customer_email: 'persona1@example.com',
    customer_phone: '+54 9 11 1111-1111',
    location: 'Empresa Demo Centro',
    delivery_date: reportDate,
    service: 'lunch',
    status: 'pending',
    items: [{ name: 'Menú principal', option: 'Pollo al horno', quantity: 1 }],
    custom_responses: [{ title: 'Guarnición', response: 'Ensalada mixta' }],
    comments: 'Sin sal',
    total_items: 1
  }),
  normalizeOrder({
    id: 'mock-2',
    customer_name: 'Pedido de prueba 2',
    customer_email: 'persona2@example.com',
    customer_phone: '+54 9 11 2222-2222',
    location: 'Empresa Demo Norte',
    delivery_date: reportDate,
    service: 'lunch',
    status: 'pending',
    items: [{ name: 'Menú vegetariano', option: 'Tarta de verduras', quantity: 2 }],
    custom_responses: [{ title: 'Bebida', response: 'Agua' }],
    comments: '',
    total_items: 2
  }),
  normalizeOrder({
    id: 'mock-3',
    customer_name: 'Pedido de prueba 3',
    customer_email: 'persona3@example.com',
    customer_phone: '+54 9 11 3333-3333',
    location: 'Empresa Demo Centro',
    delivery_date: reportDate,
    service: 'dinner',
    status: 'pending',
    items: [{ name: 'Cena', option: 'Milanesa con puré', quantity: 1 }],
    custom_responses: [{ title: 'Guarnición', response: 'Puré' }],
    comments: 'Retira por recepción',
    total_items: 1
  })
]
