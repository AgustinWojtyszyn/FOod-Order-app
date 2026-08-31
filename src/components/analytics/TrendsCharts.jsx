import DonutChartPro from './DonutChartPro'
import { shouldUseDonut } from './donutChartRules'
const formatPercent = (value) => `${value.toFixed(1)}%`

const getPreferenceIndicator = (value) => {
  const number = Number(value || 0)
  if (number > 0) return '▲'
  if (number < 0) return '▼'
  return '='
}

const formatSignedUnits = (value) => {
  const number = Number(value || 0)
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(0)}`
}

const formatSignedPp = (value) => {
  const number = Number(value || 0)
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(1)} pp`
}

export const RankingComparisonText = ({ comparison }) => {
  if (!comparison) return null
  if (comparison.noPreviousData) {
    return (
      <span className="text-xs font-semibold text-slate-600">
        Sin base comparable
      </span>
    )
  }
  if (comparison.isNew) {
    return (
      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
        Nuevo
      </span>
    )
  }
  return (
    <span className="text-xs font-semibold text-slate-700">
      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5">
        {getPreferenceIndicator(comparison.countDelta)} {formatSignedUnits(comparison.countDelta)} · {formatSignedPp(comparison.ppDelta)}
      </span>
    </span>
  )
}

const BarRow = ({ label, count, percent, max, accent, comparison }) => {
  const width = max ? `${(count / max) * 100}%` : '0%'
  return (
    <div className="group space-y-2">
      <div className="flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-start sm:justify-between">
        <span className="font-semibold text-slate-800 whitespace-normal break-normal overflow-hidden">{label}</span>
        <span className="flex shrink-0 flex-wrap items-center gap-1 text-slate-500 sm:justify-end">
          <span>{count} · {formatPercent(percent)}</span>
          {comparison && <span className="text-slate-400">|</span>}
          <RankingComparisonText comparison={comparison} />
        </span>
      </div>
      <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-linear-to-r ${accent} transition-all duration-700 ease-out group-hover:brightness-110`}
          style={{ width }}
        />
      </div>
    </div>
  )
}

const ChartCard = ({
  title,
  subtitle,
  items,
  accent,
  chartType,
  centerMode,
  donutSize = 220,
  donutStroke = 26,
  colors
}) => {
  const max = items.reduce((acc, item) => Math.max(acc, item.count || 0), 0)
  const useDonut = chartType === 'donut' && shouldUseDonut(items)
  return (
    <div className="card bg-white/95 backdrop-blur-sm shadow-md border border-slate-200 rounded-2xl p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-sm sm:text-base text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Ranking</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <div className="text-sm text-slate-500">No hay datos para este filtro.</div>
        )}
        {items.length > 0 && useDonut && (
          <DonutChartPro
            items={items}
            centerMode={centerMode}
            size={donutSize}
            strokeWidth={donutStroke}
            colors={colors}
          />
        )}
        {items.length > 0 && !useDonut && items.map((item, index) => (
          <BarRow
            key={`${item.label}-${index}`}
            label={item.label}
            count={item.count}
            percent={item.percent}
            max={max}
            accent={accent}
            comparison={item.comparison}
          />
        ))}
        {items.length > 0 && chartType === 'donut' && !useDonut && (
          <div className="text-xs text-slate-500">
            Gráfico circular no aporta claridad con este volumen de datos. Se muestran barras.
          </div>
        )}
      </div>
    </div>
  )
}

const TrendsCharts = ({
  menuRanking,
  sidesRanking,
  beveragesRanking,
  showMenus = true,
  showSides = true,
  showBeverages = true,
  menuTitle = 'Platos más pedidos',
  menuSubtitle = 'Menú principal y opciones 1 a 6',
  sidesTitle = 'Guarniciones más pedidas',
  sidesSubtitle = 'Cantidad y porcentaje sobre el total',
  beveragesTitle = 'Bebidas más pedidas',
  beveragesSubtitle = 'Respuestas con bebidas detectadas',
  chartType = 'bar',
  menuColors,
  menuDonutSize,
  menuDonutStroke
}) => {
  return (
    <div className="grid gap-6">
      {showMenus && (
        <ChartCard
          title={menuTitle}
          subtitle={menuSubtitle}
          items={menuRanking}
          accent="from-blue-500 to-blue-400"
          chartType={chartType}
          centerMode="top"
          colors={menuColors}
          donutSize={menuDonutSize}
          donutStroke={menuDonutStroke}
        />
      )}
      {showSides && (
        <ChartCard
          title={sidesTitle}
          subtitle={sidesSubtitle}
          items={sidesRanking}
          accent="from-emerald-500 to-emerald-400"
          chartType={chartType}
          centerMode="total"
        />
      )}
      {showBeverages && (
        <ChartCard
          title={beveragesTitle}
          subtitle={beveragesSubtitle}
          items={beveragesRanking}
          accent="from-amber-500 to-amber-400"
          chartType={chartType}
          centerMode="percent"
        />
      )}
    </div>
  )
}

export default TrendsCharts
