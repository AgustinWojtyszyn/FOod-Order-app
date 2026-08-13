import { supabase } from '../../supabaseClient'
import { COUNTABLE_STATUSES } from '../monthly/monthlyOrderConstants'
import { createSideBuckets, isOptionName } from '../monthly/monthlyOrderCalculations'
import { normalizeLabel, toDisplayString } from '../monthly/monthlyOrderFormatters'
import { normalizeOrderForReadOnly } from '../order/normalizeOrderForReadOnly'
import {
  getOrderBeverageBreakdown,
  getOrderMenuBreakdown,
  isBeverageLabel,
  isDessertLabel
} from '../order/orderOperationalTotals'

const PAGE_SIZE = 1000
export const COMPARISON_MODES = {
  NONE: 'none',
  PREVIOUS_PERIOD: 'previous_period',
  PREVIOUS_YEAR: 'previous_year'
}

const parseISODateParts = (value = '') => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

const toISODate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const dateFromParts = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

const addDays = (value, days) => {
  const parts = parseISODateParts(value)
  if (!parts) return ''
  const date = dateFromParts(parts)
  date.setUTCDate(date.getUTCDate() + days)
  return toISODate(date)
}

const inclusiveDayCount = (start, end) => {
  const startParts = parseISODateParts(start)
  const endParts = parseISODateParts(end)
  if (!startParts || !endParts) return 0
  const startMs = dateFromParts(startParts).getTime()
  const endMs = dateFromParts(endParts).getTime()
  if (endMs < startMs) return 0
  return Math.floor((endMs - startMs) / 86400000) + 1
}

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate()

const shiftOneYearBack = (value) => {
  const parts = parseISODateParts(value)
  if (!parts) return ''
  const year = parts.year - 1
  const day = Math.min(parts.day, daysInMonth(year, parts.month))
  return toISODate(dateFromParts({ year, month: parts.month, day }))
}

export const getComparisonRange = ({ start = '', end = '' } = {}, mode = COMPARISON_MODES.NONE) => {
  if (!start || !end || start > end || mode === COMPARISON_MODES.NONE) return null

  if (mode === COMPARISON_MODES.PREVIOUS_PERIOD) {
    const days = inclusiveDayCount(start, end)
    if (days <= 0) return null
    const previousEnd = addDays(start, -1)
    const previousStart = addDays(previousEnd, -(days - 1))
    return previousStart && previousEnd ? { start: previousStart, end: previousEnd } : null
  }

  if (mode === COMPARISON_MODES.PREVIOUS_YEAR) {
    const previousStart = shiftOneYearBack(start)
    const previousEnd = shiftOneYearBack(end)
    return previousStart && previousEnd ? { start: previousStart, end: previousEnd } : null
  }

  return null
}

export const fetchOrdersByRange = async ({ start, end }) => {
  let from = 0
  let all = []
  while (true) {
    let query = supabase
      .from('orders')
      .select('id,status,delivery_date,created_at,items,custom_responses,location')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (start) query = query.gte('delivery_date', start)
    if (end) query = query.lte('delivery_date', end)

    const { data, error } = await query
    if (error) throw error
    const batch = data || []
    all = all.concat(batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return (all || []).filter(o => COUNTABLE_STATUSES.includes(o.status))
}

const normalizeMenuLabel = (name = '') => {
  const base = toDisplayString(name)
  if (!base) return null
  const normalized = normalizeLabel(base)

  const optionMatch = normalized.match(/opcion\s*0?([1-6])\b/)
  if (optionMatch) return `Opción ${optionMatch[1]}`

  if (isOptionName(base)) {
    const match = base.match(/\d+/)
    return match ? `Opción ${match[0]}` : 'Opción'
  }

  if (normalized.includes('menu principal') || normalized.includes('plato principal')) {
    return 'Plato principal'
  }

  return null
}

export const buildMenuCounts = (orders = []) => {
  const counts = {}
  orders.forEach(order => {
    getOrderMenuBreakdown(order).forEach(item => {
      const label = normalizeMenuLabel(item?.label || '')
      if (!label) return
      const qty = Number(item?.quantity || 1)
      counts[label] = (counts[label] || 0) + qty
    })
  })
  return counts
}

const hasDinnerMenuKeyword = (normalized = '') => {
  if (!normalized) return false
  return (
    normalized.includes('cena') ||
    normalized.includes('menu de cena') ||
    normalized.includes('menu cena') ||
    normalized.includes('opcion cena') ||
    normalized.includes('opcional cena') ||
    normalized.includes('menu principal') ||
    normalized.includes('plato principal')
  )
}

const isMainDishResponse = (value = '', title = '') => {
  const normalized = normalizeLabel(value)
  const normalizedTitle = normalizeLabel(title)
  if (!normalized) return false
  if (hasDinnerMenuKeyword(normalized) || hasDinnerMenuKeyword(normalizedTitle)) return true
  if (normalized.includes('milanesa')) return true
  if (normalized.includes('bife')) return true
  if (normalized.includes('veggie')) return true
  if (normalized.includes('empanadas de verduras')) return true
  if (normalized.includes('empanada de verduras')) return true
  return false
}

const isSideQuestion = (resp = {}) => {
  const normalizedTitle = normalizeLabel(resp?.title || resp?.label || resp?.question || resp?.name || '')
  return normalizedTitle.includes('guarnicion') || normalizedTitle.includes('guarn')
}

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

const getObjectLabel = (value = {}) =>
  value?.label ?? value?.name ?? value?.title ?? value?.value ?? value?.response ?? value?.answer

const splitTextValues = (value = '') => String(value)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const expandRawValues = (value) => {
  const parsed = parseJsonLikeValue(value)
  if (Array.isArray(parsed)) return parsed.flatMap(expandRawValues)
  if (parsed && typeof parsed === 'object') return expandRawValues(getObjectLabel(parsed))
  const text = toDisplayString(parsed)
  if (!text) return []
  const reparsed = parseJsonLikeValue(text)
  if (reparsed !== text) return expandRawValues(reparsed)
  return splitTextValues(text)
}

const getQuantityRows = (resp = {}) => {
  if (!resp?.quantities || typeof resp.quantities !== 'object') return []
  return Object.entries(resp.quantities)
    .flatMap(([rawLabel, rawQuantity]) => {
      const quantity = Number(rawQuantity) || 0
      if (quantity <= 0) return []
      return expandRawValues(rawLabel).map((label) => ({ label, quantity }))
    })
    .filter((row) => row.label && row.quantity > 0)
}

const expandResponseUnits = (resp = {}) => {
  const quantityRows = getQuantityRows(resp)
  if (quantityRows.length) return quantityRows

  const values = [
    ...expandRawValues(resp?.response ?? resp?.answer ?? resp?.value),
    ...expandRawValues(resp?.options)
  ].filter(Boolean)

  if (!values.length) return []

  const explicitQuantity = Number(resp?.quantity ?? resp?.qty ?? resp?.count)
  if (values.length === 1 && Number.isFinite(explicitQuantity) && explicitQuantity > 0) {
    return [{ label: values[0], quantity: explicitQuantity }]
  }

  return values.map((label) => ({ label, quantity: 1 }))
}

export const buildSideBucketsFromOrders = (orders = []) => {
  const buckets = createSideBuckets()
  orders.forEach(order => {
    const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)

    getOrderBeverageBreakdown(order).forEach(({ label, quantity }) => {
      const cleanLabel = toDisplayString(label)
      const cleanQuantity = Number(quantity) || 0
      if (!cleanLabel || cleanQuantity <= 0) return
      buckets.tiposBebidas[cleanLabel] = (buckets.tiposBebidas[cleanLabel] || 0) + cleanQuantity
      buckets.totalBebidas += cleanQuantity
    })

    normalizedCustomResponses.forEach(resp => {
      const respTitle = toDisplayString(resp?.title)
      const sideQuestion = isSideQuestion(resp)
      expandResponseUnits(resp).forEach(({ label, quantity }) => {
        if (!label || quantity <= 0 || isMainDishResponse(label, respTitle)) return
        if (!sideQuestion && (isBeverageLabel(label) || isDessertLabel(label))) return
        buckets.tiposGuarniciones[label] = (buckets.tiposGuarniciones[label] || 0) + quantity
        buckets.totalGuarniciones += quantity
      })
    })
  })
  return buckets
}

export const buildBifeCounts = (orders = []) => {
  const counts = {}
  orders.forEach(order => {
    getOrderMenuBreakdown(order).forEach(item => {
      const rawName = toDisplayString(item?.label)
      const normalized = normalizeLabel(rawName)
      if (!normalized || !normalized.includes('bife')) return
      const baseName = rawName.replace(/^\s*opci[oó]n\s*\d+\s*-\s*/i, '').trim()
      const qty = Number(item?.quantity || 1)
      counts[baseName] = (counts[baseName] || 0) + qty
    })
  })
  return counts
}

export const buildRanking = (counts = {}) => {
  const entries = Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
  const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0)
  const items = entries.map(([label, count]) => ({
    label,
    count: Number(count || 0),
    percent: total ? (Number(count || 0) / total) * 100 : 0
  }))
  return { items, total }
}

export const buildTrendsSnapshot = (orders = []) => {
  const menuRanking = buildRanking(buildMenuCounts(orders))
  const bifeRanking = buildRanking(buildBifeCounts(orders))
  const sideBuckets = buildSideBucketsFromOrders(orders)
  const sidesRanking = buildRanking(sideBuckets.tiposGuarniciones)
  const beveragesRanking = buildRanking(sideBuckets.tiposBebidas)
  const optionRanking = {
    items: menuRanking.items.filter(item => /^Opción\s+\d+/i.test(item.label))
  }
  const mainMenuRanking = {
    items: menuRanking.items.filter(item => !/^Opción\s+\d+/i.test(item.label))
  }

  return {
    totalOrders: orders.length,
    menuRanking,
    optionRanking,
    mainMenuRanking,
    bifeRanking,
    sidesRanking,
    beveragesRanking,
    topMenu: menuRanking.items[0]?.label || '—',
    topBife: bifeRanking.items[0]?.label || '—',
    topSide: sidesRanking.items[0]?.label || '—',
    topBeverage: beveragesRanking.items[0]?.label || '—'
  }
}

const getLeader = (ranking = {}) => ranking?.items?.[0] || null

const getParticipationForLabel = (ranking = {}, label = '') => {
  if (!label || label === '—') return 0
  const item = (ranking.items || []).find((entry) => entry.label === label)
  return Number(item?.percent || 0)
}

export const buildComparisonMetrics = (current = {}, previous = null) => {
  if (!previous) return null
  const previousTotal = Number(previous.totalOrders || 0)
  const currentTotal = Number(current.totalOrders || 0)
  const totalDelta = currentTotal - previousTotal
  const totalPercent = previousTotal > 0 ? (totalDelta / previousTotal) * 100 : null

  const leaderMetric = (key, currentRanking, previousRanking) => {
    const currentLeader = getLeader(currentRanking)
    const previousLeader = getLeader(previousRanking)
    const currentLabel = currentLeader?.label || '—'
    const previousLabel = previousLeader?.label || '—'
    const previousShareForCurrentLeader = getParticipationForLabel(previousRanking, currentLabel)
    return {
      key,
      label: currentLabel,
      previousLabel,
      currentShare: Number(currentLeader?.percent || 0),
      previousLeaderShare: Number(previousLeader?.percent || 0),
      previousShare: previousShareForCurrentLeader,
      ppDelta: Number(currentLeader?.percent || 0) - previousShareForCurrentLeader,
      leaderChanged: previousTotal > 0 && currentLabel !== previousLabel && currentLabel !== '—' && previousLabel !== '—',
      noPreviousData: previousTotal === 0
    }
  }

  return {
    total: {
      current: currentTotal,
      previous: previousTotal,
      delta: totalDelta,
      percent: totalPercent,
      noPreviousData: previousTotal === 0
    },
    leaders: {
      menu: leaderMetric('menu', current.mainMenuRanking, previous.mainMenuRanking),
      bife: leaderMetric('bife', current.bifeRanking, previous.bifeRanking),
      side: leaderMetric('side', current.sidesRanking, previous.sidesRanking),
      beverage: leaderMetric('beverage', current.beveragesRanking, previous.beveragesRanking)
    }
  }
}
