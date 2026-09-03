import { getOrderMenuTotal } from './order/orderOperationalTotals'

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

export const buildConsumptionReportModel = (orders = [], dates = []) => {
  const people = new Map()
  const dailyTotals = Object.fromEntries(dates.map((date) => [date, 0]))

  orders.forEach((order) => {
    const date = String(order?.delivery_date || '').slice(0, 10)
    if (!Object.prototype.hasOwnProperty.call(dailyTotals, date)) return
    const quantity = getConsumptionQuantity(order)
    if (quantity <= 0) return
    const personKey = String(order.person_key || order.user_id || order.customer_email || resolveConsumptionPersonName(order))
    const current = people.get(personKey) || {
      personKey,
      name: resolveConsumptionPersonName(order),
      quantities: Object.fromEntries(dates.map((day) => [day, 0])),
      monthlyTotal: 0
    }
    current.quantities[date] += quantity
    current.monthlyTotal += quantity
    dailyTotals[date] += quantity
    people.set(personKey, current)
  })

  const rows = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return {
    dates,
    rows,
    dailyTotals,
    grandTotal: rows.reduce((sum, row) => sum + row.monthlyTotal, 0)
  }
}