import { normalizeOrderForReadOnly } from './normalizeOrderForReadOnly'

export const DEFAULT_BEVERAGE_LABEL = 'Agua sin gas'
export const DEFAULT_DESSERT_LABEL = 'Fruta'

const normalizeText = (value = '') =>
  String(value ?? '')
    .trim()

export const normalizeOperationalLabel = (value = '') =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

const safePositiveNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

const toArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

export const getRawOrderItems = (order = {}) => toArray(order?.items)

export const getItemOperationalQuantity = (item = {}) => {
  const quantity = safePositiveNumber(item?.quantity ?? item?.qty ?? item?.count)
  return quantity || 1
}

const getItemLabel = (item = {}) => {
  const name = normalizeText(item?.name || item?.title || item?.menu || item?.label)
  const option = normalizeText(item?.option || item?.selected_option || item?.choice)
  return [name, option].filter(Boolean).join(' - ') || 'Sin menú / opción'
}

const isNonMenuItemLabel = (label = '') => isBeverageLabel(label) || isDessertLabel(label)

export const getFallbackItemQuantityTotal = (order = {}) =>
  getRawOrderItems(order).reduce((sum, item) => {
    const label = getItemLabel(item)
    return isNonMenuItemLabel(label) ? sum : sum + getItemOperationalQuantity(item)
  }, 0)

export const getOrderMenuTotal = (order = {}) => {
  const storedTotal = safePositiveNumber(order?.total_items)
  if (storedTotal) return storedTotal
  return getFallbackItemQuantityTotal(order)
}

const incrementMap = (map, label, quantity) => {
  const cleanLabel = normalizeText(label)
  const cleanQuantity = safePositiveNumber(quantity)
  if (!cleanLabel || !cleanQuantity) return
  const key = normalizeOperationalLabel(cleanLabel)
  const current = map.get(key) || { label: cleanLabel, quantity: 0 }
  current.quantity += cleanQuantity
  map.set(key, current)
}

export const getOrderMenuBreakdown = (order = {}) => {
  const menuRows = new Map()
  getRawOrderItems(order).forEach((item) => {
    const label = getItemLabel(item)
    if (isNonMenuItemLabel(label)) return
    incrementMap(menuRows, label, getItemOperationalQuantity(item))
  })
  return [...menuRows.values()]
}

const titleMatches = (response = {}, keywords = []) => {
  const title = normalizeOperationalLabel(response?.title || response?.label || response?.question || response?.name)
  return keywords.some((keyword) => title.includes(keyword))
}

const isBeverageTitle = (response = {}) => titleMatches(response, ['bebida', 'bebidas'])
const isDessertTitle = (response = {}) => titleMatches(response, ['postre', 'postres', 'fruta'])

export const isBeverageLabel = (value = '') => {
  const label = normalizeOperationalLabel(value)
  const tokens = label.split(' ').filter(Boolean)
  const has = (keyword) => keyword.includes(' ') ? label.includes(keyword) : tokens.includes(keyword)
  return [
    'agua',
    'coca',
    'coca cola',
    'cola',
    'sprite',
    'fanta',
    'soda',
    'jugo',
    'gaseosa',
    'pepsi',
    'seven',
    '7up',
    'seven up',
    'limonada',
    'te',
    'mate',
    'cafe'
  ].some(has)
}

export const isDessertLabel = (value = '') => {
  const label = normalizeOperationalLabel(value)
  const tokens = label.split(' ').filter(Boolean)
  const has = (keyword) => keyword.includes(' ') ? label.includes(keyword) : tokens.includes(keyword)
  return [
    'fruta',
    'frutas',
    'postre',
    'flan',
    'budin',
    'gelatina',
    'mousse',
    'helado',
    'torta',
    'brownie',
    'alfajor'
  ].some(has)
}

const getPrimaryResponseValue = (response = {}) =>
  response?.response ?? response?.answer ?? response?.value

const getLabelFromObject = (value = {}) =>
  value?.label ?? value?.name ?? value?.title ?? value?.value ?? value?.response ?? value?.answer

const parseJsonLikeValue = (value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!['[', '{', '"'].includes(trimmed[0])) return trimmed
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

const flattenResponseValues = (value) => {
  const parsed = parseJsonLikeValue(value)
  if (Array.isArray(parsed)) return parsed.flatMap(flattenResponseValues)
  if (parsed && typeof parsed === 'object') return flattenResponseValues(getLabelFromObject(parsed))
  if (parsed !== value) return flattenResponseValues(parsed)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(',').map(normalizeText).filter(Boolean)
}

const validQuantityEntries = (response = {}) => {
  if (!response?.quantities || typeof response.quantities !== 'object') return []
  return Object.entries(response.quantities)
    .flatMap(([label, quantity]) => flattenResponseValues(label).map((entryLabel) => ({
      label: entryLabel,
      quantity: safePositiveNumber(quantity)
    })))
    .filter((entry) => entry.label && entry.quantity > 0)
}

const getResponseRows = (response = {}, kind, menuTotal) => {
  const isTargetQuestion = kind === 'beverage' ? isBeverageTitle(response) : isDessertTitle(response)
  const isTargetLabel = kind === 'beverage' ? isBeverageLabel : isDessertLabel
  const quantityRows = validQuantityEntries(response)

  if (quantityRows.length) {
    return quantityRows.filter((entry) => isTargetQuestion || isTargetLabel(entry.label))
  }

  const primaryValues = flattenResponseValues(getPrimaryResponseValue(response))
  const optionValues = flattenResponseValues(response?.options)
  const values = primaryValues.length ? primaryValues : optionValues
  if (!values.length) return []

  const counts = new Map()
  values.forEach((value) => {
    if (!isTargetQuestion && !isTargetLabel(value)) return
    incrementMap(counts, value, 1)
  })

  const rows = [...counts.values()]
  if (rows.length === 1 && values.length === 1) {
    return rows.map((row) => ({
      ...row,
      quantity: safePositiveNumber(response?.quantity ?? response?.qty ?? response?.count) || menuTotal || 1
    }))
  }
  return rows
}

export const getOrderResponseBreakdown = (order = {}, kind) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const menuTotal = getOrderMenuTotal(order)
  const totals = new Map()
  const defaultLabel = kind === 'beverage' ? DEFAULT_BEVERAGE_LABEL : DEFAULT_DESSERT_LABEL

  ;(Array.isArray(normalizedCustomResponses) ? normalizedCustomResponses : []).forEach((response) => {
    getResponseRows(response, kind, menuTotal).forEach((row) => {
      incrementMap(totals, row.label, row.quantity)
    })
  })

  const countedTotal = [...totals.values()].reduce((sum, row) => sum + row.quantity, 0)
  const missingTotal = menuTotal - countedTotal
  if (missingTotal > 0) {
    incrementMap(totals, defaultLabel, missingTotal)
  }

  return [...totals.values()]
}

export const getOrderBeverageBreakdown = (order = {}) => getOrderResponseBreakdown(order, 'beverage')
export const getOrderDessertBreakdown = (order = {}) => getOrderResponseBreakdown(order, 'dessert')

export const summarizeOperationalOrder = (order = {}) => ({
  menuTotal: getOrderMenuTotal(order),
  menuBreakdown: getOrderMenuBreakdown(order),
  beverageBreakdown: getOrderBeverageBreakdown(order),
  dessertBreakdown: getOrderDessertBreakdown(order)
})

export const summarizeOperationalOrders = (orders = []) => {
  const menuBreakdown = new Map()
  const beverageBreakdown = new Map()
  const dessertBreakdown = new Map()
  let menuTotal = 0

  ;(orders || []).forEach((order) => {
    const summary = summarizeOperationalOrder(order)
    menuTotal += summary.menuTotal
    summary.menuBreakdown.forEach((row) => incrementMap(menuBreakdown, row.label, row.quantity))
    summary.beverageBreakdown.forEach((row) => incrementMap(beverageBreakdown, row.label, row.quantity))
    summary.dessertBreakdown.forEach((row) => incrementMap(dessertBreakdown, row.label, row.quantity))
  })

  return {
    menuTotal,
    menuBreakdown: [...menuBreakdown.values()],
    beverageTotal: [...beverageBreakdown.values()].reduce((sum, row) => sum + row.quantity, 0),
    beverageBreakdown: [...beverageBreakdown.values()],
    dessertTotal: [...dessertBreakdown.values()].reduce((sum, row) => sum + row.quantity, 0),
    dessertBreakdown: [...dessertBreakdown.values()]
  }
}
