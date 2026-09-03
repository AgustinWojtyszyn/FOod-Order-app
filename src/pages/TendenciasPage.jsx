import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import ExcelJS from 'exceljs'
import { ALL_COMPANY_LIST as COMPANY_LIST } from '../constants/companyConfig'
import excelLogo from '../assets/logoexcel.png'
import { useTrendsData } from '../hooks/analytics/useTrendsData'
import TrendsFilters from '../components/analytics/TrendsFilters'
import TrendsSummaryCards from '../components/analytics/TrendsSummaryCards'
import TrendsCharts, { RankingComparisonText } from '../components/analytics/TrendsCharts'
import { buildRankingComparisonItems, COMPARISON_MODES, getComparisonRange } from '../utils/analytics/trendsHelpers'

const getDefaultRange = () => {
  const now = new Date()
  const start = new Date(now)
  start.setMonth(start.getMonth() - 1)
  const format = (d) => d.toISOString().slice(0, 10)
  return { start: format(start), end: format(now) }
}

const TendenciasPage = () => {
  const [chartType, setChartType] = useState(() => {
    if (typeof window === 'undefined') return 'bar'
    return window.localStorage.getItem('trends_chart_type') || 'bar'
  })
  const companyOptions = useMemo(() => (
    COMPANY_LIST.map((company) => ({
      label: company.name,
      value: (company.locations && company.locations[0]) ? company.locations[0] : company.name
    }))
  ), [])

  const [filtersDraft, setFiltersDraft] = useState({
    company: 'all',
    range: getDefaultRange(),
    analysisType: 'all',
    comparisonMode: COMPARISON_MODES.NONE
  })
  const [filtersApplied, setFiltersApplied] = useState(filtersDraft)
  const comparisonRange = useMemo(
    () => getComparisonRange(filtersApplied.range, filtersApplied.comparisonMode),
    [filtersApplied.comparisonMode, filtersApplied.range]
  )

  const {
    loading,
    error,
    totalOrders,
    menuRanking,
    optionRanking,
    mainMenuRanking,
    sidesRanking,
    beveragesRanking,
    topMenu,
    topBife,
    topSide,
    topBeverage,
    comparison,
    comparisonSnapshot
  } = useTrendsData({
    company: filtersApplied.company,
    dateRange: filtersApplied.range,
    comparisonMode: filtersApplied.comparisonMode,
    comparisonRange
  })

  const companyLabel = filtersApplied.company === 'all'
    ? 'Todas'
    : (companyOptions.find((opt) => opt.value === filtersApplied.company)?.label || filtersApplied.company)

  const isDirty = JSON.stringify(filtersDraft) !== JSON.stringify(filtersApplied)
  const isRangeValid = !filtersDraft.range.start
    || !filtersDraft.range.end
    || filtersDraft.range.start <= filtersDraft.range.end

  const handleApply = () => {
    if (!isRangeValid) return
    setFiltersApplied(filtersDraft)
  }

  const handleClear = () => {
    const cleared = {
      company: 'all',
      range: { start: '', end: '' },
      analysisType: 'all',
      comparisonMode: COMPARISON_MODES.NONE
    }
    setFiltersDraft(cleared)
    setFiltersApplied(cleared)
  }

  const handleChartTypeChange = (value) => {
    setChartType(value)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('trends_chart_type', value)
    }
  }

  const menuColors = useMemo(() => {
    const colorMap = {
      'menú principal': '#2563eb',
      'menu principal': '#2563eb',
      'plato principal': '#2563eb',
      'opción 1': '#22c55e',
      'opcion 1': '#22c55e',
      'opción 2': '#f59e0b',
      'opcion 2': '#f59e0b',
      'opción 3': '#8b5cf6',
      'opcion 3': '#8b5cf6',
      'opción 4': '#ef4444',
      'opcion 4': '#ef4444',
      'opción 5': '#0ea5e9',
      'opcion 5': '#0ea5e9',
      'opción 6': '#14b8a6',
      'opcion 6': '#14b8a6'
    }
    return (menuRanking.items || []).map((item) => {
      const key = (item?.label || '').toLowerCase()
      const matched = Object.keys(colorMap).find((k) => key.includes(k))
      return matched ? colorMap[matched] : '#94a3b8'
    })
  }, [menuRanking.items])

  const hasComparison = Boolean(comparison)
  const noPreviousData = Boolean(comparison?.total?.noPreviousData)
  const comparedMenuItems = useMemo(
    () => (hasComparison
      ? buildRankingComparisonItems(menuRanking.items, comparisonSnapshot?.menuRanking, noPreviousData)
      : menuRanking.items),
    [comparisonSnapshot?.menuRanking, hasComparison, menuRanking.items, noPreviousData]
  )
  const comparedOptionItems = useMemo(
    () => (hasComparison
      ? buildRankingComparisonItems(optionRanking.items, comparisonSnapshot?.optionRanking, noPreviousData)
      : optionRanking.items),
    [comparisonSnapshot?.optionRanking, hasComparison, noPreviousData, optionRanking.items]
  )
  const comparedSideItems = useMemo(
    () => (hasComparison
      ? buildRankingComparisonItems(sidesRanking.items, comparisonSnapshot?.sidesRanking, noPreviousData)
      : sidesRanking.items),
    [comparisonSnapshot?.sidesRanking, hasComparison, noPreviousData, sidesRanking.items]
  )
  const comparedBeverageItems = useMemo(
    () => (hasComparison
      ? buildRankingComparisonItems(beveragesRanking.items, comparisonSnapshot?.beveragesRanking, noPreviousData)
      : beveragesRanking.items),
    [beveragesRanking.items, comparisonSnapshot?.beveragesRanking, hasComparison, noPreviousData]
  )

  const comparisonModeLabel = (mode) => {
    if (mode === COMPARISON_MODES.PREVIOUS_PERIOD) return 'Período anterior'
    if (mode === COMPARISON_MODES.PREVIOUS_YEAR) return 'Mismo período del año anterior'
    return 'Sin comparación'
  }

  const formatRangeLabel = (range = {}) => {
    if (!range?.start && !range?.end) return 'Sin rango'
    return `${range.start || 'inicio'} a ${range.end || 'fin'}`
  }

  const formatSigned = (value, suffix = '') => {
    const number = Number(value || 0)
    const sign = number > 0 ? '+' : ''
    return `${sign}${number.toFixed(suffix === ' pp' ? 1 : 0)}${suffix}`
  }

  const formatPercentDelta = (value) => {
    if (!Number.isFinite(value)) return 'Sin base comparable'
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  const formatPercentValue = (value) => `${Number(value || 0).toFixed(1)}%`

  const leaderExportValue = (metric) => {
    if (!metric) return '—'
    return `${metric.label} (${Number(metric.currentShare || 0).toFixed(1)}%)`
  }

  const previousLeaderExportValue = (metric) => {
    if (!metric) return '—'
    if (metric.noPreviousData) return 'Sin datos'
    return `${metric.previousLabel} (${Number(metric.previousLeaderShare || 0).toFixed(1)}%)`
  }

  const addComparisonSheet = (wb) => {
    const ws = wb.addWorksheet('Comparación')
    ws.columns = [
      { header: 'Métrica', key: 'metric', width: 28 },
      { header: 'Actual', key: 'current', width: 34 },
      { header: 'Comparado', key: 'previous', width: 34 },
      { header: 'Variación', key: 'delta', width: 22 },
      { header: 'Detalle', key: 'detail', width: 48 }
    ]

    const noComparison = filtersApplied.comparisonMode === COMPARISON_MODES.NONE || !comparisonRange
    ws.addRows([
      {
        metric: 'Modo',
        current: comparisonModeLabel(filtersApplied.comparisonMode),
        previous: noComparison ? 'No aplica' : comparisonModeLabel(filtersApplied.comparisonMode),
        delta: '',
        detail: noComparison ? 'Exportación sin comparación activa.' : ''
      },
      {
        metric: 'Rango',
        current: formatRangeLabel(filtersApplied.range),
        previous: noComparison ? 'No aplica' : formatRangeLabel(comparisonRange),
        delta: '',
        detail: ''
      }
    ])

    if (!comparison) return

    ws.addRow({
      metric: 'Pedidos analizados',
      current: comparison.total.current,
      previous: comparison.total.noPreviousData ? 'Sin datos' : comparison.total.previous,
      delta: comparison.total.noPreviousData
        ? 'Sin base comparable'
        : `${formatSigned(comparison.total.delta)} (${formatPercentDelta(comparison.total.percent)})`,
      detail: comparison.total.noPreviousData ? 'El período comparado no tiene pedidos.' : ''
    })

    const leaderRows = [
      ['Menú principal', comparison.leaders.menu],
      ['Bife principal', comparison.leaders.bife],
      ['Guarnición principal', comparison.leaders.side],
      ['Bebida principal', comparison.leaders.beverage]
    ]
    leaderRows.forEach(([label, metric]) => {
      ws.addRow({
        metric: label,
        current: leaderExportValue(metric),
        previous: previousLeaderExportValue(metric),
        delta: metric?.noPreviousData ? 'Sin base comparable' : formatSigned(metric?.ppDelta || 0, ' pp'),
        detail: metric?.leaderChanged ? `Antes lideraba ${metric.previousLabel}` : ''
      })
    })

    const addItemRows = (title, items) => {
      if (!items?.length) return
      ws.addRow({})
      ws.addRow({ metric: title })
      items.forEach((item) => {
        const itemComparison = item.comparison
        ws.addRow({
          metric: item.label,
          current: `${item.count} (${formatPercentValue(item.percent)})`,
          previous: itemComparison?.noPreviousData
            ? 'Sin datos'
            : `${itemComparison?.previousCount ?? 0} (${formatPercentValue(itemComparison?.previousPercent)})`,
          delta: itemComparison?.noPreviousData
            ? 'Sin base comparable'
            : itemComparison?.isNew
              ? 'Nuevo'
              : `${formatSigned(itemComparison?.countDelta || 0)} · ${formatSigned(itemComparison?.ppDelta || 0, ' pp')}`,
          detail: ''
        })
      })
    }

    if (filtersApplied.analysisType === 'all' || filtersApplied.analysisType === 'menus') {
      addItemRows('Variaciones por item - Menús/Opciones', comparedMenuItems.slice(0, 8))
    }
    if (filtersApplied.analysisType === 'options') {
      addItemRows('Variaciones por item - Opciones', comparedOptionItems.slice(0, 8))
    }
    if (filtersApplied.analysisType === 'all' || filtersApplied.analysisType === 'sides') {
      addItemRows('Variaciones por item - Guarniciones', comparedSideItems.slice(0, 5))
    }
    if (filtersApplied.analysisType === 'all' || filtersApplied.analysisType === 'beverages') {
      addItemRows('Variaciones por item - Bebidas', comparedBeverageItems.slice(0, 5))
    }
  }

  const handleExport = async () => {
    const wb = new ExcelJS.Workbook()
    const summary = wb.addWorksheet('Resumen')
    summary.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 50 }
    ]
    summary.addRows([
      { metric: 'Empresa', value: companyLabel },
      { metric: 'Rango', value: filtersApplied.range.start || filtersApplied.range.end ? `${filtersApplied.range.start || 'inicio'} a ${filtersApplied.range.end || 'fin'}` : 'Sin rango' },
      { metric: 'Pedidos analizados', value: totalOrders },
      { metric: 'Plato más pedido', value: topMenu },
      { metric: 'Bife más pedido', value: topBife },
      { metric: 'Guarnición top', value: topSide },
      { metric: 'Bebida top', value: topBeverage }
    ])

    const addRankingSheet = (title, items) => {
      const ws = wb.addWorksheet(title)
      ws.columns = [
        { header: 'Posición', key: 'pos', width: 10 },
        { header: 'Nombre', key: 'label', width: 50 },
        { header: 'Cantidad', key: 'count', width: 14 },
        { header: 'Porcentaje', key: 'percent', width: 14 }
      ]
      items.forEach((item, index) => {
        ws.addRow({
          pos: index + 1,
          label: item.label,
          count: item.count,
          percent: `${item.percent.toFixed(1)}%`
        })
      })
    }

    const type = filtersApplied.analysisType
    if (type === 'all' || type === 'menus') addRankingSheet('Menus', mainMenuRanking.items)
    if (type === 'all' || type === 'options') addRankingSheet('Opciones', optionRanking.items)
    if (type === 'all' || type === 'sides') addRankingSheet('Guarniciones', sidesRanking.items)
    if (type === 'all' || type === 'beverages') addRankingSheet('Bebidas', beveragesRanking.items)
    addComparisonSheet(wb)

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const fileName = `tendencias-${filtersApplied.range.start || 'inicio'}-a-${filtersApplied.range.end || 'fin'}.xlsx`
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1200)
  }

  const analysisType = filtersApplied.analysisType
  const showMenus = analysisType === 'all' || analysisType === 'menus'
  const showSides = analysisType === 'all' || analysisType === 'sides'
  const showBeverages = analysisType === 'all' || analysisType === 'beverages'

  const insights = useMemo(() => {
    if (loading) return []
    const items = []
    const signedPercent = (value) => {
      if (!Number.isFinite(value)) return null
      const sign = value > 0 ? '+' : ''
      return `${sign}${value.toFixed(1)}%`
    }
    const signedPp = (value) => {
      const number = Number(value || 0)
      const sign = number > 0 ? '+' : ''
      return `${sign}${number.toFixed(1)} pp`
    }
    const topMain = mainMenuRanking.items[0]
    if (topMain?.label) {
      const label = topMain.label
      const pct = Number.isFinite(topMain.percent) ? topMain.percent.toFixed(1) : null
      const normalized = label.toLowerCase()
      if (normalized.includes('menú principal') || normalized.includes('menu principal') || normalized.includes('plato principal')) {
        if (pct) items.push(`El plato principal lidera con ${pct}% de los pedidos`)
      } else if (pct) {
        items.push(`${label} lidera con ${pct}% de los pedidos`)
      }
    }
    const topBeverageItem = beveragesRanking.items[0]
    if (topBeverageItem?.label && Number.isFinite(topBeverageItem.percent)) {
      items.push(`${topBeverageItem.label} representa el ${topBeverageItem.percent.toFixed(1)}% de las bebidas`)
    }
    const topSideItem = sidesRanking.items[0]
    if (topSideItem?.label) {
      items.push(`${topSideItem.label} es la guarnición más elegida`)
    }
    if (comparison) {
      if (comparison.total.noPreviousData) {
        items.push('El período comparado no tiene datos para contrastar.')
      } else {
        const totalPct = signedPercent(comparison.total.percent)
        items.push(`Pedidos analizados: ${comparison.total.delta >= 0 ? '+' : ''}${comparison.total.delta}${totalPct ? ` (${totalPct})` : ''} vs. período comparado.`)
        const changedLeader = Object.values(comparison.leaders || {}).find((metric) => metric?.leaderChanged)
        if (changedLeader) {
          items.push(`${changedLeader.label} lidera ahora; antes lideraba ${changedLeader.previousLabel}.`)
        }
        const beverageDelta = comparison.leaders?.beverage
        if (beverageDelta?.label && beverageDelta.label !== '—') {
          items.push(`${beverageDelta.label} cambió ${signedPp(beverageDelta.ppDelta)} en bebidas.`)
        }
      }
    }
    return items.slice(0, 6)
  }, [loading, mainMenuRanking.items, beveragesRanking.items, sidesRanking.items, comparison])

  const buildRankingRows = (items, limit = 5) => (items || [])
    .slice(0, limit)
    .map((item, idx) => ({
      ...item,
      rank: idx + 1
    }))

  return (
    <div className="monthly-page min-h-screen bg-[#f6f7f9] py-6">
      <div className="monthly-container w-full max-w-295 mx-auto space-y-4 px-3 sm:px-4 md:px-6 pb-20 bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="bg-linear-to-r from-blue-600 to-blue-800 rounded-2xl p-4 md:p-5 text-white shadow-xl mt-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 md:h-10 md:w-10" />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Tendencias</h1>
              <p className="text-blue-200 text-base md:text-lg">
                Panel analítico de pedidos con datos históricos reales.
              </p>
            </div>
          </div>
        </div>

        <TrendsFilters
          companies={companyOptions}
          company={filtersDraft.company}
          onCompanyChange={(value) => setFiltersDraft(prev => ({ ...prev, company: value }))}
          dateFrom={filtersDraft.range.start}
          dateTo={filtersDraft.range.end}
          onDateFromChange={(value) => setFiltersDraft(prev => ({ ...prev, range: { ...prev.range, start: value } }))}
          onDateToChange={(value) => setFiltersDraft(prev => ({ ...prev, range: { ...prev.range, end: value } }))}
          analysisType={filtersDraft.analysisType}
          onAnalysisTypeChange={(value) => setFiltersDraft(prev => ({ ...prev, analysisType: value }))}
          comparisonMode={filtersDraft.comparisonMode}
          onComparisonModeChange={(value) => setFiltersDraft(prev => ({ ...prev, comparisonMode: value }))}
          chartType={chartType}
          onChartTypeChange={handleChartTypeChange}
          onApply={handleApply}
          onClear={handleClear}
          onExport={handleExport}
          isDirty={isDirty}
          isLoading={loading}
          isRangeValid={isRangeValid}
          excelLogo={excelLogo}
          exportCount={loading ? 0 : totalOrders}
        />

        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              <span className="text-2xl mr-2">📊</span>
              Insight del período
            </h2>
            <span className="text-xs font-semibold text-slate-500">{companyLabel}</span>
          </div>
          <ul className="mt-3 space-y-2 text-base sm:text-lg text-slate-700 font-semibold">
            {insights.length === 0 && (
              <li>No hay suficientes datos para generar insights en este rango.</li>
            )}
            {insights.map((insight, idx) => (
              <li key={`${insight}-${idx}`}>• {insight}</li>
            ))}
          </ul>
        </div>

        <TrendsSummaryCards
          totalOrders={loading ? '—' : totalOrders}
          topMenu={loading ? '—' : topMenu}
          topBife={loading ? '—' : topBife}
          topSide={loading ? '—' : topSide}
          topBeverage={loading ? '—' : topBeverage}
          comparison={loading ? null : comparison}
        />

        {error && (
          <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl p-4 text-sm font-semibold">
            Ocurrió un error al cargar las tendencias. Intenta nuevamente.
          </div>
        )}

        <section className="grid gap-6">
          <TrendsCharts
            menuRanking={showMenus ? comparedMenuItems.slice(0, 8) : []}
            sidesRanking={[]}
            beveragesRanking={[]}
            showMenus={showMenus}
            showSides={false}
            showBeverages={false}
            menuTitle="Menús + Opciones más pedidos"
            menuSubtitle="Comparativo entre menú principal y opciones"
            chartType={chartType}
            menuColors={menuColors}
            menuDonutSize={280}
            menuDonutStroke={32}
          />
        </section>

        {(showSides || showBeverages) && (
          <section className="grid gap-6 md:grid-cols-2">
            {showSides && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">Guarniciones más pedidas</h3>
                  <span className="text-xs font-semibold text-slate-500">Top 5</span>
                </div>
                <div className="mt-4 space-y-3">
                  {buildRankingRows(comparedSideItems, 5).map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                            {item.rank}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">{item.label}</span>
                        </div>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-sm font-semibold text-slate-700">
                          <span>{item.count} · {(Number.isFinite(item.percent) ? item.percent.toFixed(1) : '0.0')}%</span>
                          {item.comparison && <span className="text-slate-400">|</span>}
                          <RankingComparisonText comparison={item.comparison} />
                        </span>
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-2 w-full bg-emerald-50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min((item.percent || 0), 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {sidesRanking.items.length === 0 && (
                    <p className="text-sm text-slate-500">Sin datos para guarniciones.</p>
                  )}
                </div>
              </div>
            )}
            {showBeverages && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">Bebidas más pedidas</h3>
                  <span className="text-xs font-semibold text-slate-500">Top 5</span>
                </div>
                <div className="mt-4 space-y-3">
                  {buildRankingRows(comparedBeverageItems, 5).map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="h-8 w-8 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-sm">
                            {item.rank}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">{item.label}</span>
                        </div>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-sm font-semibold text-slate-700">
                          <span>{item.count} · {(Number.isFinite(item.percent) ? item.percent.toFixed(1) : '0.0')}%</span>
                          {item.comparison && <span className="text-slate-400">|</span>}
                          <RankingComparisonText comparison={item.comparison} />
                        </span>
                      </div>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-2 w-full bg-amber-50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.min((item.percent || 0), 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {beveragesRanking.items.length === 0 && (
                    <p className="text-sm text-slate-500">Sin datos para bebidas.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {analysisType === 'options' && (
          <div className="grid gap-6">
            <TrendsCharts
              menuRanking={comparedOptionItems.slice(0, 8)}
              sidesRanking={[]}
              beveragesRanking={[]}
              showMenus
              showSides={false}
              showBeverages={false}
              menuTitle="Opciones más pedidas"
              menuSubtitle="Ranking de opciones 1 a 6"
              chartType={chartType === 'donut' ? 'bar' : chartType}
            />
          </div>
        )}

        {!loading && totalOrders === 0 && (
          <div className="border border-slate-200 bg-slate-50 rounded-xl p-5 text-sm text-slate-600 font-semibold">
            No hay pedidos para los filtros seleccionados. Probá con otra empresa o ampliá el rango de fechas.
          </div>
        )}
      </div>
    </div>
  )
}

export default TendenciasPage
