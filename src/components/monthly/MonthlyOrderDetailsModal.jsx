import { useState } from 'react'
import { addSideItem, createSideBuckets, getMonthlyOrderService, isOptionName } from '../../utils/monthly/monthlyOrderCalculations'
import { toDisplayString } from '../../utils/monthly/monthlyOrderFormatters'

const MonthlyOrderDetailsModal = ({ date, orders = [], dailyBreakdown }) => {
  if (!date) return null

  const fmtTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    } catch (err) {
      void err
      return '—'
    }
  }

  let totals = { pedidos: 0, cenas: 0, menus: 0, opciones: 0 }
  const sideBuckets = createSideBuckets()
  const byEmpresa = {}
  const byMenu = {}
  const byOpcion = {}

  orders.forEach(order => {
    const service = getMonthlyOrderService(order)
    const empresa = order.location || 'Sin ubicación'
    if (!byEmpresa[empresa]) byEmpresa[empresa] = 0
    if (service !== 'dinner') byEmpresa[empresa] += 1

    if (service === 'dinner') totals.cenas += 1
    else totals.pedidos += 1

    let items = []
    if (Array.isArray(order.items)) items = order.items
    else if (typeof order.items === 'string') {
      try {
        items = JSON.parse(order.items)
      } catch (err) {
        void err
      }
    }
    items.forEach(it => {
      if (service === 'dinner') return
      const qty = it?.quantity || 1
      const name = (it?.name || '').trim()
      if (!name) return
      if (isOptionName(name)) {
        totals.opciones += qty
        byOpcion[name] = (byOpcion[name] || 0) + qty
      } else {
        totals.menus += qty
        byMenu[name] = (byMenu[name] || 0) + qty
      }
    })

    let custom = []
    if (Array.isArray(order.custom_responses)) custom = order.custom_responses
    else if (typeof order.custom_responses === 'string') {
      try {
        custom = JSON.parse(order.custom_responses)
      } catch (err) {
        void err
      }
    }
    custom.forEach(cr => {
      if (service === 'dinner') return
      const val = toDisplayString(cr?.response)
      if (val) addSideItem(val, sideBuckets)
      if (Array.isArray(cr?.options)) {
        cr.options.forEach(opt => {
          const o = toDisplayString(opt)
          if (!o) return
          addSideItem(o, sideBuckets)
        })
      }
    })
  })

  const summary = {
    date,
    count: dailyBreakdown?.count ?? totals.pedidos,
    dinner_count: dailyBreakdown?.dinner_count ?? totals.cenas,
    menus_principales: dailyBreakdown?.menus_principales ?? totals.menus,
    total_opciones: dailyBreakdown?.total_opciones ?? totals.opciones,
    total_guarniciones: sideBuckets.totalGuarniciones,
    total_bebidas: sideBuckets.totalBebidas,
    total_postres: sideBuckets.totalPostres
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-lg font-bold text-slate-800">Detalle del {date}</h4>
          <p className="text-sm text-slate-600">Pedidos de almuerzo: {summary.count ?? totals.pedidos}</p>
        </div>
        <div />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <Stat label="Pedidos almuerzo" value={summary.count ?? totals.pedidos} />
        <Stat label="Pedidos cena" value={summary.dinner_count ?? totals.cenas} />
        <Stat label="Total menús" value={summary.menus_principales ?? totals.menus} />
        <Stat label="Total opciones" value={summary.total_opciones ?? totals.opciones} />
        <Stat label="Total guarniciones" value={summary.total_guarniciones} />
        <Stat label="Total bebidas" value={summary.total_bebidas} />
        <Stat label="Total postres" value={summary.total_postres} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {[
          { title: 'Empresas activas', data: byEmpresa, id: 'empresas' },
          { title: 'Menús principales', data: byMenu, id: 'menus' },
          { title: 'Opciones', data: byOpcion, id: 'opciones' },
          { title: 'Guarniciones', data: sideBuckets.tiposGuarniciones, id: 'guarniciones' },
          { title: 'Bebidas', data: sideBuckets.tiposBebidas, id: 'bebidas' },
          { title: 'Postres', data: sideBuckets.tiposPostres, id: 'postres' }
        ].map(section => (
          <div key={section.id} className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
              {section.title}
            </div>
            <div className="mt-2">
              <ExpandableChipList data={section.data} limit={5} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">
          Pedidos del día
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-600">No hay pedidos en este día.</p>
        ) : (
          <DailyOrdersTable orders={orders} fmtTime={fmtTime} />
        )}
      </div>
    </div>
  )
}

const Stat = ({ label, value }) => (
  <div className="bg-white rounded-md border border-slate-200 p-2 text-center shadow-sm">
    <p className="text-[11px] font-semibold text-slate-600">{label}</p>
    <p className="text-lg font-bold text-slate-800">{value ?? 0}</p>
  </div>
)

const ExpandableChipList = ({ data, limit = 5 }) => {
  const entries = Object.entries(data || {})
  const [expanded, setExpanded] = useState(false)
  if (!entries.length) return <p className="text-sm text-slate-600">Sin datos.</p>
  const visible = expanded ? entries : entries.slice(0, limit)
  const remaining = Math.max(entries.length - visible.length, 0)
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(([k, v]) => (
          <span key={k} className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-slate-300 text-slate-900 border border-slate-400">
            {k} x{v}
          </span>
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-800"
        >
          {expanded ? 'Ver menos' : `Ver más (${remaining})`}
        </button>
      )}
    </div>
  )
}

const DailyOrdersTable = ({ orders, fmtTime }) => {
  const [showAll, setShowAll] = useState(false)
  const limit = 8
  const visibleOrders = showAll ? orders : orders.slice(0, limit)
  const remaining = Math.max(orders.length - visibleOrders.length, 0)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm bg-white border border-slate-200 rounded-lg shadow-sm text-slate-900">
          <thead className="bg-slate-800 text-slate-100 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Hora</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Empresa</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Turno</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Items</th>
            </tr>
          </thead>
          <tbody className="text-slate-900">
            {visibleOrders.map((o, i) => (
              <tr key={`${o.id}-${i}`} className="border-t border-slate-200 hover:bg-slate-100 odd:bg-white even:bg-slate-50 text-slate-900">
                <td className="px-3 py-1.5 text-slate-900">{fmtTime(o.created_at)}</td>
                <td className="px-3 py-1.5 text-slate-900">{o.location || '—'}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                    (o.service || 'lunch') === 'dinner'
                      ? 'bg-amber-200 text-amber-900 border-amber-300'
                      : 'bg-sky-200 text-sky-900 border-sky-300'
                  }`}>
                    {(o.service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo'}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {renderItems(o, isOptionName)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(prev => !prev)}
          className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-800"
        >
          {showAll ? 'Ver menos pedidos' : `Ver más pedidos (${remaining})`}
        </button>
      )}
    </div>
  )
}

const renderItems = (order, isOptionFn) => {
  let items = []
  if (Array.isArray(order.items)) items = order.items
  else if (typeof order.items === 'string') {
    try {
      items = JSON.parse(order.items)
    } catch (err) {
      void err
    }
  }
  if (!items.length) return '—'
  return items.map((it, idx) => {
    const name = it?.name || 'Item'
    const qty = it?.quantity || 1
    const tag = isOptionFn(name) ? 'Opción' : 'Menú'
    return (
      <span key={idx} className="inline-block mr-2 mb-1 px-2 py-0.5 rounded bg-slate-200 text-slate-900 text-[11px] font-semibold">
        {tag}: {name} (x{qty})
      </span>
    )
  })
}

export default MonthlyOrderDetailsModal
