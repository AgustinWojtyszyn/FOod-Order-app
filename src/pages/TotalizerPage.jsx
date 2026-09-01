import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { TOTALIZER_CONCEPTS, exportTotalizerWorkbook, totalizerService } from '../services/totalizerService'
import { notifyError } from '../utils/notice'

const SERVICES = [
  { id: 'all', label: 'Todos' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'cena', label: 'Cena' }
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const companyKey = (company) => company.company_slug || company.slug || company.company_name || company.name || 'sin_empresa'
const companyName = (company) => company.company_name || company.name || company.company_slug || company.slug || 'Sin empresa'
const SIDE_CONCEPT_CODE = 'guarniciones'

const buildPreviewRows = ({ rows, companies }) =>
  companies.map((company) => {
    const totals = Object.fromEntries(TOTALIZER_CONCEPTS.map((concept) => [concept.code, 0]))
    rows
      .filter((row) => row.company_slug === companyKey(company))
      .forEach((row) => {
        totals[row.concept_code] = (totals[row.concept_code] || 0) + Number(row.quantity || 0)
      })
    return {
      companyKey: companyKey(company),
      company: companyName(company),
      ...totals,
      total: Object.values(totals).reduce((sum, quantity) => sum + Number(quantity || 0), 0)
    }
  })

export default function TotalizerPage() {
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [service, setService] = useState('all')
  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [dates, setDates] = useState([])
  const [sideRows, setSideRows] = useState([])
  const [activeCompanyKey, setActiveCompanyKey] = useState('')
  const [loading, setLoading] = useState(false)

  const previewRows = useMemo(() => buildPreviewRows({ rows, companies }), [rows, companies])
  const activeCompany = useMemo(
    () => companies.find((company) => companyKey(company) === activeCompanyKey) || companies[0] || null,
    [activeCompanyKey, companies]
  )
  const activePreviewRow = useMemo(() => {
    if (!activeCompany) return null
    return previewRows.find((row) => row.companyKey === companyKey(activeCompany)) || null
  }, [activeCompany, previewRows])
  const activeSideRows = useMemo(() => {
    if (!activeCompany) return []
    const activeKey = companyKey(activeCompany)
    return sideRows.filter((row) => row.company_slug === activeKey)
  }, [activeCompany, sideRows])
  const activeDetailRows = useMemo(() => {
    if (!activePreviewRow) return []
    const hasDetailedSides = activeSideRows.length > 0
    const conceptRows = TOTALIZER_CONCEPTS
      .filter((concept) => !hasDetailedSides || concept.code !== SIDE_CONCEPT_CODE)
      .map((concept) => ({
        key: concept.code,
        label: concept.label,
        quantity: Number(activePreviewRow[concept.code] || 0)
      }))
      .filter((item) => item.quantity > 0)
    const sideTotals = new Map()
    activeSideRows.forEach((row) => {
      const label = row.side_label
      if (!label) return
      const current = sideTotals.get(label) || { key: `side:${label}`, label, quantity: 0 }
      current.quantity += Number(row.quantity || 0)
      sideTotals.set(label, current)
    })
    const sideDetailRows = Array.from(sideTotals.values()).filter((item) => item.quantity > 0)

    return [...conceptRows, ...sideDetailRows]
  }, [activePreviewRow, activeSideRows])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await totalizerService.getSummary({
      fromDate,
      toDate,
      service,
      companySlugs: []
    })
    setLoading(false)

    if (error) {
      console.error('[totalizer] summary error', error)
      notifyError(`No se pudo cargar Totalizadora. ${error.message || ''}`.trim())
      return
    }

    setRows(data.rows)
    setCompanies(data.companies)
    setDates(data.dates)
    setSideRows(data.sideRows)
  }, [fromDate, service, toDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (companies.length === 0) {
      setActiveCompanyKey('')
      return
    }
    if (!companies.some((company) => companyKey(company) === activeCompanyKey)) {
      setActiveCompanyKey(companyKey(companies[0]))
    }
  }, [activeCompanyKey, companies])

  const exportExcel = async () => {
    await exportTotalizerWorkbook({ fromDate, toDate, service, rows, companies, dates, sideRows })
  }

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="shrink-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administración</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-950">Totalizadora</h1>
            </div>

            <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 lg:flex-1 lg:grid-cols-4">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Fecha desde</span>
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-bold" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Fecha hasta</span>
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-bold" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Servicio</span>
                <select value={service} onChange={(event) => setService(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold">
                  {SERVICES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div className="flex min-w-0 items-end gap-2 sm:col-span-2 lg:col-span-1">
                <button type="button" onClick={loadData} disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  <RefreshCw className="h-4 w-4" /> Actualizar
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="flex justify-end">
          <button type="button" onClick={exportExcel} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60">
            <Download className="h-4 w-4" /> Exportar Totalizadora Excel
          </button>
        </div>

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-950">Vista previa</h2>
            <span className="text-sm font-bold text-slate-500">{loading ? 'Cargando...' : `${previewRows.length} empresa(s)`}</span>
          </div>

          {previewRows.length === 0 ? (
            <div className="py-8 text-center text-sm font-semibold text-slate-500">
              No hay datos para los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex min-w-0 flex-wrap gap-2 border-b border-slate-200 pb-3">
                {companies.map((company) => {
                  const key = companyKey(company)
                  const isActive = key === companyKey(activeCompany || {})
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveCompanyKey(key)}
                      className={`max-w-full rounded-md border px-3 py-2 text-sm font-extrabold transition ${
                        isActive
                          ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block max-w-[220px] truncate">{companyName(company)}</span>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-base font-extrabold uppercase text-slate-950">
                  {activePreviewRow?.company || companyName(activeCompany || {})}
                </h3>
                {activeDetailRows.length === 0 ? (
                  <div className="py-5 text-sm font-semibold text-slate-500">Sin conceptos para mostrar.</div>
                ) : (
                  <dl className="space-y-2 text-sm">
                    {activeDetailRows.map((item) => (
                      <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                        <dt className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-slate-700">{item.label}</dt>
                        <dd className="font-extrabold tabular-nums text-slate-950">{item.quantity}</dd>
                      </div>
                    ))}
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t border-slate-300 pt-3">
                      <dt className="font-extrabold uppercase text-slate-950">Total</dt>
                      <dd className="font-extrabold tabular-nums text-slate-950">{activePreviewRow?.total || 0}</dd>
                    </div>
                  </dl>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
