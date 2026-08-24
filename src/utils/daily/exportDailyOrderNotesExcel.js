import ExcelJS from 'exceljs'
import { db } from '../../supabaseClient'
import logoUrl from '../../assets/servifood logo.jpg'
import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'
import { downloadWorkbook, filterOrdersByCompany, getOrderBeverageLabels, isBeverage } from './dailyOrderCalculations'
import {
  extractAdditionalResponseRows,
  formatDateOnly,
  getOrderLocation
} from './dailyOrdersExportModel'
import { notifyError, notifyInfo, notifySuccess } from '../notice'
import { getUserFriendlyErrorMessage } from '../index'
import {
  isRefrigerioLabel,
  summarizeOperationalOrder,
  summarizeOperationalOrders
} from '../order/orderOperationalTotals'
import { normalizeOrderForReadOnly } from '../order/normalizeOrderForReadOnly'
import { getSideAssociationsForOrder } from './dailyOrderSideAssociations'

const DETAIL_ROWS_PER_COPY = 16
const DETAIL_START_ROW = 9
const APPROVED_NOTE_COLUMN_WIDTHS = [
  1.42578125,
  7,
  9.42578125,
  9.42578125,
  9.42578125,
  10.140625,
  10.140625,
  10,
  7,
  9.42578125,
  9.42578125,
  9.42578125,
  10.140625,
  10.140625
]

const CALIBRI = 'Calibri'
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
const APPROVED_GRAY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
const LIGHT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const WHITE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
const BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
}
const THICK_BORDER = {
  top: { style: 'medium', color: { argb: 'FF000000' } },
  left: { style: 'medium', color: { argb: 'FF000000' } },
  bottom: { style: 'medium', color: { argb: 'FF000000' } },
  right: { style: 'medium', color: { argb: 'FF000000' } }
}

const INVALID_SHEET_CHARS = new Set(['[', ']', '*', '?', ':', '/', '\\', "'"])
const INVALID_FILE_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
const EXCLUDED_REMITO_COMPANY_SLUGS = new Set(['global', 'administracion_servifood'])
const REMITO_BEVERAGE_COMPANY_SLUG = 'genneia'
const UNSPECIFIED_BEVERAGE_LABEL = 'Bebida sin especificar'
const REMITO_DEBUG_PREFIX = '[ServiFood remitos]'
const normalizeText = (value) => String(value ?? '').trim()

const slugify = (value = '') =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('')
    .filter((char) => !INVALID_FILE_CHARS.has(char) && char.charCodeAt(0) >= 32)
    .join('')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Empresa'

const sanitizeFileName = (value = '') =>
  normalizeText(value)
    .split('')
    .map((char) => (INVALID_FILE_CHARS.has(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/\s+/g, '_')

const sanitizeSheetNameBase = (value = '') =>
  normalizeText(value)
    .split('')
    .map((char) => (INVALID_SHEET_CHARS.has(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim() || 'Empresa'

const buildUniqueSheetName = (displayName, usedNames) => {
  const base = sanitizeSheetNameBase(displayName)
  let candidate = base.slice(0, 31)
  let suffix = 1
  while (usedNames.has(candidate.toLowerCase())) {
    const end = ` ${suffix}`
    candidate = `${base.slice(0, 31 - end.length)}${end}`
    suffix += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

export const getOrderIds = (orders = []) =>
  orders
    .map((order) => order?.id)
    .filter((id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))

export const getDeliveryDate = (orders = []) =>
  normalizeText(orders.find((order) => order?.delivery_date)?.delivery_date).slice(0, 10) ||
  new Date().toISOString().slice(0, 10)

export const formatDateForFile = (isoDate) => {
  const formatted = formatDateOnly(isoDate)
  return formatted ? formatted.replaceAll('/', '-') : new Date().toLocaleDateString('es-AR').replaceAll('/', '-')
}

const normalizeCompanyMatchText = (value = '') =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const isEpseCompanySlug = (slug = '') =>
  normalizeCompanyMatchText(slug) === 'epse'

const firstNonBlank = (...values) =>
  values.map((value) => normalizeText(value)).find(Boolean) || ''

const formatEpseLocationLabel = (value = '') => {
  const raw = normalizeText(value)
  if (!raw) return 'EPSE'
  if (/^EPSE\s*[–-]\s*/i.test(raw)) return raw
  const normalized = normalizeCompanyMatchText(raw)
  if (normalized.startsWith('epse_')) {
    return `EPSE – ${raw
      .replace(/^EPSE[_\s-]*/i, '')
      .toLowerCase()
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')}`
  }
  return `EPSE – ${raw}`
}

export const getEpseRequestingLocationValue = (order = {}) =>
  firstNonBlank(
    order.requesting_location_code,
    order.order_location?.code,
    order.location_snapshot?.code,
    order.requesting_location,
    order.requesting_location_name,
    order.order_location?.display_name,
    order.order_location?.name,
    order.location_snapshot?.display_name,
    order.location_snapshot?.name,
    order.location,
    order.organization,
    order.company_name
  )

export const getOrderRemitoLocationKey = (order = {}) => {
  const company = resolveCompanyForOrder(order)
  if (!isEpseCompanySlug(company.slug)) return ''
  return normalizeCompanyMatchText(getEpseRequestingLocationValue(order))
}

export const getOrderRemitoLocationLabel = (order = {}) => {
  const company = resolveCompanyForOrder(order)
  if (!isEpseCompanySlug(company.slug)) return firstNonBlank(order.location, order.delivery_location)
  return formatEpseLocationLabel(firstNonBlank(
    order.requesting_location,
    order.requesting_location_name,
    order.order_location?.display_name,
    order.order_location?.name,
    order.location_snapshot?.display_name,
    order.location_snapshot?.name,
    order.location,
    getEpseRequestingLocationValue(order)
  ))
}

export const resolveCompanyForOrder = (order = {}) => {
  const raw = getOrderLocation(order)
  const company = getCompanyByLocationOrSlug(raw) || getCompanyByLocationOrSlug(order.company_slug || order.company)
  const normalizedRaw = normalizeCompanyMatchText(raw)
  if (!company && normalizedRaw.startsWith('epse')) {
    return {
      slug: 'epse',
      name: 'EPSE',
      displayName: raw || 'EPSE'
    }
  }
  return {
    slug: company?.slug || slugify(raw).toLowerCase(),
    name: company?.name || raw || 'Sin ubicación',
    displayName: raw || company?.name || 'Sin ubicación'
  }
}

export const isRemitoEligibleCompany = (company = {}) =>
  company?.slug && !EXCLUDED_REMITO_COMPANY_SLUGS.has(company.slug)

const allowsRemitoBeverages = (order = {}) =>
  resolveCompanyForOrder(order).slug === REMITO_BEVERAGE_COMPANY_SLUG

const summarizeRemitoOperationalOrders = (orders = []) => {
  const operationalSummary = summarizeOperationalOrders(orders)
  const beverageOrders = (orders || []).filter(allowsRemitoBeverages)

  if (beverageOrders.length === (orders || []).length) return operationalSummary

  const beverageSummary = beverageOrders.length > 0
    ? summarizeOperationalOrders(beverageOrders)
    : { beverageTotal: 0, beverageBreakdown: [] }

  return {
    ...operationalSummary,
    beverageTotal: beverageSummary.beverageTotal,
    beverageBreakdown: beverageSummary.beverageBreakdown
  }
}

export const buildCompanyGroups = (orders = []) => {
  const groups = new Map()
  orders.forEach((order) => {
    const company = resolveCompanyForOrder(order)
    if (!isRemitoEligibleCompany(company)) return
    const locationKey = getOrderRemitoLocationKey(order)
    const groupKey = [company.slug, locationKey].filter(Boolean).join(':')
    if (!groups.has(groupKey)) {
      const locationLabel = getOrderRemitoLocationLabel(order)
      groups.set(groupKey, {
        ...company,
        displayName: isEpseCompanySlug(company.slug) && locationLabel ? locationLabel : company.displayName,
        locationKey,
        locationLabel,
        orders: []
      })
    }
    groups.get(groupKey).orders.push(order)
  })
  return [...groups.values()].sort((a, b) =>
    (a.displayName || a.name).localeCompare(b.displayName || b.name)
  )
}

const getIndexCompanyLabel = (remito = {}) =>
  `${remito.companyDisplayName || remito.companyName || 'Empresa'} - N° ${remito.remitoNumber}`

export const isValidRemitoNumberingConfig = (config = {}) => {
  const start = Number(config?.remito_start_number)
  const end = Number(config?.remito_end_number)
  const next = Number(config?.next_remito_number)
  return Number.isInteger(start) &&
    Number.isInteger(end) &&
    Number.isInteger(next) &&
    start > 0 &&
    end > 0 &&
    next > 0 &&
    start <= end &&
    next >= start &&
    next <= end + 1
}

export const buildRemitoConfigBySlug = (configs = []) => {
  const map = new Map()
  ;(Array.isArray(configs) ? configs : []).forEach((config) => {
    if (!config?.slug) return
    map.set(config.slug, config)
  })
  return map
}

export const isRemitoNumberInCompanyRange = (companySlug, remitoNumber, configBySlug = null) => {
  const number = Number(remitoNumber)
  if (!Number.isInteger(number)) return false
  const config = configBySlug instanceof Map ? configBySlug.get(companySlug) : null
  if (!config) return number > 0
  return isValidRemitoNumberingConfig(config) &&
    number >= Number(config.remito_start_number) &&
    number <= Number(config.remito_end_number)
}

export const getRemitoIssueFallbackMessage = (companyName, error) => {
  const raw = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code
  ].map((value) => normalizeText(value)).filter(Boolean).join(' | ')
  const suffix = raw ? ` Detalle técnico: ${raw}` : ''
  return `No pudimos emitir la nota de pedido para ${companyName}.${suffix}`
}

const normalizeRemitoComparisonText = (value = '') =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

const getOptionNumber = (label = '') => {
  const match = normalizeRemitoComparisonText(label).match(/\bopcion\s+(\d+)\b/)
  return match ? Number(match[1]) : null
}

export const isObservationLabel = (label = '') => {
  const text = normalizeRemitoComparisonText(label)
  return text.startsWith('observacion') || text.startsWith('comentario') || text.startsWith('leyenda')
}

const hasObservationMarker = (label = '') => {
  const text = normalizeRemitoComparisonText(label)
  return isObservationLabel(label) || /\b(observacion|comentario|leyenda)\b/.test(text)
}

export const REMITO_ROW_CATEGORIES = {
  mainMenu: 'main_menu',
  numberedOption: 'numbered_option',
  dinner: 'dinner',
  drink: 'drink',
  side: 'side',
  dessert: 'dessert',
  observation: 'observation',
  additional: 'additional'
}

export const isMenuCountableCategory = (category) =>
  category === REMITO_ROW_CATEGORIES.mainMenu ||
  category === REMITO_ROW_CATEGORIES.numberedOption ||
  category === REMITO_ROW_CATEGORIES.dinner

export const getRemitoCategoryForLabel = (label = '') => {
  const text = normalizeRemitoComparisonText(label)
  if (text.startsWith('menu principal') || text.includes('menu principal')) return REMITO_ROW_CATEGORIES.mainMenu
  if (text.startsWith('menu') && !text.startsWith('menu de cena')) return REMITO_ROW_CATEGORIES.mainMenu
  if (getOptionNumber(label) != null) return REMITO_ROW_CATEGORIES.numberedOption
  if (text.startsWith('menu de cena') || text.startsWith('opcion de cena') || text.startsWith('cena')) {
    return REMITO_ROW_CATEGORIES.dinner
  }
  if (text.startsWith('bebida') || isBeverage(text)) return REMITO_ROW_CATEGORIES.drink
  if (text.startsWith('guarnicion')) return REMITO_ROW_CATEGORIES.side
  if (text.startsWith('fruta o postre') || text.startsWith('fruta') || text.startsWith('postre')) return REMITO_ROW_CATEGORIES.dessert
  if (isObservationLabel(label)) return REMITO_ROW_CATEGORIES.observation
  return REMITO_ROW_CATEGORIES.additional
}

const REMITO_CATEGORY_PRIORITY = {
  [REMITO_ROW_CATEGORIES.mainMenu]: 10,
  [REMITO_ROW_CATEGORIES.numberedOption]: 20,
  [REMITO_ROW_CATEGORIES.dinner]: 30,
  [REMITO_ROW_CATEGORIES.drink]: 40,
  [REMITO_ROW_CATEGORIES.side]: 50,
  [REMITO_ROW_CATEGORIES.dessert]: 60,
  [REMITO_ROW_CATEGORIES.observation]: 70,
  [REMITO_ROW_CATEGORIES.additional]: 80
}

export const getRemitoRowPriority = (label = '', category = getRemitoCategoryForLabel(label)) => {
  const optionNumber = category === REMITO_ROW_CATEGORIES.numberedOption ? getOptionNumber(label) : null
  return [REMITO_CATEGORY_PRIORITY[category] || 90, optionNumber || 0]
}

const sortRemitoRows = (a, b) => {
  const [categoryA, numberA] = getRemitoRowPriority(a.producto, a.category)
  const [categoryB, numberB] = getRemitoRowPriority(b.producto, b.category)
  return categoryA - categoryB || numberA - numberB || a.producto.localeCompare(b.producto)
}

const isRefrigerioProductLabel = (label = '') =>
  normalizeRemitoComparisonText(label) === 'refrigerio'

const isCeliacMenuText = (value = '') => {
  const text = normalizeRemitoComparisonText(value)
  return /\bceliac[oa]s?\b/.test(text) || text.includes('sin tacc')
}

const getOrderCeliacContextText = (order = {}) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const responseText = Array.isArray(normalizedCustomResponses)
    ? normalizedCustomResponses.map((response) => JSON.stringify(response)).join(' ')
    : ''
  return [
    order?.notes,
    order?.comments,
    order?.observations,
    order?.observaciones,
    order?.dietary_notes,
    order?.food_restrictions,
    responseText
  ].filter(Boolean).join(' ')
}

const getPanQuantityForOrder = (order = {}, menuRows = []) => {
  const menuTotal = menuRows.reduce((sum, row) => sum + Number(row?.quantity || 0), 0)
  if (!menuTotal) return 0
  if (isCeliacMenuText(getOrderCeliacContextText(order))) return 0
  const celiacMenuTotal = menuRows.reduce((sum, row) => (
    isCeliacMenuText(row?.label) ? sum + Number(row?.quantity || 0) : sum
  ), 0)
  return Math.max(menuTotal - celiacMenuTotal, 0)
}

const getOrderItemProductLabel = (item = {}) => {
  const name = normalizeText(item?.name || item?.title || item?.menu || item?.label)
  const option = normalizeText(item?.option || item?.selected_option || item?.choice)
  return [name, option].filter(Boolean).join(' - ')
}

const getOrderItemProductQuantity = (item = {}) => {
  const quantity = Number(item?.quantity ?? item?.qty ?? item?.count)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

const getAdditionalItemRowsForOrder = (order = {}) => {
  const { normalizedItems } = normalizeOrderForReadOnly(order)
  return (Array.isArray(normalizedItems) ? normalizedItems : [])
    .map((item) => ({
      label: getOrderItemProductLabel(item),
      quantity: getOrderItemProductQuantity(item)
    }))
    .filter((row) => row.label && isRefrigerioLabel(row.label) && row.quantity > 0)
}

const getDinnerDishName = (label = '') =>
  normalizeText(label)
    .replace(/^(men[uú]\s+de\s+cena|opci[oó]n\s+de\s+cena|cena)\s*[:-]?\s*/i, '')

const normalizeDinnerProductLabel = (label = '') => {
  const dishName = getDinnerDishName(label)
  return dishName ? `Cena: ${dishName}` : 'Cena:'
}

const buildRemitoProductSummaryRow = (label, category = getRemitoCategoryForLabel(label)) => {
  const producto = category === REMITO_ROW_CATEGORIES.dinner
    ? normalizeDinnerProductLabel(label)
    : normalizeText(label)
  const groupName = category === REMITO_ROW_CATEGORIES.dinner
    ? getDinnerDishName(label)
    : producto

  return {
    producto,
    category,
    groupKey: `${category}:${normalizeRemitoComparisonText(groupName)}`
  }
}

const appendSideToMenuLabel = (label = '', side = '') => {
  const cleanLabel = normalizeText(label)
  const cleanSide = normalizeText(side)
  if (!cleanSide) return cleanLabel
  if (normalizeRemitoComparisonText(cleanLabel).includes(normalizeRemitoComparisonText(cleanSide))) return cleanLabel
  return `${cleanLabel} - ${cleanSide}`
}

const countLabels = (labels = []) => {
  const map = new Map()
  labels.map(normalizeText).filter(Boolean).forEach((label) => {
    const key = normalizeRemitoComparisonText(label)
    const current = map.get(key) || { label, quantity: 0 }
    current.quantity += 1
    map.set(key, current)
  })
  return [...map.values()]
}

const getRemitoMenuRowsForOrder = (order = {}) => {
  try {
    const summary = summarizeOperationalOrder(order)
    const sideLabelsByMenu = new Map()

    getSideAssociationsForOrder(order)
      .filter((association) => association.assigned && normalizeText(association.itemLabel))
      .forEach((association) => {
        const key = normalizeRemitoComparisonText(association.itemLabel)
        const labels = sideLabelsByMenu.get(key) || []
        labels.push(association.label)
        sideLabelsByMenu.set(key, labels)
      })

    return summary.menuBreakdown.flatMap((row) => {
      const quantity = Number(row.quantity || 0)
      if (!quantity) return []
      const sideRows = countLabels(sideLabelsByMenu.get(normalizeRemitoComparisonText(row.label)) || [])
      if (sideRows.length === 0) return [row]
      if (sideRows.length === 1) {
        return [{
          label: appendSideToMenuLabel(row.label, sideRows[0].label),
          quantity
        }]
      }

      const splitRows = sideRows.map((side) => ({
        label: appendSideToMenuLabel(row.label, side.label),
        quantity: side.quantity
      }))
      const assignedQuantity = splitRows.reduce((sum, side) => sum + side.quantity, 0)
      if (assignedQuantity < quantity) {
        splitRows.push({
          label: row.label,
          quantity: quantity - assignedQuantity
        })
      }
      return splitRows
    })
  } catch (error) {
    console.error(`${REMITO_DEBUG_PREFIX} Error agrupando menú/guarnición de pedido`, {
      error,
      orderId: order?.id,
      orderOrigin: order?.order_origin,
      service: order?.service,
      status: order?.status,
      deliveryDate: order?.delivery_date,
      items: order?.items,
      customResponses: order?.custom_responses,
      order
    })
    throw error
  }
}

const getResponseValues = (value) => {
  if (Array.isArray(value)) return value.flatMap(getResponseValues)
  if (value && typeof value === 'object') {
    return getResponseValues(value.label ?? value.name ?? value.title ?? value.value ?? value.response ?? value.answer)
  }
  const text = normalizeText(value)
  if (!text) return []
  return text.split(',').map(normalizeText).filter(Boolean)
}

const getResponseQuantity = (response = {}) => {
  const quantity = Number(response.quantity ?? response.qty ?? response.count ?? 1)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

const stripBeveragePrefix = (value = '') =>
  normalizeText(value).replace(/^bebida\s*:\s*/i, '')

export const normalizeBeverageLabel = (value = '') => {
  const label = stripBeveragePrefix(value)
  const key = getBeverageSummaryKey(label)
  if (!key) return ''
  if (key.includes('sin especificar')) return UNSPECIFIED_BEVERAGE_LABEL
  if (/\bcoca\s*zero\b/.test(key) || /\bcoca[-\s]*0\b/.test(key)) return 'Coca Zero'
  if (/\bcoca\b/.test(key) || key.includes('coca cola')) return 'Coca cola'
  if (/\bagua\b/.test(key)) return 'Agua'
  if (/\bsoda\b/.test(key)) return 'Soda'
  return label
}

const getBeverageSummaryKey = (value = '') =>
  stripBeveragePrefix(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

export const getOrderRemitoBeverages = (order = {}) => {
  if (!allowsRemitoBeverages(order)) return []

  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const responses = Array.isArray(normalizedCustomResponses) ? normalizedCustomResponses : []
  const beverages = []
  const seenKeys = new Set()

  const addBeverage = (value, quantity = 1) => {
    const label = normalizeBeverageLabel(value)
    if (!label) return
    const key = getBeverageSummaryKey(label)
    if (!key || seenKeys.has(key)) return
    seenKeys.add(key)
    beverages.push({ label, quantity })
  }

  responses.forEach((response) => {
    const title = normalizeText(response.title || response.label || response.question || response.name)
    const lowerTitle = title.toLowerCase()
    const primaryValue = response.answer ?? response.response ?? response.value
    const primaryValues = getResponseValues(primaryValue)
    const values = primaryValues.length ? primaryValues : getResponseValues(response.options)
    const isDrinkQuestion = lowerTitle.includes('bebida')
    const quantity = getResponseQuantity(response)

    values.forEach((value) => {
      if (!value) return
      if (!isDrinkQuestion && !isBeverage(value)) return
      addBeverage(value, quantity)
    })
  })

  if (beverages.length === 0) {
    getOrderBeverageLabels(order).forEach((label) => addBeverage(label, 1))
  }

  return beverages
}

export const isMenuProductLabel = (label = '') =>
  isMenuCountableCategory(getRemitoCategoryForLabel(label))

export const getRemitoMenuTotalFromRows = (products = []) =>
  products.reduce((sum, product) => (
    isMenuCountableCategory(product?.category) ? sum + Number(product?.cantidad || 0) : sum
  ), 0)

export const getOrderMenuTotalForRemito = (order = {}) =>
  getRemitoMenuTotalFromRows(summarizeProducts([order]))

export const getTotalMenuItemsForRemito = (orders = []) =>
  getRemitoMenuTotalFromRows(summarizeProducts(orders))

export const summarizeProducts = (orders = []) => {
  try {
    const totals = new Map()
    const operationalSummary = summarizeRemitoOperationalOrders(orders)
    const incrementCategorizedSummary = (label, quantity = 1, category = getRemitoCategoryForLabel(label)) => {
      if (!normalizeText(label)) return
      const { producto, groupKey } = buildRemitoProductSummaryRow(label, category)
      const current = totals.get(groupKey) || { producto, cantidad: 0, category }
      current.cantidad += quantity
      totals.set(groupKey, current)
    }

    const remitoMenuRows = []
    let panTotal = 0
    orders.forEach((order) => {
      const orderMenuRows = getRemitoMenuRowsForOrder(order)
      remitoMenuRows.push(...orderMenuRows)
      panTotal += getPanQuantityForOrder(order, orderMenuRows)
    })

    remitoMenuRows.forEach((row) => {
      incrementCategorizedSummary(row.label, row.quantity, getRemitoCategoryForLabel(row.label))
    })
    orders.forEach((order) => {
      getAdditionalItemRowsForOrder(order).forEach((row) => {
        incrementCategorizedSummary(row.label, row.quantity, REMITO_ROW_CATEGORIES.additional)
      })
    })
    if (remitoMenuRows.length === 0 && operationalSummary.menuTotal > 0) {
      incrementCategorizedSummary('Menú / vianda', operationalSummary.menuTotal, REMITO_ROW_CATEGORIES.mainMenu)
      panTotal = operationalSummary.menuTotal
    }
    if (panTotal > 0) {
      incrementCategorizedSummary('Pan', panTotal, REMITO_ROW_CATEGORIES.additional)
    }
    operationalSummary.beverageBreakdown.forEach((row) => {
      incrementCategorizedSummary(`Bebida: ${row.label}`, row.quantity, REMITO_ROW_CATEGORIES.drink)
    })
    operationalSummary.dessertBreakdown.forEach((row) => {
      incrementCategorizedSummary(`Postre: ${row.label}`, row.quantity, REMITO_ROW_CATEGORIES.dessert)
    })

    orders.forEach((order) => {
      extractAdditionalResponseRows(order).forEach((row) => {
        if (!hasObservationMarker(row.label)) {
          incrementCategorizedSummary(row.label, row.quantity)
        }
      })
    })
    return [...totals.values()].sort(sortRemitoRows)
  } catch (error) {
    console.error(`${REMITO_DEBUG_PREFIX} Error resumiendo productos de remito`, {
      error,
      ordersCount: Array.isArray(orders) ? orders.length : null,
      orderIds: Array.isArray(orders) ? orders.map((order) => order?.id) : [],
      orders
    })
    throw error
  }
}

const configurePrintPage = (worksheet, printArea = 'A1:N33') => {
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    scale: 110,
    horizontalCentered: true,
    verticalCentered: false,
    printTitlesRow: '',
    printTitlesColumn: '',
    margins: {
      left: 0.23622047244094491,
      right: 0.23622047244094491,
      top: 0.39370078740157483,
      bottom: 0.39370078740157483,
      header: 0,
      footer: 0
    },
    printArea
  }
  worksheet.headerFooter = {
    oddHeader: '',
    oddFooter: '',
    evenHeader: '',
    evenFooter: '',
    firstHeader: '',
    firstFooter: ''
  }
  worksheet.properties.showGridLines = false
  worksheet.views = [{ showGridLines: false }]
}

const configureIndexPrintPage = (worksheet, printArea) => {
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    horizontalCentered: true,
    verticalCentered: false,
    printTitlesRow: '',
    printTitlesColumn: '',
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.12,
      footer: 0.12
    },
    printArea
  }
  worksheet.properties.showGridLines = false
  worksheet.views = [{ showGridLines: false }]
}

const applyOuterBorder = (worksheet, fromRow, toRow, fromCol, toCol) => {
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber += 1) {
    for (let colNumber = fromCol; colNumber <= toCol; colNumber += 1) {
      const cell = worksheet.getCell(rowNumber, colNumber)
      cell.border = {
        top: rowNumber === fromRow ? THICK_BORDER.top : (cell.border?.top || BORDER.top),
        left: colNumber === fromCol ? THICK_BORDER.left : (cell.border?.left || BORDER.left),
        bottom: rowNumber === toRow ? THICK_BORDER.bottom : (cell.border?.bottom || BORDER.bottom),
        right: colNumber === toCol ? THICK_BORDER.right : (cell.border?.right || BORDER.right)
      }
    }
  }
}

const REMITO_LOGO_SIZE_PX = 50
const REMITO_LOGO_NATIVE_COL_OFF = 2592
const REMITO_LOGO_NATIVE_ROW_OFF = 132499

const getApprovedLogoAnchor = (colNumber) => {
  return {
    tl: {
      nativeCol: colNumber - 1,
      nativeColOff: REMITO_LOGO_NATIVE_COL_OFF,
      nativeRow: 0,
      nativeRowOff: REMITO_LOGO_NATIVE_ROW_OFF
    },
    ext: {
      width: REMITO_LOGO_SIZE_PX,
      height: REMITO_LOGO_SIZE_PX
    }
  }
}

const createWorkbookLogoImageId = async (workbook) => {
  try {
    const response = await fetch(logoUrl)
    const buffer = await response.arrayBuffer()
    return workbook.addImage({ buffer, extension: 'jpeg' })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('No se pudo agregar el logo al Excel:', error)
    }
    return null
  }
}

const addLogoAt = (worksheet, imageId, startCol) => {
  if (imageId == null) return
  worksheet.addImage(imageId, getApprovedLogoAnchor(startCol))
}

const withCalibri = (font = {}) => ({ name: CALIBRI, ...font })
const labelValueRichText = (label, value, baseSize = 9) => ({
  richText: [
    { text: label, font: withCalibri({ size: baseSize, bold: true }) },
    { text: value, font: withCalibri({ size: baseSize + 2, bold: true }) }
  ]
})

const copyCell = (worksheet, row, col, value, options = {}) => {
  const cell = worksheet.getCell(row, col)
  cell.value = value
  cell.font = withCalibri(options.font || { size: 8, color: { argb: 'FF000000' } })
  cell.alignment = options.alignment || { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.fill = options.fill || WHITE_FILL
  cell.border = options.border || BORDER
  return cell
}

const mergeAndSet = (worksheet, fromRow, fromCol, toRow, toCol, value, options = {}) => {
  worksheet.mergeCells(fromRow, fromCol, toRow, toCol)
  return copyCell(worksheet, fromRow, fromCol, value, options)
}

const addInstitutionalBlock = (worksheet, startCol) => {
  const lines = [
    'Servi Food S.A.',
    'Saturnino Sarassa 345 Este.',
    'C.P. 5400 - Ciudad.',
    'San Juan - Argentina.',
    'Teléfonos.',
    'IVA Responsable Inscripto.',
    'CUIT.'
  ]
  mergeAndSet(worksheet, 1, startCol + 1, 4, startCol + 2, lines.join('\n'), {
    font: { size: 6.5, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
}

const collapseOverflowRows = (products = [], maxRows = DETAIL_ROWS_PER_COPY) => {
  if (products.length <= maxRows) return products

  const visibleRows = products.slice(0, maxRows - 1)
  const remainingRows = products.slice(maxRows - 1)
  const remainingQuantity = remainingRows.reduce((sum, product) => sum + Number(product?.cantidad || 0), 0)
  const remainingLabels = remainingRows.map((product) => product.producto).filter(Boolean).join(', ')
  return [
    ...visibleRows,
    {
      cantidad: remainingQuantity || '',
      producto: `Otros conceptos (${remainingRows.length}): ${remainingLabels}`,
      category: REMITO_ROW_CATEGORIES.additional
    }
  ]
}

export const getPrintableDetailRows = (products = [], totalItems = getRemitoMenuTotalFromRows(products)) => {
  const printableProducts = products.filter((product) => (
    product?.category !== REMITO_ROW_CATEGORIES.observation &&
    !hasObservationMarker(product?.producto)
  ))
  const menuRows = printableProducts.filter((product) => isMenuCountableCategory(product?.category))
  const beverageRows = printableProducts.filter((product) => product?.category === REMITO_ROW_CATEGORIES.drink)
  const dessertRows = printableProducts.filter((product) => product?.category === REMITO_ROW_CATEGORIES.dessert)
  const refrigerioRows = printableProducts.filter((product) => isRefrigerioProductLabel(product?.producto))
  const additionalRows = printableProducts.filter((product) => (
    !isMenuCountableCategory(product?.category) &&
    product?.category !== REMITO_ROW_CATEGORIES.drink &&
    product?.category !== REMITO_ROW_CATEGORIES.dessert &&
    !isRefrigerioProductLabel(product?.producto)
  ))
  const beverageTotal = beverageRows.reduce((sum, product) => sum + Number(product?.cantidad || 0), 0)
  const dessertTotal = dessertRows.reduce((sum, product) => sum + Number(product?.cantidad || 0), 0)
  const refrigerioTotal = refrigerioRows.reduce((sum, product) => sum + Number(product?.cantidad || 0), 0)
  const beverageDetailRows = beverageRows.length > 0
    ? [
        ...collapseOverflowRows(beverageRows),
        {
          cantidad: beverageTotal,
          producto: 'TOTAL BEBIDAS',
          category: 'total_beverages'
        }
      ]
    : []
  const refrigerioDetailRows = refrigerioRows.length > 0
    ? [
        ...collapseOverflowRows(refrigerioRows),
        {
          cantidad: refrigerioTotal,
          producto: 'TOTAL REFRIGERIOS',
          category: 'total_refrigerios'
        }
      ]
    : []

  return [
    ...collapseOverflowRows(menuRows),
    {
      cantidad: totalItems,
      producto: 'TOTAL MENÚS / VIANDAS',
      category: 'total_menu'
    },
    ...beverageDetailRows,
    ...collapseOverflowRows(dessertRows),
    {
      cantidad: dessertTotal,
      producto: 'TOTAL POSTRES',
      category: 'total_desserts'
    },
    ...refrigerioDetailRows,
    ...collapseOverflowRows(additionalRows)
  ]
}

const addCopySheetBlock = (worksheet, remito, startCol, copyLabel, logoImageId) => {
  const endCol = startCol + 5
  const xCol = startCol + 3
  const titleStartCol = startCol + 4
  addLogoAt(worksheet, logoImageId, startCol)

  mergeAndSet(worksheet, 1, startCol, 4, startCol, '', { border: BORDER })
  addInstitutionalBlock(worksheet, startCol)
  copyCell(worksheet, 1, xCol, 'X', {
    font: { size: 20, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 1, titleStartCol, 1, endCol, copyLabel, {
    font: { size: 8, bold: true },
    fill: LIGHT_FILL,
    alignment: { vertical: 'middle', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 2, titleStartCol, 3, endCol, 'NOTA DE PEDIDO', {
    font: { size: 12, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 4, titleStartCol, 4, endCol, `N° ${remito.remitoNumber}`, {
    font: { size: 10, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' }
  })

  mergeAndSet(worksheet, 5, startCol, 5, startCol + 2, labelValueRichText('Fecha: ', formatDateOnly(remito.deliveryDate)), {
    font: { size: 9, bold: true },
    fill: APPROVED_GRAY_FILL,
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, 5, xCol, 5, endCol, labelValueRichText('Empresa: ', remito.companyDisplayName), {
    font: { size: 9, bold: true },
    fill: APPROVED_GRAY_FILL,
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, 6, startCol, 6, endCol, 'Documento no válido como factura', {
    font: { size: 8, italic: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  mergeAndSet(worksheet, 7, startCol, 7, startCol + 2, 'I.V.A. RESPONSABLE INSCRIPTO', {
    font: { size: 7, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  mergeAndSet(worksheet, 7, xCol, 7, endCol, 'C.U.I.T. N°: 30-71000228-9', {
    font: { size: 7, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  copyCell(worksheet, 8, startCol, 'CANT.', {
    font: { size: 8, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: HEADER_FILL
  })
  mergeAndSet(worksheet, 8, startCol + 1, 8, endCol, 'DETALLE', {
    font: { size: 8, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: HEADER_FILL
  })

  const detailRows = getPrintableDetailRows(remito.products, remito.totalItems)
  detailRows.forEach((product, index) => {
    const rowNumber = DETAIL_START_ROW + index
    const category = String(product?.category || '')
    const isMenuTotal = category === 'total_menu'
    const isSecondaryTotal = category === 'total_beverages' || category === 'total_desserts'
    const isTotalRow = isMenuTotal || isSecondaryTotal
    copyCell(worksheet, rowNumber, startCol, product?.cantidad || '', {
      font: { size: isMenuTotal ? 12 : 8, bold: isTotalRow },
      fill: isMenuTotal ? APPROVED_GRAY_FILL : (isSecondaryTotal ? LIGHT_FILL : WHITE_FILL),
      alignment: { vertical: 'middle', horizontal: 'center' }
    })
    mergeAndSet(worksheet, rowNumber, startCol + 1, rowNumber, endCol, product?.producto || '', {
      font: { size: isMenuTotal ? 12 : 8, bold: isTotalRow },
      fill: isMenuTotal ? APPROVED_GRAY_FILL : (isSecondaryTotal ? LIGHT_FILL : WHITE_FILL),
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
    worksheet.getRow(rowNumber).height = 15.6
  })
  for (let index = detailRows.length; index < DETAIL_ROWS_PER_COPY; index += 1) {
    const rowNumber = DETAIL_START_ROW + index
    copyCell(worksheet, rowNumber, startCol, null, {
      font: { size: 8 },
      alignment: { vertical: 'middle', horizontal: 'center' }
    })
    mergeAndSet(worksheet, rowNumber, startCol + 1, rowNumber, endCol, null, {
      font: { size: 8 },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
    worksheet.getRow(rowNumber).height = 15.6
  }

  const footerStartRow = Math.max(27, DETAIL_START_ROW + detailRows.length + 1)

  mergeAndSet(worksheet, footerStartRow, startCol, footerStartRow + 2, endCol, 'DEVOLUCIONES', {
    font: { size: 8, bold: true },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, footerStartRow + 3, startCol, footerStartRow + 3, endCol, 'CONTROL DE CALIDAD / CANTIDAD:    CONFORME  □      NO CONFORME  □', {
    font: { size: 8, bold: true },
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, footerStartRow + 5, startCol, footerStartRow + 6, startCol + 2, 'FIRMA RESPONSABLE', {
    font: { size: 8, bold: true },
    alignment: { horizontal: 'center' }
  })
  mergeAndSet(worksheet, footerStartRow + 5, xCol, footerStartRow + 6, endCol, 'FIRMA TRANSPORTE', {
    font: { size: 8, bold: true },
    alignment: { horizontal: 'center' }
  })
  worksheet.getRow(footerStartRow + 1).height = 10.5
  worksheet.getRow(footerStartRow + 2).height = 8.25
  worksheet.getRow(footerStartRow + 3).height = 15.6
  worksheet.getRow(footerStartRow + 4).height = 15.6
  worksheet.getRow(footerStartRow + 5).height = 15.6
  worksheet.getRow(footerStartRow + 6).height = 15.6

  applyOuterBorder(worksheet, 1, footerStartRow + 6, startCol, endCol)
  return footerStartRow + 6
}

export const addRemitoSheet = async (workbook, remito, sheetName) => {
  const worksheet = workbook.addWorksheet(sheetName)
  worksheet.columns = APPROVED_NOTE_COLUMN_WIDTHS.map((width, index) => ({ key: `col${index + 1}`, width }))
  worksheet.properties.showGridLines = false
  worksheet.views = [{ showGridLines: false }]
  for (let rowNumber = 1; rowNumber <= 60; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = rowNumber <= 7 ? 15.95 : 15.6
  }

  const logoImageId = await createWorkbookLogoImageId(workbook)
  const originalEndRow = addCopySheetBlock(worksheet, remito, 2, 'ORIGINAL', logoImageId)
  const duplicateEndRow = addCopySheetBlock(worksheet, remito, 9, 'DUPLICADO', logoImageId)
  const sheetEndRow = Math.max(originalEndRow, duplicateEndRow)

  worksheet.getCell(`A${sheetEndRow + 2}`).value = {
    text: 'Volver al índice',
    hyperlink: "#'Índice'!A1"
  }
  worksheet.getCell(`A${sheetEndRow + 2}`).font = withCalibri({ color: { argb: 'FF2563EB' }, underline: true, size: 8 })
  worksheet.getCell(`A${sheetEndRow + 2}`).alignment = { vertical: 'middle', horizontal: 'left' }

  configurePrintPage(worksheet, `A1:N${sheetEndRow}`)
  return worksheet
}

export const addIndexSheet = (workbook, remitos) => {
  const worksheet = workbook.addWorksheet('Índice', { properties: { tabColor: { argb: 'FF111827' } } })
  worksheet.columns = [
    { header: 'Empresa', key: 'empresa', width: 34 },
    { header: 'Número de nota', key: 'numero', width: 18 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Cantidad total', key: 'cantidad', width: 16 },
    { header: 'Enlace', key: 'enlace', width: 18 }
  ]
  worksheet.views = [{ showGridLines: false }]
  worksheet.properties.showGridLines = false

  worksheet.mergeCells('A1:E1')
  worksheet.getRow(1).height = 21
  worksheet.getCell('A1').value = 'Índice de notas de pedido'
  worksheet.getCell('A1').font = withCalibri({ bold: true, size: 16, color: { argb: 'FF111827' } })
  worksheet.getCell('A1').alignment = { vertical: 'middle' }

  worksheet.getCell('A3').value = 'Empresa'
  worksheet.getCell('A3').font = withCalibri({ bold: true })
  worksheet.getCell('B3').dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`$H$2:$H$${remitos.length + 1}`]
  }
  worksheet.getCell('B3').value = remitos[0] ? getIndexCompanyLabel(remitos[0]) : ''
  worksheet.getCell('C3').value = {
    formula: `HYPERLINK("#'"&VLOOKUP(B3,$H$2:$I$${remitos.length + 1},2,FALSE)&"'!A1","Ir a la nota")`,
    result: 'Ir a la nota'
  }
  worksheet.getCell('C3').font = withCalibri({ color: { argb: 'FF2563EB' }, underline: true, bold: true })

  const headerRow = worksheet.getRow(5)
  ;['Empresa', 'Número de nota', 'Fecha', 'Cantidad total', 'Enlace directo'].forEach((header, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = header
    cell.font = withCalibri({ bold: true, color: { argb: 'FFFFFFFF' } })
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER
  })

  remitos.forEach((remito, index) => {
    const rowNumber = index + 6
    const row = worksheet.getRow(rowNumber)
    row.getCell(1).value = remito.companyDisplayName
    row.getCell(2).value = remito.remitoNumber
    row.getCell(3).value = formatDateOnly(remito.deliveryDate)
    row.getCell(4).value = remito.totalItems
    row.getCell(5).value = {
      text: 'Ir a la nota',
      hyperlink: `#'${remito.sheetName}'!A1`
    }
    row.getCell(5).font = withCalibri({ color: { argb: 'FF2563EB' }, underline: true })
    row.eachCell((cell) => {
      cell.border = BORDER
      cell.alignment = { vertical: 'middle', wrapText: true }
    })

    worksheet.getCell(`H${index + 2}`).value = getIndexCompanyLabel(remito)
    worksheet.getCell(`I${index + 2}`).value = remito.sheetName
  })

  worksheet.getColumn(8).width = 9
  worksheet.getColumn(9).width = 9
  worksheet.getColumn(8).hidden = true
  worksheet.getColumn(9).hidden = true
  configureIndexPrintPage(worksheet, `A1:E${remitos.length + 6}`)
  return worksheet
}

export const buildFileName = (remitos, deliveryDate) => {
  const dateForFile = formatDateForFile(deliveryDate)
  if (remitos.length === 1) {
    const companyPart = sanitizeFileName(slugify(remitos[0].companyName).toUpperCase())
    return `Nota_de_Pedido_${companyPart}_${remitos[0].remitoNumber}_${dateForFile}.xlsx`
  }
  return `Notas_de_Pedido_Empresas_${dateForFile}.xlsx`
}

export const buildRemitoSnapshot = ({
  group,
  remitoNumber = null,
  deliveryDate = getDeliveryDate(group?.orders || []),
  issuedAt = null,
  issuedBy = null,
  status = 'draft'
} = {}) => {
  try {
    const products = summarizeProducts(group?.orders || [])
    const operationalSummary = summarizeRemitoOperationalOrders(group?.orders || [])
    const orderIds = getOrderIds(group?.orders || [])
    return {
    version: 1,
    status,
    companySlug: group?.slug || '',
    companyName: group?.name || group?.slug || '',
    companyDisplayName: group?.displayName || group?.name || group?.slug || 'Empresa',
    locationKey: group?.locationKey || '',
    locationLabel: group?.locationLabel || '',
    remitoNumber,
    deliveryDate,
    serviceDate: deliveryDate,
    issuedAt,
    issuedBy,
    orderIds,
    ordersCount: orderIds.length || (group?.orders || []).length,
    totalItems: operationalSummary.menuTotal,
    totalMenus: operationalSummary.menuTotal,
    menuBreakdown: operationalSummary.menuBreakdown,
    totalBeverages: operationalSummary.beverageTotal,
    beverageBreakdown: operationalSummary.beverageBreakdown,
    totalDesserts: operationalSummary.dessertTotal,
    dessertBreakdown: operationalSummary.dessertBreakdown,
    products,
    sourceOrders: (group?.orders || []).map((order) => ({
      id: order?.id || null,
      status: order?.status || null,
      delivery_date: order?.delivery_date || null,
      service: order?.service || null,
      order_origin: order?.order_origin || null,
      created_by_admin_id: order?.created_by_admin_id || null,
      created_by_admin_name: order?.created_by_admin_name || null,
      created_by_admin_email: order?.created_by_admin_email || null,
      total_items: order?.total_items ?? null,
      items: order?.items || [],
      custom_responses: order?.custom_responses || [],
      location: order?.location || null,
      delivery_location: order?.delivery_location || null,
      requesting_location_code: order?.requesting_location_code || null,
      requesting_location: order?.requesting_location || null,
      requesting_location_name: order?.requesting_location_name || null,
      order_location_id: order?.order_location_id || null,
      delivery_order_location_id: order?.delivery_order_location_id || null,
      order_location: order?.order_location || null,
      location_snapshot: order?.location_snapshot || null,
      company_slug: order?.company_slug || null,
      company_name: order?.company_name || null,
      organization: order?.organization || null,
      comments: order?.comments || null
    }))
    }
  } catch (error) {
    console.error(`${REMITO_DEBUG_PREFIX} Error construyendo snapshot de remito`, {
      error,
      groupSlug: group?.slug,
      groupName: group?.name,
      groupDisplayName: group?.displayName,
      remitoNumber,
      deliveryDate,
      status,
      ordersCount: Array.isArray(group?.orders) ? group.orders.length : null,
      orderIds: getOrderIds(group?.orders || []),
      group
    })
    throw error
  }
}

export const remitoFromSnapshot = (snapshot = {}, fallback = {}) => {
  const rawNumber = snapshot.remitoNumber ?? fallback.remito_number ?? fallback.remitoNumber
  const remitoNumber = Number(rawNumber)
  const products = Array.isArray(snapshot.products) ? snapshot.products : []
  const totalMenus = Number(snapshot.totalMenus ?? snapshot.totalItems ?? getRemitoMenuTotalFromRows(products) ?? 0)
  const beverageBreakdown = Array.isArray(snapshot.beverageBreakdown) ? snapshot.beverageBreakdown : []
  const dessertBreakdown = Array.isArray(snapshot.dessertBreakdown) ? snapshot.dessertBreakdown : []
  return {
    companySlug: snapshot.companySlug || fallback.company_slug || fallback.companySlug || '',
    companyName: snapshot.companyName || fallback.company_name || fallback.companyName || '',
    companyDisplayName: snapshot.companyDisplayName || snapshot.companyName || fallback.company_name || fallback.companyName || 'Empresa',
    locationKey: snapshot.locationKey || fallback.location_key || fallback.locationKey || '',
    locationLabel: snapshot.locationLabel || fallback.location_label || fallback.locationLabel || '',
    remitoNumber: Number.isFinite(remitoNumber) ? remitoNumber : (rawNumber || 'SIN EMITIR'),
    deliveryDate: snapshot.deliveryDate || snapshot.serviceDate || fallback.delivery_date || fallback.deliveryDate || '',
    totalItems: Number.isFinite(totalMenus) ? totalMenus : 0,
    totalMenus: Number.isFinite(totalMenus) ? totalMenus : 0,
    menuBreakdown: Array.isArray(snapshot.menuBreakdown) ? snapshot.menuBreakdown : [],
    totalBeverages: Number(snapshot.totalBeverages ?? beverageBreakdown.reduce((sum, row) => sum + Number(row?.quantity || 0), 0) ?? 0),
    beverageBreakdown,
    totalDesserts: Number(snapshot.totalDesserts ?? dessertBreakdown.reduce((sum, row) => sum + Number(row?.quantity || 0), 0) ?? 0),
    dessertBreakdown,
    products,
    reused: Boolean(fallback.reused)
  }
}

export const buildRemitoWorkbook = async (remitos = []) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ServiFood'
  workbook.created = new Date()
  const usedSheetNames = new Set(['índice'])
  const printableRemitos = remitos.map((remito) => ({
    ...remito,
    sheetName: remito.sheetName || buildUniqueSheetName(`${remito.companyDisplayName || remito.companyName} ${remito.remitoNumber || 'sin emitir'}`, usedSheetNames)
  }))

  addIndexSheet(workbook, printableRemitos)
  for (const remito of printableRemitos) {
    await addRemitoSheet(workbook, remito, remito.sheetName)
  }
  if (printableRemitos.length === 1) {
    workbook.views = [{ activeTab: 1 }]
  }
  return { workbook, remitos: printableRemitos }
}

export const downloadRemitoWorkbook = async (remitos = [], deliveryDate = getDeliveryDate([])) => {
  const { workbook, remitos: printableRemitos } = await buildRemitoWorkbook(remitos)
  const fileName = buildFileName(printableRemitos, deliveryDate)
  await downloadWorkbook(workbook, fileName)
  return { fileName, remitos: printableRemitos }
}

export async function exportDailyOrderNotesExcel({
  sortedOrders,
  exportCompany,
  selectedStatus: _selectedStatus
}) {
  const filteredOrders = filterOrdersByCompany(sortedOrders, exportCompany)

  const ordersById = new Map()
  const ordersWithoutId = []
  let duplicateCount = 0

  filteredOrders.forEach((order) => {
    if (!order || !order.id) {
      ordersWithoutId.push(order)
      return
    }

    if (ordersById.has(order.id)) {
      duplicateCount += 1
      return
    }

    ordersById.set(order.id, order)
  })

  const ordersToExport = [...ordersById.values(), ...ordersWithoutId]

  if (ordersToExport.length === 0) {
    notifyInfo('No hay pedidos para exportar')
    return
  }

  try {
    const deliveryDate = getDeliveryDate(ordersToExport)
    const groups = buildCompanyGroups(ordersToExport)
    if (groups.length === 0) {
      notifyInfo('No hay empresas con notas de pedido para generar. Administración ServiFood no genera notas de pedido.')
      return
    }
    const configResult = await db.getCompaniesRemitoConfig()
    if (configResult.error) {
      notifyError(getUserFriendlyErrorMessage(configResult.error, 'No pudimos cargar la configuración de numeración de notas de pedido.'))
      return
    }
    const configBySlug = buildRemitoConfigBySlug(configResult.data || [])
    const usedSheetNames = new Set(['índice'])
    const remitos = []

    for (const group of groups) {
      if (!isValidRemitoNumberingConfig(configBySlug.get(group.slug))) {
        notifyError(`La empresa ${group.displayName || group.name} no tiene configurada la numeración completa de notas de pedido.`)
        return
      }
      const draftSnapshot = buildRemitoSnapshot({ group, deliveryDate, status: 'draft' })
      const locationKey = group.locationKey || ''
      const requestId = `daily-remito:${group.slug}:${deliveryDate}:${locationKey || 'all'}:${getOrderIds(group.orders).sort().join(',')}`
      const { data, error } = await db.issueCompanyRemito({
        companySlug: group.slug,
        companyName: group.name,
        deliveryDate,
        orderIds: getOrderIds(group.orders),
        requestId,
        snapshot: draftSnapshot,
        locationKey
      })

      if (error) {
        console.error('Error al emitir nota de pedido:', error)
        notifyError(getUserFriendlyErrorMessage(
          error,
          getRemitoIssueFallbackMessage(group.displayName, error)
        ))
        return
      }

      const issuedSlug = data?.company_slug || group.slug
      const issuedName = data?.company_name || group.name
      const issuedNumber = Number(data?.remito_number)
      if (!isRemitoNumberInCompanyRange(issuedSlug, issuedNumber, configBySlug)) {
        notifyError(`La nota de pedido para ${group.displayName} recibió un número fuera del rango de su empresa.`)
        return
      }

      const products = summarizeProducts(group.orders)
      const sheetName = buildUniqueSheetName(`${group.displayName || issuedName} ${issuedNumber}`, usedSheetNames)
      remitos.push({
        companySlug: issuedSlug,
        companyName: issuedName,
        companyDisplayName: group.displayName,
        locationKey,
        locationLabel: group.locationLabel || '',
        remitoNumber: issuedNumber,
        deliveryDate,
        totalItems: getRemitoMenuTotalFromRows(products),
        products,
        sheetName,
        reused: !!data.reused
      })
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ServiFood'
    workbook.created = new Date()

    addIndexSheet(workbook, remitos)
    for (const remito of remitos) {
      await addRemitoSheet(workbook, remito, remito.sheetName)
    }
    if (remitos.length === 1) {
      workbook.views = [{ activeTab: 1 }]
    }

    const fileName = buildFileName(remitos, deliveryDate)
    await downloadWorkbook(workbook, fileName)

    const duplicateText = duplicateCount > 0 ? ` Se omitieron ${duplicateCount} duplicados.` : ''
    const reusedText = remitos.some((remito) => remito.reused)
      ? ' Se reutilizó la numeración ya emitida cuando correspondía.'
      : ''
    notifySuccess(`✓ ${ordersToExport.length} pedidos exportados a ${fileName}.${duplicateText}${reusedText}`)
  } catch (error) {
    console.error('Error al exportar:', error)
    notifyError(getUserFriendlyErrorMessage(error, 'Error al exportar el archivo. Por favor, inténtalo de nuevo.'))
  }
}
