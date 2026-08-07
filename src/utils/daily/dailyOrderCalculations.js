import { BEVERAGE_KEYWORDS, DINNER_OVERRIDE_KEYWORDS } from './dailyOrderConstants'
import { normalizeDishName } from './dailyOrderFormatters'
import { getSideSummaryForOrder } from './dailyOrderSideAssociations'
import { normalizeOrderForReadOnly } from '../order/normalizeOrderForReadOnly'
import { isAdminExtraOrder } from './adminExtraOrders'

const UNSPECIFIED_BEVERAGE_LABEL = 'Bebida sin especificar'
const GENNEIA_DINNER_BEVERAGE_FIX_DATE = '2026-08-03'

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const isGenneiaDinnerOrder = (order = {}) =>
  String(order?.service || 'lunch').toLowerCase() === 'dinner' &&
  normalizeText(order?.location || order?.company || order?.company_name || '').includes('genneia')

const isLegacyOrderBeforeBeverageFix = (order = {}) => {
  const createdDate = String(order?.created_at || '').slice(0, 10)
  if (createdDate) return createdDate < GENNEIA_DINNER_BEVERAGE_FIX_DATE
  const deliveryDate = String(order?.delivery_date || '').slice(0, 10)
  return Boolean(deliveryDate && deliveryDate < GENNEIA_DINNER_BEVERAGE_FIX_DATE)
}

const isLegacyGenneiaDinnerOrder = (order = {}) =>
  isGenneiaDinnerOrder(order) && isLegacyOrderBeforeBeverageFix(order)

const getNormalizedOrderItemTotal = (order = {}) => {
  const { normalizedItems } = normalizeOrderForReadOnly(order)
  if (Array.isArray(normalizedItems)) {
    return normalizedItems.reduce((sum, item) => sum + (Number(item?.quantity || item?.qty || 1) || 1), 0)
  }
  return 0
}

export const getOperationalOrderUnits = (order = {}) => {
  if (!isAdminExtraOrder(order)) return 1
  const stored = Number(order?.total_items)
  if (Number.isFinite(stored) && stored > 0) return stored
  const itemTotal = getNormalizedOrderItemTotal(order)
  return itemTotal > 0 ? itemTotal : 1
}

export const getCustomSideFromResponses = (responses = []) => {
  if (!Array.isArray(responses) || responses.length === 0) return null
  for (const r of responses) {
    if (String(r?.title || '').toLowerCase().includes('guarn')) {
      return r?.answer ?? r?.response ?? null
    }
  }
  return null
}

export const matchesDinnerOverrideKeyword = (val = '') => {
  const t = (val || '').toString().toLowerCase()
  return DINNER_OVERRIDE_KEYWORDS.some(k => t.includes(k))
}

export const isDinnerOverrideResponse = (resp = {}) => {
  const val = resp?.response ?? resp?.answer ?? null
  if (Array.isArray(val)) return val.some(v => matchesDinnerOverrideKeyword(v))
  return matchesDinnerOverrideKeyword(val)
}

export const getDinnerOverrideSelection = (order) => {
  if (!order || (order.service || 'lunch') !== 'dinner') return null

  const { normalizedItems, normalizedCustomResponses } = normalizeOrderForReadOnly(order)

  if (Array.isArray(normalizedItems)) {
    const overrideItem = normalizedItems.find(it => it?.id === 'dinner-override' || matchesDinnerOverrideKeyword(it?.name))
    if (overrideItem?.name) return overrideItem.name.replace(/^cena:\s*/i, '').trim() || overrideItem.name
  }

  if (Array.isArray(normalizedCustomResponses)) {
    for (const resp of normalizedCustomResponses) {
      if (isDinnerOverrideResponse(resp)) {
        const val = resp?.response ?? resp?.answer
        if (Array.isArray(val)) {
          const match = val.find(v => matchesDinnerOverrideKeyword(v))
          if (match) return match
        }
        return val || null
      }
    }
  }

  return null
}

export const getOtherCustomResponses = (customResponses) => {
  if (!customResponses || !Array.isArray(customResponses)) return []

  return customResponses.filter(r =>
    r.response &&
    !r.title?.toLowerCase().includes('guarnición') &&
    !r.title?.toLowerCase().includes('guarnicion') &&
    !isDinnerOverrideResponse(r)
  )
}

const expandQuantifiedResponseValues = (resp = {}) => {
  if (resp?.quantities && typeof resp.quantities === 'object') {
    return Object.entries(resp.quantities).flatMap(([label, quantity]) => {
      const count = Number(quantity) || 0
      return count > 0 ? Array.from({ length: count }, () => String(label || '').trim()).filter(Boolean) : []
    })
  }
  const value = resp?.response ?? resp?.answer ?? resp?.value
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  const text = String(value || '').trim()
  return text ? [text] : []
}

export const isBeverage = (text = '') => {
  const t = Array.isArray(text)
    ? text.map(item => String(item || '')).join(' ')
    : String(text || '')
  const normalized = t.toLowerCase()
  return BEVERAGE_KEYWORDS.some(k => normalized.includes(k))
}

export const getBeverageLabel = (customResponses) => {
  if (!Array.isArray(customResponses)) return '—'
  const names = []
  customResponses.forEach(resp => {
    if (resp?.quantities && typeof resp.quantities === 'object') {
      Object.entries(resp.quantities).forEach(([label, quantity]) => {
        if (!isBeverage(label)) return
        const count = Number(quantity) || 0
        if (count > 0) names.push(`${label}${count > 1 ? ` (x${count})` : ''}`)
      })
    }
    if (Array.isArray(resp?.response)) {
      resp.response.forEach(value => { if (isBeverage(value)) names.push(value) })
    } else if (isBeverage(resp?.response)) {
      names.push(resp.response)
    }
    if (Array.isArray(resp?.options)) {
      resp.options.forEach(opt => { if (isBeverage(opt)) names.push(opt) })
    }
  })
  if (names.length === 0) return '—'
  const unique = [...new Set(names.map(n => (n || '').trim()))].filter(Boolean)
  const joined = unique.slice(0, 3).join(', ')
  return unique.length > 3 ? `${joined} (+${unique.length - 3})` : joined || '—'
}

export const getOrderBeverageLabels = (order = {}) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  const customResponses = Array.isArray(normalizedCustomResponses) ? normalizedCustomResponses : []
  const labels = []
  customResponses.forEach(resp => {
    const pushBeverage = (value) => {
      if (!value) return
      const label = String(value).trim()
      if (!label || !isBeverage(label)) return
      labels.push(label)
    }
    expandQuantifiedResponseValues(resp).forEach(pushBeverage)
    if (Array.isArray(resp?.options)) {
      resp.options.forEach(pushBeverage)
    }
  })
  if (labels.length === 0 && isLegacyGenneiaDinnerOrder(order)) return [UNSPECIFIED_BEVERAGE_LABEL]
  return labels
}

export const summarizeOrderItems = (items = []) => {
  if (!Array.isArray(items)) return { principalCount: 0, others: [], remaining: 0, title: '' }
  const principal = items.filter(
    item => item && item.name && item.name.toLowerCase().includes('menú principal')
  )
  const others = items
    .filter(item => item && item.name && !item.name.toLowerCase().includes('menú principal'))
    .map(item => ({ name: normalizeDishName(item.name), qty: item.quantity || 1 }))

  const principalCount = principal.reduce((sum, item) => sum + (item.quantity || 1), 0)
  const displayedOthers = others.slice(0, 3)
  const remaining = Math.max(others.length - displayedOthers.length, 0)

  const titleParts = []
  if (principalCount > 0) titleParts.push(`Plato Principal: ${principalCount}`)
  titleParts.push(...others.map(o => `${o.name} (x${o.qty})`))

  return {
    principalCount,
    others: displayedOthers,
    remaining,
    title: titleParts.join('; ')
  }
}

export const buildOrderPreview = (order) => {
  const items = []
  const { normalizedItems, normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  if (Array.isArray(normalizedItems)) {
    const principal = normalizedItems.filter(
      item => item && item.name && item.name.toLowerCase().includes('menú principal')
    )
    const others = normalizedItems.filter(
      item => item && item.name && !item.name.toLowerCase().includes('menú principal')
    )
    if (principal.length > 0) {
      const totalPrincipal = principal.reduce((sum, i) => sum + (i.quantity || 1), 0)
      items.push(`Plato Principal: ${totalPrincipal}`)
    }
    others.forEach(i => items.push(`${normalizeDishName(i.name)} (x${i.quantity || 1})`))
  }

  const customSide = getSideSummaryForOrder(order).summaryText ||
    getCustomSideFromResponses(normalizedCustomResponses || [])
  if (customSide) items.push(`Guarnición: ${customSide}`)

  const otherResponses = getOtherCustomResponses(normalizedCustomResponses || [])
  const customStrings = otherResponses.map(r => {
    const response = Array.isArray(r.response) ? r.response.join(', ') : r.response
    return `${r.title}: ${response}`
  })

  return {
    itemsText: items.length ? items.join(' | ') : 'Sin items',
    optionsText: customStrings.length ? customStrings.join(' | ') : 'Sin opciones adicionales'
  }
}

export const filterOrdersByCompany = (ordersList, company) => {
  if (company === 'all') return ordersList
  const target = (company || '').toLowerCase()
  return (ordersList || []).filter(order => {
    const loc = (order?.location || '').toLowerCase()
    const comp = (order?.company || order?.company_slug || order?.target_company || '').toLowerCase()
    return loc === target || comp === target
  })
}

export const buildTurnSummary = (ordersList = []) => {
  const turnCounts = {
    lunch: { orders: 0, items: 0 },
    dinner: { orders: 0, items: 0 }
  }
  const byLocationTurn = {}

  ;(ordersList || []).forEach((order) => {
    if (!order) return
    const turn = (order.service || 'lunch') === 'dinner' ? 'dinner' : 'lunch'
    const itemsQty = getNormalizedOrderItemTotal(order)
    const loc = order.location || 'Sin ubicación'

    const units = getOperationalOrderUnits(order)
    turnCounts[turn].orders += units
    turnCounts[turn].items += itemsQty

    if (!byLocationTurn[loc]) byLocationTurn[loc] = { lunch: 0, dinner: 0, total: 0 }
    byLocationTurn[loc][turn] += units
    byLocationTurn[loc].total += units
  })

  return { turnCounts, byLocationTurn }
}

export const buildOperationalSummary = (ordersList = []) => {
  const dishCounts = {}
  const sideCounts = {}
  const beverageCounts = {}

  ;(ordersList || []).forEach(order => {
    if (!order) return
    const { normalizedItems } = normalizeOrderForReadOnly(order)

    if (Array.isArray(normalizedItems)) {
      normalizedItems.forEach(item => {
        if (!item?.name) return
        const normalizedName = normalizeDishName(item.name)
        dishCounts[normalizedName] = (dishCounts[normalizedName] || 0) + (item.quantity || 1)
      })
    }

    const sideSummary = getSideSummaryForOrder(order)
    sideSummary.associations.forEach((association) => {
      const side = association.displayLabel
      sideCounts[side] = (sideCounts[side] || 0) + 1
    })

    getOrderBeverageLabels(order).forEach(label => {
      beverageCounts[label] = (beverageCounts[label] || 0) + 1
    })
  })

  const sortCounts = (counts) =>
    Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))

  return {
    dishes: sortCounts(dishCounts),
    sides: sortCounts(sideCounts),
    beverages: sortCounts(beverageCounts)
  }
}

export const buildLocationCards = (ordersList = []) => {
  const byLocation = {}

  ;(ordersList || []).forEach(order => {
    if (!order) return
    const { normalizedItems } = normalizeOrderForReadOnly(order)
    const loc = order.location || 'Sin ubicación'
    if (!byLocation[loc]) {
      byLocation[loc] = { total: 0, dishCounts: {}, sideCounts: {} }
    }
    byLocation[loc].total += getOperationalOrderUnits(order)

    if (Array.isArray(normalizedItems)) {
      normalizedItems.forEach(item => {
        if (!item?.name) return
        const normalizedName = normalizeDishName(item.name)
        byLocation[loc].dishCounts[normalizedName] =
          (byLocation[loc].dishCounts[normalizedName] || 0) + (item.quantity || 1)
      })
    }

    const sideSummary = getSideSummaryForOrder(order)
    sideSummary.associations.forEach((association) => {
      const side = association.displayLabel
      byLocation[loc].sideCounts[side] = (byLocation[loc].sideCounts[side] || 0) + 1
    })
  })

  return Object.entries(byLocation)
    .filter(([, data]) => data.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([location, data]) => {
      const topDishes = Object.entries(data.dishCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
      const topSides = Object.entries(data.sideCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
      return { location, total: data.total, topDishes, topSides }
    })
}

export const buildPrintStats = (ordersList = []) => {
  const sideCounts = {}
  const optionCounts = {}
  const turnCounts = {
    lunch: { orders: 0, items: 0 },
    dinner: { orders: 0, items: 0 }
  }
  const byLocationTurn = {}

  ;(ordersList || []).forEach(order => {
    if (!order) return
    const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
    const customResponses = Array.isArray(normalizedCustomResponses) ? normalizedCustomResponses : []
    const turn = (order.service || 'lunch') === 'dinner' ? 'dinner' : 'lunch'
    const itemsQty = getNormalizedOrderItemTotal(order)

    const units = getOperationalOrderUnits(order)
    turnCounts[turn].orders += units
    turnCounts[turn].items += itemsQty

    const loc = order.location || 'Sin ubicación'
    if (!byLocationTurn[loc]) {
      byLocationTurn[loc] = { lunch: 0, dinner: 0, total: 0 }
    }
    byLocationTurn[loc][turn] += units
    byLocationTurn[loc].total += units

    const sideSummary = getSideSummaryForOrder(order)
    sideSummary.associations.forEach((association) => {
      const side = association.displayLabel
      sideCounts[side] = (sideCounts[side] || 0) + 1
    })

    getOtherCustomResponses(customResponses).forEach(r => {
      const values = expandQuantifiedResponseValues(r)
      if (values.length === 0) {
        const key = `${r.title}: —`
        optionCounts[key] = (optionCounts[key] || 0) + 1
        return
      }
      values.forEach((response) => {
        const key = `${r.title}: ${response || '—'}`
        optionCounts[key] = (optionCounts[key] || 0) + 1
      })
    })
  })

  return { sideCounts, optionCounts, turnCounts, byLocationTurn }
}

export const calculateStats = (ordersData = []) => {
  const byLocation = {}
  const byDish = {}
  let totalItems = 0
  let archived = 0
  let pending = 0

  Array.isArray(ordersData) && ordersData.forEach(order => {
    const { normalizedItems } = normalizeOrderForReadOnly(order || {})
    const units = getOperationalOrderUnits(order)
    const location = order.location || 'Sin ubicación'
    if (!byLocation[location]) {
      byLocation[location] = 0
    }
    byLocation[location] += units

    if (Array.isArray(normalizedItems)) {
      normalizedItems.forEach(item => {
        if (item?.name) {
          const normalizedName = normalizeDishName(item.name)
          if (!byDish[normalizedName]) {
            byDish[normalizedName] = 0
          }
          byDish[normalizedName] += item.quantity || 1
        }
      })
    }

    totalItems += getNormalizedOrderItemTotal(order)

    if (order.status === 'archived') {
      archived += units
    } else if (order.status === 'pending') {
      pending += units
    }
  })

  return {
    total: Array.isArray(ordersData)
      ? ordersData.reduce((sum, order) => sum + getOperationalOrderUnits(order), 0)
      : 0,
    byLocation,
    byDish,
    totalItems,
    archived,
    pending
  }
}

export const downloadWorkbook = async (workbook, fileName) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1200)
}
