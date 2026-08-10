import { useCallback, useEffect, useRef, useState } from 'react'
import { COUNTABLE_STATUSES } from '../../utils/monthly/monthlyOrderConstants'
import { toDisplayString } from '../../utils/monthly/monthlyOrderFormatters'
import { normalizeOrderForReadOnly } from '../../utils/order/normalizeOrderForReadOnly'
import {
  addSideItem,
  buildDailyBreakdownFromOrdersByDay,
  buildRangeDates,
  createSideBuckets,
  indexOrdersByDay
} from '../../utils/monthly/monthlyOrderCalculations'

export const useMonthlyMetrics = ({ supabase, db, pushLog }) => {
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [dailyData, setDailyData] = useState(null)
  const [ordersByDay, setOrdersByDay] = useState({})
  const [rangeOrders, setRangeOrders] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [, setError] = useState(null)

  const fetchId = useRef(0)
  const pushLogRef = useRef(pushLog)

  useEffect(() => {
    pushLogRef.current = pushLog
  }, [pushLog])

  const PAGE_SIZE = 1000

  const resetMetricsState = useCallback(() => {
    setMetrics(null)
    setDailyData(null)
    setOrdersByDay({})
    setRangeOrders([])
    setSelectedDate(null)
    setError(null)
  }, [])

  const fetchAllOrders = useCallback(async (buildQuery, label) => {
    let from = 0
    let all = []
    while (true) {
      const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const batch = data || []
      all = all.concat(batch)
      pushLogRef.current?.('orders-page', { label, from, size: batch.length, total: all.length })
      if (batch.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    return all
  }, [])

  const fetchMetrics = useCallback(async (range) => {
    const currentRange = range
    if (!currentRange?.start || !currentRange?.end || currentRange.start > currentRange.end) return

    const reqId = ++fetchId.current
    pushLogRef.current?.('fetchMetrics-init', { currentRange, reqId })
    setMetricsLoading(true)
    setSelectedDate(null)
    setError(null)
    try {
      pushLogRef.current?.('fetch-start', currentRange)
      const columns = 'id,status,delivery_date,created_at,total_items,items,custom_responses,location,service,customer_name,customer_email,customer_phone,comments,order_origin,created_by_admin_id,admin_extra_created_at'
      pushLogRef.current?.('query-params', { start: currentRange.start, end: currentRange.end })

      const deliveryOrders = await fetchAllOrders(
        (from, to) => supabase
          .from('orders')
          .select(columns)
          .gte('delivery_date', currentRange.start)
          .lte('delivery_date', currentRange.end)
          .order('id', { ascending: true })
          .range(from, to),
        'delivery'
      )

      let orders = Array.isArray(deliveryOrders) ? deliveryOrders : []
      pushLogRef.current?.('orders-raw', { total: orders.length })

      orders = Array.isArray(orders) ? orders.filter(o => COUNTABLE_STATUSES.includes(o.status)) : []
      const statusCount = orders.reduce((acc, o) => {
        const s = o.status || 'unknown'
        acc[s] = (acc[s] || 0) + 1
        return acc
      }, {})
      pushLogRef.current?.('orders-filtered', {
        delivery: deliveryOrders?.length || 0,
        afterFilter: orders.length,
        statusCount,
        sample: orders.slice(0, 3)
      })

      const grouped = {}
      for (const order of orders) {
        const empresa = order.location || 'Sin ubicación'
        if (!grouped[empresa]) grouped[empresa] = []
        grouped[empresa].push(order)
      }

      const empresas = Object.keys(grouped).map(empresa => {
        const pedidos = grouped[empresa]
        let totalMenus = 0
        let tiposMenus = {}
        let totalOpciones = 0
        let tiposOpciones = {}
        const sideBuckets = createSideBuckets()

        pedidos.forEach(p => {
          const { normalizedItems, normalizedCustomResponses } = normalizeOrderForReadOnly(p)
          const items = Array.isArray(normalizedItems) ? normalizedItems : []
          items.forEach(item => {
            totalMenus += item.quantity || 1
            const nombre = (item.name || '').trim()
            tiposMenus[nombre] = (tiposMenus[nombre] || 0) + (item.quantity || 1)
            if (/^OPC(ION|IÓN)\s*\d+/i.test(nombre)) {
              totalOpciones += item.quantity || 1
              tiposOpciones[nombre] = (tiposOpciones[nombre] || 0) + (item.quantity || 1)
            }
          })

          const customResponses = Array.isArray(normalizedCustomResponses) ? normalizedCustomResponses : []
          customResponses.forEach(resp => {
            const baseResp = toDisplayString(resp.response)
            if (baseResp) addSideItem(baseResp, sideBuckets)
            if (Array.isArray(resp.options)) {
              resp.options.forEach(opt => {
                const tipo = toDisplayString(opt)
                if (!tipo) return
                addSideItem(tipo, sideBuckets)
              })
            }
          })
        })
        return {
          empresa,
          cantidadPedidos: pedidos.length,
          totalMenus,
          totalMenusPrincipales: totalMenus - totalOpciones,
          totalMenusTotal: totalMenus,
          totalOpciones,
          totalGuarniciones: sideBuckets.totalGuarniciones,
          totalBebidas: sideBuckets.totalBebidas,
          totalPostres: sideBuckets.totalPostres,
          tiposMenus,
          tiposOpciones,
          tiposGuarniciones: sideBuckets.tiposGuarniciones,
          tiposBebidas: sideBuckets.tiposBebidas,
          tiposPostres: sideBuckets.tiposPostres
        }
      })

      const newMetrics = {
        totalPedidos: 0,
        empresas
      }
      pushLogRef.current?.('metrics-grouped', { empresas: newMetrics.empresas.length })
      setMetrics(newMetrics)

      const byDay = indexOrdersByDay(orders)
      const rangeDates = buildRangeDates(currentRange.start, currentRange.end)
      let finalBreakdown = buildDailyBreakdownFromOrdersByDay(rangeDates, byDay)
      let breakdownCount = finalBreakdown?.range_totals?.count ?? 0

      try {
        const { data: breakdown, error: breakdownError } = await db.getDailyBreakdown({ start: currentRange.start, end: currentRange.end })
        if (breakdownError) throw breakdownError
        pushLogRef.current?.('breakdown', {
          days: breakdown?.daily_breakdown?.length || 0,
          total: breakdown?.range_totals?.count || 0,
          sample: breakdown?.daily_breakdown?.slice?.(0, 3) || []
        })
        breakdownCount = breakdown?.range_totals?.count ?? 0
        if (orders.length > 0 && breakdownCount !== orders.length) {
          finalBreakdown = buildDailyBreakdownFromOrdersByDay(rangeDates, byDay)
          pushLogRef.current?.('breakdown-fallback', {
            days: finalBreakdown.daily_breakdown.length,
            total: finalBreakdown.range_totals.count,
            breakdownCount,
            ordersCount: orders.length
          })
        } else {
          finalBreakdown = breakdown
        }
      } catch (err) {
        pushLogRef.current?.('breakdown-error', { message: err?.message || 'unknown' })
      }
      if (reqId === fetchId.current) {
        setDailyData(finalBreakdown)
        pushLogRef.current?.('orders-indexed', { days: Object.keys(byDay).length, sampleDay: Object.keys(byDay)[0] })
        setOrdersByDay(byDay)
        if (typeof window !== 'undefined') {
          window.__monthlyOrdersByDay = byDay
          window.__monthlyOrderIdsByDay = Object.fromEntries(
            Object.entries(byDay || {}).map(([day, list]) => [day, (list || []).map(o => o.id)])
          )
        }
        setRangeOrders(orders)
      }

      if (reqId === fetchId.current && finalBreakdown?.range_totals) {
        setMetrics(prev => prev ? { ...prev, totalPedidos: finalBreakdown.range_totals.count } : prev)
        pushLogRef.current?.('totals-updated', { totalPedidos: finalBreakdown.range_totals.count })
      }
    } catch (err) {
      pushLogRef.current?.('error', { message: err?.message || 'unknown', stack: err?.stack })
      setError(null)
    } finally {
      if (reqId === fetchId.current) {
        setMetricsLoading(false)
        pushLogRef.current?.('fetch-end', { reqId, currentRange })
      }
    }
  }, [db, fetchAllOrders, supabase])

  return {
    metricsLoading,
    setMetricsLoading,
    metrics,
    dailyData,
    ordersByDay,
    rangeOrders,
    selectedDate,
    setSelectedDate,
    resetMetricsState,
    fetchMetrics
  }
}
