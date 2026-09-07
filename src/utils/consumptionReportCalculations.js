import { getOrderMenuTotal } from './order/orderOperationalTotals'
import {
  getOrderRemitoLocationKey,
  getOrderRemitoLocationLabel
} from './daily/exportDailyOrderNotesExcel'

const FALLBACK_NAME = 'Sin nombre'

export const getMonthDates = (year, month) => {
  const first = new Date(Date.UTC(Number(year), Number(month) - 1, 1))
  const dates = []
  for (let date = first; date.getUTCMonth() === Number(month) - 1; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

export const resolveConsumptionPersonName = (order = {}) =>
  String(
    order.customer_name ||
    order.user_full_name ||
    order.user_name ||
    order.customer_email ||
    order.user_email ||
    FALLBACK_NAME
  ).trim() || FALLBACK_NAME

export const getConsumptionQuantity = (order = {}) => getOrderMenuTotal(order)

export const resolveConsumptionLocationLabel = (order = {}) =>
  getOrderRemitoLocationLabel(order) || 'Sin sede'

const normalizeLocationSortText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const isIsemarConsumptionRow = (row = {}) =>
  normalizeLocationSortText(row.locationLabel).includes('ISEMAR')

const getIsemarPredioRank = (locationLabel = '') => {
  const normalized = normalizeLocationSortText(locationLabel)
  if (/PREDIO\s*1\b/.test(normalized)) return 1
  if (/PREDIO\s*2\b/.test(normalized)) return 2
  return 99
}

const sortConsumptionRows = (rows = []) => {
  const onlyIsemarRows = rows.length > 0 && rows.every(isIsemarConsumptionRow)

  return rows.sort((a, b) => {
    if (onlyIsemarRows) {
      return (
        getIsemarPredioRank(a.locationLabel) - getIsemarPredioRank(b.locationLabel) ||
        a.locationLabel.localeCompare(b.locationLabel, 'es') ||
        a.name.localeCompare(b.name, 'es')
      )
    }

    return (
      a.name.localeCompare(b.name, 'es') ||
      a.locationLabel.localeCompare(b.locationLabel, 'es')
    )
  })
}

export const buildConsumptionReportModel = (orders = [], dates = []) => {
  const people = new Map()
  const dailyTotals = Object.fromEntries(dates.map((date) => [date, 0]))

  orders.forEach((order) => {
    const date = String(order?.delivery_date || '').slice(0, 10)
    if (!Object.prototype.hasOwnProperty.call(dailyTotals, date)) return
    const quantity = getConsumptionQuantity(order)
    if (quantity <= 0) return
    const personKey = String(order.person_key || order.user_id || order.customer_email || resolveConsumptionPersonName(order))
    const locationLabel = resolveConsumptionLocationLabel(order)
    const locationKey = getOrderRemitoLocationKey(order) || locationLabel
    const rowKey = `${personKey}::${locationKey}`
    const current = people.get(rowKey) || {
      personKey: rowKey,
      name: resolveConsumptionPersonName(order),
      locationLabel,
      quantities: Object.fromEntries(dates.map((day) => [day, 0])),
      monthlyTotal: 0
    }
    current.quantities[date] += quantity
    current.monthlyTotal += quantity
    dailyTotals[date] += quantity
    people.set(rowKey, current)
  })

  const rows = sortConsumptionRows([...people.values()])
  return {
    dates,
    rows,
    dailyTotals,
    grandTotal: rows.reduce((sum, row) => sum + row.monthlyTotal, 0)
  }
}
