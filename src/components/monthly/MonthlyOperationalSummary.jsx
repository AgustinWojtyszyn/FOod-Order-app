import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { buildMonthlyOperationalSummary } from '../../utils/monthly/monthlyOrderCalculations'

const formatDecimal = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

const MetricCard = ({ label, value, detail }) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
    <p className="mt-1 truncate text-xl font-black text-slate-900" title={String(value)}>
      {value}
    </p>
    {detail && (
      <p className="mt-1 truncate text-xs font-semibold text-slate-600" title={detail}>
        {detail}
      </p>
    )}
  </div>
)

const TrendIcon = ({ direction }) => {
  if (direction === 'up') return <TrendingUp className="h-5 w-5 text-emerald-600" aria-hidden="true" />
  if (direction === 'down') return <TrendingDown className="h-5 w-5 text-red-600" aria-hidden="true" />
  return <Minus className="h-5 w-5 text-slate-500" aria-hidden="true" />
}

const trendTone = {
  up: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  down: 'border-red-200 bg-red-50 text-red-800',
  stable: 'border-slate-200 bg-slate-50 text-slate-700'
}

const MonthlyOperationalSummary = ({
  totalsForView,
  dailyDataForView,
  ordersByDayForView,
  empresasForView
}) => {
  const summary = buildMonthlyOperationalSummary({
    totalsForView,
    dailyDataForView,
    ordersByDayForView,
    empresasForView
  })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print-no-break print-full-width">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Resumen operativo del rango</h2>
          <p className="text-sm font-semibold text-slate-600">
            {summary.hasData
              ? `${summary.calendarDays} días calendario analizados`
              : 'Sin pedidos para el rango filtrado'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Promedio diario" value={formatDecimal(summary.averagePerDay)} detail="pedidos de almuerzo por día" />
        <MetricCard
          label="Día pico"
          value={summary.peakDay.label}
          detail={summary.peakDay.count > 0 ? `${summary.peakDay.count} pedidos de almuerzo` : 'Sin datos'}
        />
        <MetricCard
          label="Empresa principal"
          value={summary.topCompany.name}
          detail={summary.topCompany.count > 0 ? `${summary.topCompany.count} pedidos de almuerzo` : 'Sin datos'}
        />
        <MetricCard label="Empresas atendidas" value={summary.companiesServed} detail="con pedidos" />
        <MetricCard label="Almuerzo / cena" value={`${summary.mealMix.lunch} / ${summary.mealMix.dinner}`} detail={`${summary.mealMix.dinnerOrders} pedidos de cena`} />
        <MetricCard label="Días sin pedidos" value={summary.daysWithoutOrders} detail="días calendario" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-black text-slate-800">Top 3 empresas</h3>
          {summary.topCompanies.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-slate-600">Sin datos</p>
          ) : (
            <div className="mt-3 space-y-3">
              {summary.topCompanies.map((company) => (
                <div key={company.name} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="truncate text-slate-700" title={company.name}>{company.name}</span>
                    <span className="shrink-0 text-slate-900">{company.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${company.percentage}%` }}
                      aria-label={`${company.name}: ${company.count} pedidos`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`rounded-xl border p-3 ${trendTone[summary.trend.direction] || trendTone.stable}`}>
          <div className="flex items-center gap-2">
            <TrendIcon direction={summary.trend.direction} />
            <h3 className="text-sm font-black">Tendencia del rango</h3>
          </div>
          <p className="mt-3 text-2xl font-black">{summary.trend.label}</p>
          <p className="mt-2 text-sm font-semibold">
            Primera mitad: {summary.trend.firstHalfTotal} pedidos de almuerzo · Segunda mitad: {summary.trend.secondHalfTotal} pedidos de almuerzo
          </p>
        </div>
      </div>
    </section>
  )
}

export default MonthlyOperationalSummary
