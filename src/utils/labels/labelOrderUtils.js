import { ALL_COMPANY_LIST, getCompanyByLocationOrSlug } from '../../constants/companyConfig'
import {
  buildOrderPreview,
  getOrderBeverageLabels
} from '../daily/dailyOrderCalculations'
import { getStatusText } from '../daily/dailyOrderFormatters'
import { getAdminExtraOrderLabel } from '../daily/adminExtraOrders'
import { normalizeOrderForReadOnly } from '../order/normalizeOrderForReadOnly'

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const asArray = (value) => Array.isArray(value) ? value : []

const firstNonBlank = (...values) =>
  values.map(value => String(value || '').trim()).find(Boolean) || ''

const normalizeFruitDessertChoice = (value) => {
  const text = formatResponseValue(value)
  const normalized = normalizeText(text)
  if (!normalized) return ''
  if (normalized.includes('postre')) return 'Postre'
  if (normalized.includes('fruta')) return 'Fruta'
  return ''
}

const isFruitDessertResponse = (response = {}) => {
  const text = normalizeText([
    response.title,
    response.question,
    response.label,
    response.key,
    response.id,
    response.option_id,
    response.section,
    response.type
  ].join(' '))

  return text.includes('fruta_postre') || (text.includes('fruta') && text.includes('postre'))
}

export const getCompanyLocationsForAccess = (companies = []) => {
  const locations = new Set()
  asArray(companies).forEach((company) => {
    const configured = getCompanyByLocationOrSlug(company?.slug || company?.name || '')
    if (configured?.locations?.length) {
      configured.locations.forEach((location) => locations.add(location))
      return
    }
    if (company?.name) locations.add(company.name)
    if (company?.slug) locations.add(company.slug)
  })
  return [...locations]
}

export const getCompanyOptionsForLabels = ({ isAdmin = false, adminCompanies = [] } = {}) => {
  if (isAdmin) return ALL_COMPANY_LIST.filter(company => !company.adminOnly)
  const allowedSlugs = new Set(asArray(adminCompanies).map(company => company?.slug).filter(Boolean))
  return ALL_COMPANY_LIST.filter(company => allowedSlugs.has(company.slug))
}

export const getOrderCustomerName = (order = {}) =>
  firstNonBlank(
    order.customer_name,
    order.name,
    order.user_name,
    order.user_full_name,
    order.full_name,
    order.customer_email,
    order.user_email,
    'Cliente sin nombre'
  )

export const getOrderCustomerEmail = (order = {}) =>
  firstNonBlank(order.customer_email, order.email, order.user_email)

const getOrderOriginLocation = (order = {}) => firstNonBlank(
  order.location,
  order.requesting_location,
  order.requesting_location_name,
  order.requesting_location_code,
  order.order_location?.display_name,
  order.order_location?.name,
  order.location_snapshot?.display_name,
  order.location_snapshot?.name,
  order.location_snapshot?.code
)

const getEpseLocationLabel = (location = '') => {
  const normalized = normalizeText(location)
  if (!normalized) return ''
  if (normalized.includes('planta fotovoltaica') || normalized.includes('planta fv')) return 'Planta FV'
  if (normalized.includes('estacion transformadora') || normalized.includes('estacion')) return 'Estación'
  if (normalized.includes('obra') || normalized.includes('linea de alta tension')) return 'Obra'
  return String(location).trim().replace(/^EPSE\s*[–-]\s*/i, '')
}

export const getOrderCompanyLabel = (order = {}) => {
  const originLocation = getOrderOriginLocation(order)
  const configured = getCompanyByLocationOrSlug(order.company_slug || order.company || originLocation)
  const companyLabel = order.company_name || configured?.name || order.company || originLocation || 'Sin empresa'
  if (configured?.slug !== 'epse' && String(order.company_slug || '').trim().toLowerCase() !== 'epse') return companyLabel
  const epseLocation = getEpseLocationLabel(originLocation)
  return epseLocation ? `EPSE – ${epseLocation}` : 'EPSE'
}

export const getOrderDeliveryLocation = (order = {}) =>
  order.delivery_location || order.location || ''

export const getShortOrderCode = (order = {}) => {
  const raw = String(order.id || order.order_number || '')
  if (!raw) return 'Sin código'
  if (/^[0-9]+$/.test(raw)) return `#${raw}`
  return `#${raw.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

const formatResponseValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  if (value === true) return 'Sí'
  if (value === false) return 'No'
  return String(value || '').trim()
}

export const getRelevantResponses = (order = {}) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  return asArray(normalizedCustomResponses)
    .map((response) => {
      const title = String(response?.title || response?.question || response?.label || '').trim()
      const value = formatResponseValue(response?.response ?? response?.answer ?? response?.value)
      if (!title && !value) return null
      return {
        title: title || 'Opción',
        value
      }
    })
    .filter(item => item && item.value)
}

export const getFruitDessertChoice = (order = {}) => {
  const directChoice = normalizeFruitDessertChoice(
    order.fruitDessertChoice ||
    order.fruit_dessert_choice ||
    order.fruta_postre ||
    order.fruta_o_postre
  )
  if (directChoice) return directChoice

  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const fruitDessertResponse = asArray(normalizedCustomResponses).find(isFruitDessertResponse)

  return normalizeFruitDessertChoice(
    fruitDessertResponse?.response ??
    fruitDessertResponse?.answer ??
    fruitDessertResponse?.value
  )
}

export const hasImportantNotes = (order = {}) => {
  const raw = [
    order.notes,
    order.comments,
    order.observations,
    order.observaciones,
    order.dietary_notes,
    order.food_restrictions
  ].filter(Boolean).join(' ')
  const responses = getRelevantResponses(order).map(item => `${item.title} ${item.value}`).join(' ')
  const text = normalizeText(`${raw} ${responses}`)
  return Boolean(text) && [
    'observ',
    'alerg',
    'celiac',
    'sin tacc',
    'vegetar',
    'vegano',
    'diabet',
    'hipert',
    'intoler',
    'restric',
    'sin sal',
    'sin azucar'
  ].some(keyword => text.includes(keyword))
}

export const getOrderNotesText = (order = {}) =>
  [
    order.notes,
    order.comments,
    order.observations,
    order.observaciones,
    order.dietary_notes,
    order.food_restrictions
  ].map(value => String(value || '').trim()).filter(Boolean).join(' | ')

export const buildLabelOrder = (order = {}) => {
  const normalized = normalizeOrderForReadOnly(order)
  const preview = buildOrderPreview(order)
  const companySlug = String(order.company_slug || '').trim().toLowerCase()
  const beverages = companySlug === 'epse' ? [] : getOrderBeverageLabels(order)
  const responses = getRelevantResponses(order)
  const fruitDessertChoice = getFruitDessertChoice(order)
  const notes = getOrderNotesText(order)
  const totalItems = Number(order.total_items || 0) ||
    asArray(normalized.normalizedItems).reduce((sum, item) => sum + (Number(item?.quantity || item?.qty || 1) || 1), 0)

  return {
    ...order,
    customerName: getOrderCustomerName(order),
    customerEmail: getOrderCustomerEmail(order),
    companyLabel: getOrderCompanyLabel(order),
    deliveryLocation: getOrderDeliveryLocation(order),
    serviceLabel: String(order.service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo',
    originLabel: getAdminExtraOrderLabel(order),
    statusLabel: getStatusText(order.status),
    shortCode: getShortOrderCode(order),
    itemsText: preview.itemsText,
    optionsText: preview.optionsText,
    beverages,
    fruitDessertChoice,
    responses,
    notes,
    totalItems,
    hasImportantNotes: hasImportantNotes(order)
  }
}

export const orderMatchesLabelFilters = (order = {}, filters = {}) => {
  const labelOrder = buildLabelOrder(order)
  const haystack = normalizeText([
    labelOrder.customerName,
    labelOrder.customerEmail,
    labelOrder.companyLabel,
    labelOrder.deliveryLocation,
    labelOrder.itemsText,
    labelOrder.optionsText,
    labelOrder.notes,
    labelOrder.statusLabel,
    labelOrder.serviceLabel,
    ...labelOrder.responses.map(response => `${response.title} ${response.value}`)
  ].join(' '))

  if (filters.search && !normalizeText(labelOrder.customerName).includes(normalizeText(filters.search))) return false
  if (filters.email && !normalizeText(labelOrder.customerEmail).includes(normalizeText(filters.email))) return false
  if (filters.location && !haystack.includes(normalizeText(filters.location))) return false
  if (filters.itemText && !normalizeText(`${labelOrder.itemsText} ${labelOrder.optionsText}`).includes(normalizeText(filters.itemText))) return false
  if (filters.beverage === 'with' && labelOrder.beverages.length === 0) return false
  if (filters.beverage === 'without' && labelOrder.beverages.length > 0) return false
  if (filters.hasNotes === 'with' && !labelOrder.hasImportantNotes && !labelOrder.notes && labelOrder.responses.length === 0) return false
  if (filters.hasNotes === 'without' && (labelOrder.hasImportantNotes || labelOrder.notes || labelOrder.responses.length > 0)) return false

  return true
}
