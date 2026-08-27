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

const buildPreviewRows = ({ rows, companies }) =>
  companies.map((company) => {
    const totals = Object.fromEntries(TOTALIZER_CONCEPTS.map((concept) => [concept.code, 0]))
    rows
      .filter((row) => row.company_slug === companyKey(company))
      .forEach((row) => {
        totals[row.concept_code] = (totals[row.concept_code] || 0) + Number(row.quantity || 0)
      })
    return {
      company: companyName(company),
      ...totals,
      total: Object.values(totals).reduce((sum, quantity) => sum + Number(quantity || 0), 0)
    }
  })

export default function TotalizerPage() {
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [service, setService] = useState('all')
  const [selectedCompanies, setSelectedCompanies] = useState([])
  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [dates, setDates] = useState([])
  const [loading, setLoading] = useState(false)

  const previewRows = useMemo(() => buildPreviewRows({ rows, companies }), [rows, companies])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await totalizerService.getSummary({
      fromDate,
      toDate,
      service,
      companySlugs: selectedCompanies
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
  }, [fromDate, selectedCompanies, service, toDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  const exportExcel = async () => {
    await exportTotalizerWorkbook({ fromDate, toDate, service, rows, companies, dates })
  }

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administración</p>
              <h1 className="mt-1 text-3xl font-extrabold text-slate-950">Totalizadora</h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 xl:min-w-[900px]">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Fecha desde</span>
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-bold" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Fecha hasta</span>
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-bold" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Servicio</span>
                <select value={service} onChange={(event) => setService(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold">
                  {SERVICES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="block lg:col-span-2">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Empresa</span>
                <select
                  multiple
                  value={selectedCompanies}
                  onChange={(event) => setSelectedCompanies(Array.from(event.target.selectedOptions).map((option) => option.value))}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold"
                >
                  {companies.map((company) => (
                    <option key={companyKey(company)} value={companyKey(company)}>{companyName(company)}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button type="button" onClick={loadData} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
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

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-3">Empresa</th>
                  {TOTALIZER_CONCEPTS.map((concept) => (
                    <th key={concept.code} className="py-3 px-3 text-right">{concept.label}</th>
                  ))}
                  <th className="py-3 pl-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td colSpan={TOTALIZER_CONCEPTS.length + 2} className="py-8 text-center font-semibold text-slate-500">
                      No hay datos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : previewRows.map((row) => (
                  <tr key={row.company} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-bold text-slate-800">{row.company}</td>
                    {TOTALIZER_CONCEPTS.map((concept) => (
                      <td key={concept.code} className="py-2 px-3 text-right">{row[concept.code] || 0}</td>
                    ))}
                    <td className="py-2 pl-3 text-right font-extrabold text-slate-950">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
