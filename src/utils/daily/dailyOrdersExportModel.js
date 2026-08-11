import { getStatusText } from './dailyOrderFormatters'
import { getOrderBeverageLabels, isBeverage } from './dailyOrderCalculations'
import { getSideAssociationsForOrder, getSideSummaryForOrder } from './dailyOrderSideAssociations'
import { normalizeOrderForReadOnly } from '../order/normalizeOrderForReadOnly'
import { isValidCustomerName } from '../order/orderCustomerName'
import { isMealService, safeOrderItemsArray } from '../order/orderItemNormalization'
import { getAdminExtraOrderLabel, isAdminExtraOrder } from './adminExtraOrders'
import {
  getOrderBeverageBreakdown,
  getOrderDessertBreakdown,
  getOrderMenuTotal,
  isDessertLabel
} from '../order/orderOperationalTotals'

const EMPTY = ''

const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const normalizeText = (value) => String(value ?? '').trim()

const valueToText = (value) => {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(', ')
  return normalizeText(value)
}

const quantitiesToText = (quantities) => {
  if (!quantities || typeof quantities !== 'object') return ''
  return Object.entries(quantities)
    .map(([label, quantity]) => ({ label: normalizeText(label), quantity: Number(quantity) || 0 }))
    .filter(item => item.label && item.quantity > 0)
    .map(item => `${item.label}${item.quantity > 1 ? ` (x${item.quantity})` : ''}`)
    .join(', ')
}

const safeDate = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const formatDateOnly = (value) => {
  if (!value) return EMPTY
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-')
    return `${day}/${month}/${year}`
  }
  const parsed = safeDate(value)
  return parsed
    ? parsed.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : EMPTY
}

export const formatTimeOnly = (value) => {
  const parsed = safeDate(value)
  return parsed
    ? parsed.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : EMPTY
}

const formatStatusForFilename = (selectedStatus) => {
  if (selectedStatus === 'archived') return 'archived'
  if (selectedStatus === 'pending') return 'pending'
  return 'all'
}

export const formatStatusForDisplay = (selectedStatus) => {
  if (selectedStatus === 'archived') return 'Archivados'
  if (selectedStatus === 'pending') return 'Pendientes'
  return 'Todos'
}

export const getOrderLocation = (order = {}) =>
  normalizeText(order.location || order.company_name || order.company || order.company_slug || order.target_company) || 'Sin ubicación'

export const getOrderDeliveryLocation = (order = {}) =>
  normalizeText(order.delivery_location || order.deliveryLocation) || getOrderLocation(order)

export const getOrderOrganization = (order = {}) =>
  normalizeText(order.organization || order.company_name || order.company)

export const getOrderCustomer = (order = {}) =>
  isAdminExtraOrder(order)
    ? 'Solicitado por admin'
    : normalizeText(order.customer_name || order.user_name || order.user_full_name || order.full_name || order.name) || 'Sin cliente'

export const getOrderEmail = (order = {}) =>
  isAdminExtraOrder(order) ? '' : normalizeText(order.customer_email || order.user_email || order.email)

export const getOrderPhone = (order = {}) =>
  normalizeText(order.customer_phone || order.phone)

export const getOrderServiceLabel = (order = {}) =>
  String(order.service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo'

export const getItemQuantity = (item = {}) => {
  const quantity = Number(item.quantity ?? item.qty ?? 1)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

const getRawItemQuantity = (item = {}) => Number(item.quantity ?? item.qty ?? 1)

export const getItemLabel = (item = {}) => {
  const name = normalizeText(item.name || item.title || item.menu || item.label)
  const option = normalizeText(item.option || item.selected_option || item.choice)
  return [name, option].filter(Boolean).join(' - ') || 'Sin menú / opción'
}

export const extractOrderItems = (order = {}) => {
  const { normalizedItems } = normalizeOrderForReadOnly(order)
  return toArray(normalizedItems).map((item) => ({
    raw: item,
    label: getItemLabel(item),
    quantity: getItemQuantity(item),
    rawQuantity: getRawItemQuantity(item)
  }))
}

export const extractCustomResponses = (order = {}) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const responses = toArray(normalizedCustomResponses)
  const beverageValues = []
  const additional = []
  const sideSummary = getSideSummaryForOrder(order)

  responses.forEach((response) => {
    const title = normalizeText(response.title || response.label || 'Opción')
    const answer = quantitiesToText(response.quantities) || valueToText(response.answer ?? response.response ?? response.value)
    const optionText = valueToText(response.options)
    const combined = [answer, optionText].filter(Boolean).join(', ')
    const lowerTitle = title.toLowerCase()
    const isSide = lowerTitle.includes('guarn')
    const isDrink = lowerTitle.includes('bebida') || isBeverage(combined)
    const isDessert = lowerTitle.includes('postre') || lowerTitle.includes('fruta') || isDessertLabel(combined)

    if (isSide) return

    if (isDrink && combined) {
      beverageValues.push(combined)
      return
    }

    if (isDessert) return

    if (combined) additional.push(`${title}: ${combined}`)
  })

  const beverageLabels = getOrderBeverageBreakdown(order)
    .map(({ label, quantity }) => `${label}${quantity > 1 ? ` (x${quantity})` : ''}`)
  const dessertLabels = getOrderDessertBreakdown(order)
    .map(({ label, quantity }) => `${label}${quantity > 1 ? ` (x${quantity})` : ''}`)

  return {
    side: sideSummary.summaryText,
    beverage: beverageLabels.join(', ') || [...new Set(beverageValues)].join(', ') || getOrderBeverageLabels(order).join(', '),
    dessert: dessertLabels.join(', '),
    additional: additional.join(' | ')
  }
}

export const getOrderTotalItems = (order = {}, items = extractOrderItems(order)) => {
  void items
  return getOrderMenuTotal(order)
}

export const buildOrderExportRow = (order = {}) => {
  const items = extractOrderItems(order)
  const custom = extractCustomResponses(order)
  const menuOption = items.map((item) => `${item.label} (x${item.quantity})`).join('; ')
  const deliveryDate = normalizeText(order.delivery_date || '').slice(0, 10)

  return {
    original: order,
    fechaPedido: formatDateOnly(order.created_at),
    horaPedido: formatTimeOnly(order.created_at),
    cliente: getOrderCustomer(order),
    email: getOrderEmail(order),
    telefono: getOrderPhone(order),
    organizacion: getOrderOrganization(order),
    ubicacion: getOrderLocation(order),
    lugarEntrega: getOrderDeliveryLocation(order),
    fechaEntregaISO: deliveryDate,
    fechaEntrega: formatDateOnly(deliveryDate),
    servicio: getOrderServiceLabel(order),
    menuOpcion: menuOption || 'Sin menú / opción',
    guarnicion: custom.side,
    bebida: custom.beverage,
    postre: custom.dessert,
    cantidad: getOrderTotalItems(order, items),
    totalItems: getOrderTotalItems(order, items),
    origen: getAdminExtraOrderLabel(order),
    comentarios: normalizeText(order.comments),
    opcionesAdicionales: custom.additional,
    estado: getStatusText(order.status),
    items
  }
}

const getMenuNames = (items = []) =>
  items
    .map((item) => normalizeText(item.raw?.name || item.raw?.title || item.raw?.menu))
    .filter(Boolean)
    .join('; ') || 'Sin menú'

const getMenuOptionText = (items = []) =>
  items
    .map((item) => item.label && item.label !== 'Sin menú / opción'
      ? `${item.label} (x${item.quantity})`
      : '')
    .filter(Boolean)
    .join('; ') || 'Sin menú/opción'

const getOptionNames = (items = []) => {
  const options = items
    .map((item) => normalizeText(item.raw?.option || item.raw?.selected_option || item.raw?.choice))
    .filter(Boolean)
    .join('; ')
  return options || getMenuOptionText(items)
}

const getCustomResponsesTextForExcel = (order = {}) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const responses = toArray(normalizedCustomResponses)
  const side = extractCustomResponses(order).side
  const lines = responses
    .filter((response) => !normalizeText(response.title || response.label).toLowerCase().includes('guarn'))
    .map((response) => {
      const title = normalizeText(response.title || response.label || 'Respuesta')
      const answer = quantitiesToText(response.quantities) || valueToText(response.answer ?? response.response ?? response.value)
      const optionText = valueToText(response.options)
      const value = [answer, optionText].filter(Boolean).join(', ')
      return value ? `${title}: ${value}` : ''
    })
    .filter(Boolean)

  return lines.join(' | ') || (side ? 'Sin otras respuestas' : 'Sin respuestas')
}

export const buildDailyOrdersExcelDetailRow = (order = {}) => {
  const items = extractOrderItems(order)
  const custom = extractCustomResponses(order)
  const deliveryDate = normalizeText(order.delivery_date || '').slice(0, 10)
  const status = String(order.status || '').trim().toLowerCase()

  return {
    Cliente: getOrderCustomer(order).replace(/^Sin cliente$/, 'Sin nombre'),
    Organización: getOrderOrganization(order) || 'Sin organización',
    'Ubicación / empresa': getOrderLocation(order).replace(/^Sin ubicación$/, 'Sin ubicación / empresa'),
    'Lugar de entrega': getOrderDeliveryLocation(order).replace(/^Sin ubicación$/, 'Sin ubicación / empresa'),
    'Fecha de entrega': formatDateOnly(deliveryDate),
    'Turno / servicio': getOrderServiceLabel(order),
    'Menú elegido': getMenuNames(items),
    'Opción elegida': getOptionNames(items),
    Guarniciones: custom.side || 'Sin guarnición',
    Bebidas: custom.beverage || 'Sin bebida',
    Postres: custom.dessert || 'Sin postre',
    'Respuestas personalizadas': getCustomResponsesTextForExcel(order),
    Origen: getAdminExtraOrderLabel(order),
    Comentarios: normalizeText(order.comments) || 'Sin comentarios',
    Estado: status === 'pending' ? 'Pendiente' : getStatusText(order.status)
  }
}

export const buildDailyOrdersExcelDetailRows = (orders = []) =>
  orders.map(buildDailyOrdersExcelDetailRow)

const incrementCounter = (map, key, amount = 1) => {
  const safeKey = normalizeText(key) || 'Sin dato'
  map.set(safeKey, (map.get(safeKey) || 0) + amount)
}

const incrementLocation = (map, location, orders = 1, items = 0) => {
  const safeLocation = normalizeText(location) || 'Sin ubicación'
  const current = map.get(safeLocation) || { orders: 0, items: 0 }
  current.orders += orders
  current.items += items
  map.set(safeLocation, current)
}

const sortByQuantityAndLabel = (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label)

const sortMenuWithSidesRows = (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label)

const getItemOptionPrefix = (label = '') => {
  const match = normalizeText(label).match(/^(opci[oó]n\s+\d+)\b/i)
  return match ? match[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : ''
}

const isFullerMenuLabelForSameOption = (candidate = '', current = '') => {
  const candidateText = normalizeText(candidate)
  const currentText = normalizeText(current)
  const candidatePrefix = getItemOptionPrefix(candidateText)
  return Boolean(
    candidatePrefix &&
    candidatePrefix === getItemOptionPrefix(currentText) &&
    candidateText.length > currentText.length
  )
}

const resolvePreferredMenuLabelsByLocation = (orders = []) => {
  const labelsByLocationAndOption = new Map()

  orders.forEach((order) => {
    const location = getOrderLocation(order)
    extractOrderItems(order).forEach((item) => {
      const optionPrefix = getItemOptionPrefix(item.label)
      if (!optionPrefix) return
      const key = `${location}\u0000${optionPrefix}`
      const current = labelsByLocationAndOption.get(key)
      if (!current || isFullerMenuLabelForSameOption(item.label, current)) {
        labelsByLocationAndOption.set(key, item.label)
      }
    })
  })

  return labelsByLocationAndOption
}

const resolveMenuLabelForWhatsApp = (item, location, preferredLabelsByLocationAndOption) => {
  const optionPrefix = getItemOptionPrefix(item?.label)
  if (!optionPrefix) return normalizeText(item?.label) || 'Sin menú / opción'
  return preferredLabelsByLocationAndOption.get(`${location}\u0000${optionPrefix}`) || item.label
}

const buildWhatsAppLocationMenuSummary = (orders = []) => {
  const byLocation = new Map()
  const preferredLabelsByLocationAndOption = resolvePreferredMenuLabelsByLocation(orders)
  let totalItems = 0

  orders.forEach((order) => {
    const location = getOrderLocation(order)
    const items = extractOrderItems(order)
    const orderItemsTotal = getOrderTotalItems(order, items)
    totalItems += orderItemsTotal

    if (!byLocation.has(location)) {
      byLocation.set(location, { label: location, total: 0, menus: new Map() })
    }

    const locationRow = byLocation.get(location)
    locationRow.total += orderItemsTotal

    const ensureMenu = (label, options = {}) => {
      const safeLabel = normalizeText(label) || 'Sin menú / opción'
      if (!locationRow.menus.has(safeLabel)) {
        locationRow.menus.set(safeLabel, {
          label: safeLabel,
          quantity: 0,
          sides: new Map(),
          unassigned: Boolean(options.unassigned)
        })
      }
      return locationRow.menus.get(safeLabel)
    }

    if (items.length) {
      items.forEach((item) => {
        const label = resolveMenuLabelForWhatsApp(item, location, preferredLabelsByLocationAndOption)
        ensureMenu(label).quantity += item.quantity
      })
    } else {
      ensureMenu('Sin menú / opción').quantity += 1
    }

    getSideAssociationsForOrder(order).forEach((side) => {
      const label = side.item
        ? resolveMenuLabelForWhatsApp(side.item, location, preferredLabelsByLocationAndOption)
        : 'Guarnición sin menú asociado'
      const menuRow = ensureMenu(label, { unassigned: !side.item })
      menuRow.sides.set(side.label, (menuRow.sides.get(side.label) || 0) + 1)
    })
  })

  return {
    totalItems,
    locations: [...byLocation.values()]
      .map((location) => ({
        ...location,
        menus: [...location.menus.values()]
          .map((menu) => ({
            ...menu,
            sides: [...menu.sides.entries()]
              .map(([label, quantity]) => ({ label, quantity }))
              .sort(sortMenuWithSidesRows)
          }))
          .sort(sortMenuWithSidesRows)
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
  }
}

const buildLocationMenuRows = (locationMenus, byLocation) =>
  [...byLocation.keys()].map((location) => {
    const menuRows = [...(locationMenus.get(location) || new Map()).entries()]
      .map(([label, quantity]) => ({ label, quantity }))
      .sort(sortByQuantityAndLabel)
    const locationTotals = byLocation.get(location) || { orders: 0, items: 0 }

    return {
      label: location,
      orders: locationTotals.orders,
      items: locationTotals.items,
      menus: menuRows
    }
  }).sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label))

const buildLocationCommentRows = (locationComments, byLocation) =>
  [...byLocation.keys()].map((location) => {
    const comments = [...(locationComments.get(location) || new Map()).entries()]
      .map(([comment, count]) => ({ comment, count }))
      .sort((a, b) => b.count - a.count || a.comment.localeCompare(b.comment))

    return {
      label: location,
      comments
    }
  }).sort((a, b) => {
    const aOrders = byLocation.get(a.label)?.orders || 0
    const bOrders = byLocation.get(b.label)?.orders || 0
    return bOrders - aOrders || a.label.localeCompare(b.label)
  })

const isBaseMenuAdditionalLabel = (label = '') => {
  const normalized = normalizeText(label).toLowerCase()
  return normalized.startsWith('menú de cena:') ||
    normalized.startsWith('menu de cena:') ||
    normalized.startsWith('cena:') ||
    normalized.startsWith('menú principal:') ||
    normalized.startsWith('menu principal:') ||
    normalized.startsWith('plato principal:')
}

const getAdditionalLabelsFromRow = (row) => {
  const labels = []
  if (row.guarnicion) labels.push({ label: `Guarnición: ${row.guarnicion}`, quantity: 1 })
  if (row.original) {
    getOrderBeverageBreakdown(row.original).forEach(({ label, quantity }) => {
      labels.push({ label: `Bebida: ${label}`, quantity })
    })
    getOrderDessertBreakdown(row.original).forEach(({ label, quantity }) => {
      labels.push({ label: `Postre: ${label}`, quantity })
    })
  } else {
    if (row.bebida) labels.push({ label: row.bebida, quantity: 1 })
    if (row.postre) labels.push({ label: row.postre, quantity: 1 })
  }
  if (row.opcionesAdicionales) {
    row.opcionesAdicionales
      .split('|')
      .map(normalizeText)
      .filter(Boolean)
      .forEach((label) => labels.push({ label, quantity: 1 }))
  }
  return labels.filter((item) => !isBaseMenuAdditionalLabel(item.label))
}

const buildLocationAdditionalRows = (locationAdditional, byLocation) =>
  [...byLocation.keys()].map((location) => {
    const items = [...(locationAdditional.get(location) || new Map()).entries()]
      .map(([label, quantity]) => ({ label, quantity }))
      .sort(sortByQuantityAndLabel)

    return {
      label: location,
      items
    }
  }).sort((a, b) => {
    const aOrders = byLocation.get(a.label)?.orders || 0
    const bOrders = byLocation.get(b.label)?.orders || 0
    return bOrders - aOrders || a.label.localeCompare(b.label)
  })

const buildInconsistencies = (orders) => {
  const rows = []
  orders.forEach((order, index) => {
    const label = getOrderCustomer(order) || `Pedido ${index + 1}`
    const issues = []
    const normalized = normalizeOrderForReadOnly(order || {})
    const isExtra = isAdminExtraOrder(order)
    const items = toArray(normalized.normalizedItems)
    const rawItems = safeOrderItemsArray(order?.items)
    const rawTotalItems = Number(order?.total_items)

    const rawCustomerName = normalizeText(order.customer_name || order.user_name || order.name)
    if (!isExtra) {
      if (!rawCustomerName) issues.push('Sin cliente')
      else if (!isValidCustomerName(rawCustomerName)) issues.push('Cliente inválido')
      if (!getOrderEmail(order)) issues.push('Sin email')
    }
    if (!normalizeText(order.location || order.company_name || order.company)) issues.push('Sin ubicación')
    if (items.length === 0) issues.push('Sin items')
    if (!Array.isArray(normalized.normalizedItems)) issues.push('Items malformados')
    if (!isExtra && isMealService(order?.service || 'lunch')) {
      if (rawItems.length > 1) issues.push('Más de un menú principal en almuerzo/cena')
      if (rawItems.some((item) => getRawItemQuantity(item) !== 1)) issues.push('Cantidad histórica normalizada')
      if (Number.isFinite(rawTotalItems) && rawTotalItems !== items.length) issues.push('Total histórico no coincide con items normalizados')
    }

    items.forEach((item) => {
      if (!item || typeof item !== 'object' || !getItemLabel(item)) issues.push('Items malformados')
      const quantity = getRawItemQuantity(item)
      if (!Number.isFinite(quantity) || quantity <= 0) issues.push('Cantidad inválida')
    })

    ;[...new Set(issues)].forEach((issue) => {
      rows.push({
        pedido: label,
        ubicacion: getOrderLocation(order),
        problema: issue
      })
    })
  })
  return rows
}

export const buildDailyOrdersSummary = (orders = [], selectedStatus = 'pending') => {
  const rows = orders.map(buildOrderExportRow)
  const byLocation = new Map()
  const byDeliveryLocation = new Map()
  const byMenu = new Map()
  const byService = new Map()
  const locationMenus = new Map()
  const locationComments = new Map()
  const locationAdditional = new Map()
  let totalItems = 0
  let commentsCount = 0
  let extraOrdersCount = 0

  rows.forEach((row) => {
    totalItems += row.totalItems
    if (row.comentarios) commentsCount += 1
    if (row.origen === 'Extra') extraOrdersCount += 1
    incrementLocation(byLocation, row.ubicacion, 1, row.totalItems)
    incrementLocation(byDeliveryLocation, row.lugarEntrega, 1, row.totalItems)
    incrementCounter(byService, row.servicio, row.totalItems)

    if (!locationMenus.has(row.ubicacion)) locationMenus.set(row.ubicacion, new Map())
    const scopedMenus = locationMenus.get(row.ubicacion)

    row.items.forEach((item) => {
      incrementCounter(byMenu, item.label, item.quantity)
      incrementCounter(scopedMenus, item.label, item.quantity)
    })
    if (row.items.length === 0) {
      incrementCounter(byMenu, 'Sin menú / opción', 1)
      incrementCounter(scopedMenus, 'Sin menú / opción', 1)
    }

    if (row.comentarios) {
      if (!locationComments.has(row.ubicacion)) locationComments.set(row.ubicacion, new Map())
      incrementCounter(locationComments.get(row.ubicacion), row.comentarios, 1)
    }

    const additionalLabels = getAdditionalLabelsFromRow(row)
    if (additionalLabels.length) {
      if (!locationAdditional.has(row.ubicacion)) locationAdditional.set(row.ubicacion, new Map())
      const scopedAdditional = locationAdditional.get(row.ubicacion)
      additionalLabels.forEach(({ label, quantity }) => incrementCounter(scopedAdditional, label, quantity))
    }
  })

  const deliveryDateISO = rows.find((row) => row.fechaEntregaISO)?.fechaEntregaISO || ''

  return {
    deliveryDateISO,
    deliveryDate: formatDateOnly(deliveryDateISO),
    exportedStatus: formatStatusForDisplay(selectedStatus),
    exportedStatusSlug: formatStatusForFilename(selectedStatus),
    totalOrders: rows.length,
    totalItems,
    commentsCount,
    extraOrdersCount,
    byLocation: [...byLocation.entries()].map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label)),
    byDeliveryLocation: [...byDeliveryLocation.entries()].map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.items - a.items || a.label.localeCompare(b.label)),
    byMenu: [...byMenu.entries()].map(([label, quantity]) => ({ label, quantity }))
      .sort(sortByQuantityAndLabel),
    byLocationMenu: buildLocationMenuRows(locationMenus, byLocation),
    additionalByLocation: buildLocationAdditionalRows(locationAdditional, byLocation),
    commentsByLocation: buildLocationCommentRows(locationComments, byLocation),
    byService: [...byService.entries()].map(([label, items]) => ({
      label,
      orders: rows.filter((row) => row.servicio === label).length,
      items
    })).sort((a, b) => a.label.localeCompare(b.label)),
    rows,
    comments: rows.filter((row) => row.comentarios),
    inconsistencies: buildInconsistencies(orders)
  }
}

export const buildDailyOrdersExcelFileName = (summary) => {
  const date = summary.deliveryDateISO || new Date().toISOString().slice(0, 10)
  return `Pedidos_ServiFood_${date}_${summary.exportedStatusSlug}.xlsx`
}

const plural = (count, singular, pluralText) => `${count} ${count === 1 ? singular : pluralText}`

const countRowsWithValue = (rows, key) => rows.filter((row) => normalizeText(row[key])).length

const formatIssueCounts = (inconsistencies) => {
  const counts = new Map()
  inconsistencies.forEach((row) => {
    const issue = normalizeText(row.problema) || 'Dato incompleto'
    counts.set(issue, (counts.get(issue) || 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export const formatDailyOrdersOperationalText = (orders = [], selectedStatus = 'pending', options = {}) => {
  const summary = buildDailyOrdersSummary(orders, selectedStatus)
  const reportTitle = options.title || 'REPORTE DE PEDIDOS SERVIFOOD'
  const dateLabel = options.dateLabel || 'Fecha de entrega'
  const beverageCount = countRowsWithValue(summary.rows, 'bebida')
  const sideCount = countRowsWithValue(summary.rows, 'guarnicion')
  const lines = [
    `*${reportTitle}*`,
    '',
    `*${dateLabel}:* ${summary.deliveryDate || 'Sin fecha'}`,
    `*Estado:* ${summary.exportedStatus}`,
    '',
    '*RESUMEN GENERAL*',
    '',
    `*Total de pedidos:* ${summary.totalOrders}`,
    `*Total de ítems:* ${summary.totalItems}`,
    `*Estado del reporte:* ${summary.inconsistencies.length ? 'Con avisos' : 'Completo'}`,
    '',
    '*TOTALES POR UBICACIÓN / EMPRESA*',
    ''
  ]

  if (summary.byLocation.length) {
    summary.byLocation.forEach((row) => {
      lines.push(`- ${row.label}: ${plural(row.orders, 'pedido', 'pedidos')} / ${plural(row.items, 'ítem', 'ítems')}`)
    })
    lines.push(`- Total general: ${plural(summary.totalOrders, 'pedido', 'pedidos')} / ${plural(summary.totalItems, 'ítem', 'ítems')}`)
  } else {
    lines.push('- Sin pedidos')
  }

  lines.push('', '*TOTALES POR LUGAR DE ENTREGA*', '')
  if (summary.byDeliveryLocation.length) {
    summary.byDeliveryLocation.forEach((row) => {
      lines.push(`- ${row.label}: ${plural(row.orders, 'pedido', 'pedidos')} / ${plural(row.items, 'ítem', 'ítems')}`)
    })
  } else {
    lines.push('- Sin pedidos')
  }

  lines.push('', '*DETALLE POR UBICACIÓN / EMPRESA*', '')
  if (summary.byLocationMenu.length) {
    summary.byLocationMenu.forEach((location) => {
      lines.push(`*${location.label}*`, '')
      if (location.menus.length) {
        location.menus.forEach((row) => lines.push(`- ${row.label}: ${row.quantity}`))
      } else {
        lines.push('- Sin menús/opciones para listar.')
      }
      lines.push(`- Subtotal ${location.label}: ${plural(location.items, 'ítem', 'ítems')}`, '')
    })
  } else {
    lines.push('- Sin detalle por ubicación.', '')
  }

  lines.push('*GUARNICIONES / ADICIONALES POR UBICACIÓN / EMPRESA*', '')
  if (summary.additionalByLocation.length) {
    summary.additionalByLocation.forEach((location) => {
      lines.push(`*${location.label}*`, '')
      if (location.items.length) {
        location.items.forEach((row) => {
          lines.push(`- ${row.label}${row.quantity > 1 ? ` (x${row.quantity})` : ''}`)
        })
      } else {
        lines.push('- Sin guarniciones/adicionales destacados.')
      }
      lines.push('')
    })
  } else {
    lines.push('- Sin guarniciones/adicionales destacados.', '')
  }

  lines.push('*COMENTARIOS / OBSERVACIONES POR UBICACIÓN / EMPRESA*', '')
  if (summary.commentsByLocation.length) {
    summary.commentsByLocation.forEach((location) => {
      lines.push(`*${location.label}*`, '')
      if (location.comments.length) {
        location.comments.forEach((row) => {
          lines.push(`- ${row.comment}${row.count > 1 ? ` (x${row.count})` : ''}`)
        })
      } else {
        lines.push('- Sin comentarios destacados.')
      }
      lines.push('')
    })
  } else {
    lines.push('- Sin comentarios destacados.', '')
  }

  lines.push('*OBSERVACIONES*', '')
  lines.push(`- ${plural(summary.commentsCount, 'pedido tiene', 'pedidos tienen')} comentarios.`)
  lines.push(`- ${plural(beverageCount, 'pedido incluye', 'pedidos incluyen')} bebida.`)
  lines.push(`- ${plural(sideCount, 'pedido incluye', 'pedidos incluyen')} guarnición.`)
  if (summary.extraOrdersCount > 0) {
    lines.push(`- ${plural(summary.extraOrdersCount, 'pedido fue cargado', 'pedidos fueron cargados')} por administración.`)
  }

  lines.push('', '*AVISOS*', '')
  if (summary.inconsistencies.length) {
    formatIssueCounts(summary.inconsistencies).forEach(([issue, count]) => {
      lines.push(`⚠️ ${issue}: ${plural(count, 'pedido', 'pedidos')}`)
    })
  } else {
    lines.push('✓ No se detectaron datos incompletos o inconsistentes.')
  }

  lines.push('', 'El detalle completo de clientes, opciones, bebidas, guarniciones y comentarios está en el Excel exportado.')

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

export const formatDailyOrdersForWhatsApp = (orders = [], selectedStatus = 'pending') => {
  const summary = buildWhatsAppLocationMenuSummary(orders, selectedStatus)
  const extraOrdersCount = (orders || []).filter(isAdminExtraOrder).length
  const additionalByLocation = new Map(
    buildDailyOrdersSummary(orders, selectedStatus).additionalByLocation.map((location) => [
      location.label,
      location.items.filter((item) => !normalizeText(item.label).toLowerCase().startsWith('guarnición:'))
    ])
  )
  const lines = ['📋 PEDIDOS SERVIFOOD', '']

  if (!summary.locations.length) {
    lines.push('Sin pedidos', '', '========================================', '', '✅ TOTAL GENERAL: 0 pedidos')
    return lines.join('\n')
  }

  summary.locations.forEach((location, index) => {
    if (index > 0) lines.push('========================================', '')

    lines.push(location.label, '')

    location.menus.forEach((menu) => {
      lines.push(menu.unassigned ? menu.label : `${menu.label}: ${menu.quantity}`, '')
      menu.sides.forEach((side) => {
        lines.push(`* ${side.quantity} ${side.label}`)
      })
      if (menu.sides.length) lines.push('')
    })

    const additionalItems = additionalByLocation.get(location.label) || []
    if (additionalItems.length) {
      lines.push('Adicionales:', '')
      additionalItems.forEach((item) => {
        lines.push(`* ${item.quantity} ${item.label}`)
      })
      lines.push('')
    }

    lines.push(`Total ${location.label}: ${location.total}`, '')
  })

  lines.push('========================================', '', `✅ TOTAL GENERAL: ${summary.totalItems} pedidos`)
  if (extraOrdersCount > 0) lines.push(`Extras cargados por admin: ${extraOrdersCount}`)

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
