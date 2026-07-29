import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, db } from '../supabaseClient'
import RequireUser from './RequireUser'
import MonthlyExportActions from './monthly/MonthlyExportActions'
import MonthlyFilters from './monthly/MonthlyFilters'
import MonthlyHeader from './monthly/MonthlyHeader'
import MonthlySummary from './monthly/MonthlySummary'
import LoadingState from './ui/LoadingState'
import excelLogo from '../assets/logoexcel.png'
import { useMonthlyMetrics } from '../hooks/monthly/useMonthlyMetrics'
import { useMonthlyCompanyFilter } from '../hooks/monthly/useMonthlyCompanyFilter'
import { useMonthlyDateRange } from '../hooks/monthly/useMonthlyDateRange'
import { useMonthlyExport } from '../hooks/monthly/useMonthlyExport'

const MonthlyPanel = ({ user, loading }) => {
  const [showInstructions, setShowInstructions] = useState(false)
  const [, setDebugLogs] = useState([])
  const [debugEnabled, setDebugEnabled] = useState(true)
  const navigate = useNavigate()

  const pushLog = (label, data = {}) => {
    const entry = { ts: new Date().toISOString(), label, data }
    setDebugLogs(prev => [entry, ...prev].slice(0, 80))
    if (typeof window !== 'undefined') {
      window.__monthlyPanelLogs = window.__monthlyPanelLogs || []
      window.__monthlyPanelLogs.unshift(entry)
      if (window.__monthlyPanelLogs.length > 200) window.__monthlyPanelLogs.pop()
    }
  }

  const handlePrintPdf = () => window.print()

  const {
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
  } = useMonthlyMetrics({ supabase, db, pushLog })

  const {
    ALL_EMPRESAS,
    draftEmpresas,
    empresaFilter,
    empresaFilterSet,
    isEmpresaAll,
    empresasOptions,
    isEmpresasDirty,
    handleToggleDraftEmpresa,
    handleApplyEmpresas,
    handleClearEmpresas,
    ordersByDayForView,
    dailyDataForView,
    empresasForView,
    totalsForView
  } = useMonthlyCompanyFilter({ metrics, ordersByDay, dailyData })

  const {
    draftRange,
    setDraftRange,
    dateRange,
    isDraftValid,
    handleClearRange,
    handleApplyRange
  } = useMonthlyDateRange({
    pushLog,
    fetchMetrics,
    resetMetricsState,
    setMetricsLoading,
    setSelectedDate
  })

  const {
    canExportDaily,
    handleExportExcel,
    handleExportDailyExcel,
    handleExportAllExcel
  } = useMonthlyExport({
    metrics,
    dateRange,
    isEmpresaAll,
    empresaFilter,
    empresaFilterSet,
    dailyDataForView,
    ordersByDayForView,
    rangeOrders
  })

  useEffect(() => {
    if (!user?.id) return
    if (user.role !== 'admin' && user.user_metadata?.role !== 'admin') {
      navigate('/dashboard')
    }
  }, [user, navigate])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('debug') === '1') {
        setDebugEnabled(true)
      }
    } catch (err) {
      void err
    }
  }, [])

  useEffect(() => {
    if (!debugEnabled) return
    const id = setInterval(() => {
      if (typeof window === 'undefined') return
      const external = window.__monthlyPanelLogs || []
      if (external.length === 0) return
      setDebugLogs(prev => {
        const merged = [...external, ...prev]
        const seen = new Set()
        const uniq = []
        for (const e of merged) {
          const key = `${e.ts}|${e.label}|${JSON.stringify(e.data || {})}`
          if (seen.has(key)) continue
          seen.add(key)
          uniq.push(e)
        }
        return uniq.slice(0, 120)
      })
    }, 800)
    return () => clearInterval(id)
  }, [debugEnabled])

  return (
    <RequireUser user={user} loading={loading}>
      <div className="monthly-page min-h-screen bg-[#f6f7f9] py-6">
        <div
          className="monthly-container w-full max-w-295 mx-auto space-y-3 px-3 sm:px-4 md:px-6 pb-20 bg-white rounded-2xl shadow-sm border border-slate-200"
          style={{
            minHeight: '100vh',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { width: 100%; margin: 0; padding: 0; background: #fff !important; }
          .monthly-page { background: #fff !important; padding: 0 !important; }
          .monthly-container {
            max-width: 100% !important;
            width: 100% !important;
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
            zoom: 0.9;
          }
          .monthly-container table { width: 100% !important; table-layout: fixed; }
          .monthly-container th, .monthly-container td { word-break: break-word; }
          .monthly-container img { max-width: 100% !important; height: auto !important; }
          .monthly-container .w-full, .monthly-container .max-w-full { max-width: 100% !important; }
          .monthly-container * {
            box-shadow: none !important;
            overflow: visible !important;
          }
          .print-hide { display: none !important; }
          .print-no-break { page-break-inside: avoid; }
          .print-break { page-break-before: always; }
          .print-full-width { width: 100% !important; max-width: 100% !important; }
          .print-unclamp { overflow: visible !important; height: auto !important; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>
          <MonthlyHeader
            showInstructions={showInstructions}
            onToggleInstructions={() => setShowInstructions(prev => !prev)}
          />

          <MonthlyFilters
            draftRange={draftRange}
            onDraftRangeChange={setDraftRange}
            dateRange={dateRange}
            onClearRange={handleClearRange}
            onApplyRange={handleApplyRange}
            isDraftValid={isDraftValid}
            empresas={empresasOptions}
            allValue={ALL_EMPRESAS}
            draftEmpresas={draftEmpresas}
            onToggleDraftEmpresa={handleToggleDraftEmpresa}
            onApplyEmpresas={handleApplyEmpresas}
            onClearEmpresas={handleClearEmpresas}
            isEmpresasDirty={isEmpresasDirty}
          />

          <MonthlyExportActions
            metrics={metrics}
            canExportDaily={canExportDaily}
            dailyDataForView={dailyDataForView}
            onExportAllExcel={handleExportAllExcel}
            onExportExcel={handleExportExcel}
            onExportDailyExcel={handleExportDailyExcel}
            onPrintPdf={handlePrintPdf}
            excelLogo={excelLogo}
          />

          {metricsLoading && (
            <div className="mt-4 mx-auto max-w-2xl">
              <LoadingState
                message="Cargando métricas del rango..."
                description="Esto debería tardar solo un momento."
                tone="slate"
              />
            </div>
          )}
          {!metrics && !metricsLoading && (
            <div className="flex items-center justify-center text-center rounded-xl border border-slate-200 bg-white shadow-sm min-h-65">
              <div className="max-w-md px-4">
                <p className="text-base font-semibold text-slate-800">Selecciona un rango de fechas</p>
                <p className="text-sm text-slate-600 mt-1">
                  Aplica un rango para visualizar el resumen mensual y exportaciones.
                </p>
              </div>
            </div>
          )}
          {metrics && (
            <MonthlySummary
              totalsForView={totalsForView}
              dailyDataForView={dailyDataForView}
              ordersByDayForView={ordersByDayForView}
              empresasForView={empresasForView}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}
        </div>
      </div>
    </RequireUser>
  )
}

export default MonthlyPanel
