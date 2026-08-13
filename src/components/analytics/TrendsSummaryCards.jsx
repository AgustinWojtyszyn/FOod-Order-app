const formatDeltaValue = (value, digits = 0) => {
  const number = Number(value || 0)
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(digits)}`
}

const getTone = (value) => {
  const number = Number(value || 0)
  if (number > 0) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (number < 0) return 'border-rose-200 bg-rose-50 text-rose-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

const getIndicator = (value) => {
  const number = Number(value || 0)
  if (number > 0) return '▲'
  if (number < 0) return '▼'
  return '='
}

const TotalComparison = ({ metric }) => {
  if (!metric) return null
  if (metric.noPreviousData) {
    return (
      <p className="mt-3 inline-flex max-w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
        Sin datos comparados
      </p>
    )
  }
  return (
    <p className={`mt-3 inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-semibold ${getTone(metric.delta)}`}>
      {getIndicator(metric.delta)} {formatDeltaValue(metric.delta)}
      {Number.isFinite(metric.percent) ? ` (${formatDeltaValue(metric.percent, 1)}%)` : ''}
    </p>
  )
}

const LeaderComparison = ({ metric }) => {
  if (!metric) return null
  if (metric.noPreviousData) {
    return (
      <p className="mt-3 inline-flex max-w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
        Sin datos comparados
      </p>
    )
  }
  return (
    <div className="mt-3 space-y-1">
      <p className={`inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-semibold ${getTone(metric.ppDelta)}`}>
        {getIndicator(metric.ppDelta)} {formatDeltaValue(metric.ppDelta, 1)} pp
      </p>
      {metric.leaderChanged && (
        <p className="text-xs font-semibold text-slate-600 leading-snug break-words">
          Antes: {metric.previousLabel}
        </p>
      )}
    </div>
  )
}

const SummaryCard = ({ label, value, accent, sublabel, comparison, comparisonType = 'leader' }) => (
  <div className="card min-w-0 bg-white/95 backdrop-blur-sm shadow-md border border-slate-200 rounded-2xl p-4 sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-2">
      <p className="min-w-0 text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold leading-snug break-words">
        {label}
      </p>
      <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${accent}`}>
        {sublabel}
      </span>
    </div>
    <p className="mt-2 min-w-0 text-xl sm:text-2xl font-bold text-slate-900 leading-tight break-words [overflow-wrap:anywhere]" title={value}>
      {value}
    </p>
    {comparisonType === 'total'
      ? <TotalComparison metric={comparison} />
      : <LeaderComparison metric={comparison} />}
  </div>
)

const TrendsSummaryCards = ({
  totalOrders,
  companyLabel,
  topMenu,
  topBife,
  topSide,
  topBeverage,
  comparison
}) => {
  return (
    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <SummaryCard label="Pedidos Analizados" value={totalOrders} accent="bg-blue-100 text-blue-700" sublabel="Total" comparison={comparison?.total} comparisonType="total" />
      <SummaryCard label="Empresa" value={companyLabel} accent="bg-slate-100 text-slate-700" sublabel="Filtro" />
      <SummaryCard label="Plato Más Pedido" value={topMenu} accent="bg-emerald-100 text-emerald-700" sublabel="Top" comparison={comparison?.leaders?.menu} />
      <SummaryCard label="Bife Más Pedido" value={topBife} accent="bg-orange-100 text-orange-700" sublabel="Top" comparison={comparison?.leaders?.bife} />
      <SummaryCard label="Guarnición Top" value={topSide} accent="bg-amber-100 text-amber-700" sublabel="Top" comparison={comparison?.leaders?.side} />
      <SummaryCard label="Bebida Top" value={topBeverage} accent="bg-sky-100 text-sky-700" sublabel="Top" comparison={comparison?.leaders?.beverage} />
    </div>
  )
}

export default TrendsSummaryCards
