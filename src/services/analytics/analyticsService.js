import { normalizeOrderForReadOnly } from '../../utils/order/normalizeOrderForReadOnly'
import { getOrderMenuTotal, summarizeOperationalOrder } from '../../utils/order/orderOperationalTotals'

export const createAnalyticsService = ({ supabase } = {}) => {
  if (!supabase) {
    throw new Error('createAnalyticsService requires a supabase client')
  }

  return {
    // Desglose diario por rango usando datos históricos reales
    // - Filtra por delivery_date (día de entrega del negocio)
    // - Aplica mismos criterios de estado para consistencia
    // - Incluye días sin pedidos con valor 0 para continuidad
    getDailyBreakdown: async ({ start, end, timeZone = 'America/Argentina/San_Juan' }) => {
      if (!start || !end) {
        return { error: new Error('Rango inválido: start/end son requeridos') }
      }

      // Estados que cuentan como "pedido" en este panel (incluir en preparación/listo)
      const COUNTABLE_STATUSES = ['pending', 'preparing', 'ready', 'archived', 'cancelled']

      const dbg = (label, data = {}) => {
        if (typeof window !== 'undefined') {
          window.__monthlyPanelLogs = window.__monthlyPanelLogs || []
          window.__monthlyPanelLogs.unshift({ ts: new Date().toISOString(), label: `db:${label}`, data })
          if (window.__monthlyPanelLogs.length > 200) window.__monthlyPanelLogs.pop()
        }
      }

      const selectOrders = async (cols) => {
        const pageSize = 1000
        let from = 0
        let all = []
        dbg('query', { start, end, cols })
        while (true) {
          const res = await supabase
            .from('orders')
            .select(cols)
            .gte('delivery_date', start)
            .lte('delivery_date', end)
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)

          if (res?.error) {
            dbg('result', { count: res?.data?.length || 0, error: res?.error })
            return res
          }

          const batch = res?.data || []
          all = all.concat(batch)
          dbg('page', { from, size: batch.length, total: all.length })

          if (batch.length < pageSize) break
          from += pageSize
        }
        dbg('result', { count: all.length, error: null })
        return { data: all, error: null }
      }

      // Intento principal: incluye custom_responses si existe
      const primaryColumns = 'id, status, delivery_date, created_at, total_items, items, custom_responses, order_origin, created_by_admin_id, admin_extra_created_at'
      let { data: orders, error } = await selectOrders(primaryColumns)

      // Si falla por columna inexistente (ej. custom_responses), reintentar sin esa columna
      if (error && (error.code === '42703' || /custom_responses/i.test(error.message || ''))) {
        const fallbackColumns = 'id, status, delivery_date, created_at, total_items, items'
        const fallbackResult = await selectOrders(fallbackColumns)
        orders = fallbackResult.data
        error = fallbackResult.error
      }

      if (error) return { error }

      // Helper para iterar fechas del rango inclusive
      const parseISODate = (str) => {
        const [y, m, d] = str.split('-').map(Number)
        return new Date(y, m - 1, d)
      }
      const startDate = parseISODate(start)
      const endDate = parseISODate(end)
      const days = []
      for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 1)) {
        const yyyy = dt.getFullYear()
        const mm = String(dt.getMonth() + 1).padStart(2, '0')
        const dd = String(dt.getDate()).padStart(2, '0')
        days.push(`${yyyy}-${mm}-${dd}`)
      }

      // Agrupar por fecha de negocio (delivery_date)
      const bucketForOrder = (o) => {
        if (o.delivery_date) return o.delivery_date.slice(0, 10)
        return null
      }

      const byDay = new Map()
      for (const day of days) {
        byDay.set(day, {
          date: day,
          count: 0,
          total_items: 0,
          total_amount: 0,
          menus_principales: 0,
          opciones: { 'OPCIÓN 1': 0, 'OPCIÓN 2': 0, 'OPCIÓN 3': 0, 'OPCIÓN 4': 0, 'OPCIÓN 5': 0, 'OPCIÓN 6': 0 },
          tipos_guarniciones: {},
          total_opciones: 0,
          total_guarniciones: 0
        })
      }

      const norm = (v) => {
        if (v === null || v === undefined) return ''
        if (typeof v === 'string') return v.trim()
        if (typeof v === 'number' || typeof v === 'boolean') return String(v)
        if (Array.isArray(v)) return v.map(norm).filter(Boolean).join(', ')
        if (typeof v === 'object') {
          try { return JSON.stringify(v) } catch { return String(v) }
        }
        return String(v)
      }

      const filteredOrders = Array.isArray(orders) ? orders.filter(o => COUNTABLE_STATUSES.includes(o.status)) : []
      filteredOrders.forEach(o => {
        const key = bucketForOrder(o)
        if (!key) return
        if (!byDay.has(key)) {
          byDay.set(key, { date: key, count: 0, total_items: 0, total_amount: 0 })
        }
        const row = byDay.get(key)
        row.count += 1
        const { normalizedCustomResponses } = normalizeOrderForReadOnly(o)
        const operational = summarizeOperationalOrder(o)
        const orderQuantity = getOrderMenuTotal(o)
        row.total_items += orderQuantity
        row.total_amount += (o.total_amount || 0)

        // Procesar items: separar menús principales y opciones
        operational.menuBreakdown.forEach(item => {
          const qty = (item?.quantity ?? 1)
          const nombre = (item?.label ?? '').trim()
          const m = nombre.match(/^OPC(ION|IÓN)\s*(\d+)/i)
          if (m) {
            const n = Number(m[2])
            const key = `OPCIÓN ${n}`
            if (row.opciones[key] === undefined) row.opciones[key] = 0
            row.opciones[key] += qty
            row.total_opciones += qty
          } else {
            row.menus_principales += qty
          }
        })

        // Procesar guarniciones desde custom_responses
        const customResponses = Array.isArray(normalizedCustomResponses) ? normalizedCustomResponses : []
        customResponses.forEach(resp => {
          const r = norm(resp?.response)
          if (r) {
            row.tipos_guarniciones[r] = (row.tipos_guarniciones[r] || 0) + 1
            row.total_guarniciones += 1
          }
          if (Array.isArray(resp?.options)) {
            resp.options.forEach(opt => {
              const val = norm(opt)
              if (!val) return
              row.tipos_guarniciones[val] = (row.tipos_guarniciones[val] || 0) + 1
              row.total_guarniciones += 1
            })
          }
        })

        byDay.set(key, row)
      })

      const daily_breakdown = days.map(d => byDay.get(d)).filter(Boolean)
      const range_totals = daily_breakdown.reduce((acc, d) => {
        acc.count += d.count
        acc.total_items += d.total_items
        acc.total_amount += d.total_amount
        acc.menus_principales += d.menus_principales
        acc.total_opciones += d.total_opciones
        acc.total_guarniciones += d.total_guarniciones
        return acc
      }, { count: 0, total_items: 0, total_amount: 0, menus_principales: 0, total_opciones: 0, total_guarniciones: 0 })

      return { data: { daily_breakdown, range_totals, start, end, statuses: COUNTABLE_STATUSES, timeZone }, error: null }
    }
  }
}
