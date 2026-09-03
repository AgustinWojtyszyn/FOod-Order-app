import { useCallback, useEffect, useState } from 'react'
import ExcelJS from 'exceljs'
import { Download, RefreshCw } from 'lucide-react'
import { useAuthContext } from '../contexts/authContextValue'
import { getIgarretaIsemarConsumptionOrders } from '../services/consumptionReportService'
import { buildConsumptionReportModel, getMonthDates } from '../utils/consumptionReportCalculations'
import LoadingState from '../components/ui/LoadingState'

const pad = (value) => String(value).padStart(2, '0')
const currentDate = new Date()
const INITIAL_YEAR = currentDate.getFullYear()
const INITIAL_MONTH = currentDate.getMonth() + 1

const formatDate = (date) => `${pad(Number(date.slice(8, 10)))}/${date.slice(5, 7)}`

const ConsumptionReportPage = () => {
  const { isAdmin, isCompanyAdmin } = useAuthContext()
  const [year, setYear] = useState(INITIAL_YEAR)
  const [month, setMonth] = useState(INITIAL_MONTH)
  const [model, setModel] = useState(() => buildConsumptionReportModel([], getMonthDates(INITIAL_YEAR, INITIAL_MONTH)))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    const dates = getMonthDates(year, month)
    setLoading(true)
    setError('')
    const result = await getIgarretaIsemarConsumptionOrders({ startDate: dates[0], endDate: dates.at(-1) })
    if (result.error) {
      setModel(buildConsumptionReportModel([], dates))
      setError('No se pudo cargar el reporte de consumo.')
    } else {
      setModel(buildConsumptionReportModel(result.data, dates))
    }
    setLoading(false)
  }, [month, year])

  useEffect(() => {
    if (isAdmin || isCompanyAdmin) loadReport()
  }, [loadReport, isAdmin, isCompanyAdmin])

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ServiFood'
    workbook.created = new Date()
    const worksheet = workbook.addWorksheet('Consumo mensual')
    const headers = ['Usuario', ...model.dates.map(formatDate), 'Total mensual']
    worksheet.mergeCells(1, 1, 1, headers.length)
    worksheet.getCell('A1').value = 'Reporte de consumo · Igarreta Máquinas / Isemar'
    worksheet.mergeCells(2, 1, 2, headers.length)
    worksheet.getCell('A2').value = `Empresa: Igarreta Máquinas / Isemar | Mes: ${pad(month)}/${year} | Generado: ${new Date().toLocaleString('es-AR')}`
    worksheet.addRow([])
    worksheet.addRow(headers)
    model.rows.forEach((row) => worksheet.addRow([row.name, ...model.dates.map((date) => row.quantities[date]), row.monthlyTotal]))
    worksheet.addRow(['Total diario', ...model.dates.map((date) => model.dailyTotals[date]), model.grandTotal])
    worksheet.getColumn(1).width = 28
    model.dates.forEach((_, index) => { worksheet.getColumn(index + 2).width = 11 })
    worksheet.getColumn(headers.length).width = 16
    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }]
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => { cell.alignment = { vertical: 'middle', horizontal: 'center' } })
      if (rowNumber === 1 || rowNumber === 4 || rowNumber === worksheet.rowCount) row.font = { bold: true }
      if (rowNumber === 1 || rowNumber === 4) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } }
    })
    const buffer = await workbook.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `consumo_igarreta_isemar_${year}-${pad(month)}.xlsx`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="w-full space-y-5 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Consumo mensual</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Reporte de consumo · Igarreta Máquinas / Isemar</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-slate-700">Mes<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"><option value={1}>Enero</option><option value={2}>Febrero</option><option value={3}>Marzo</option><option value={4}>Abril</option><option value={5}>Mayo</option><option value={6}>Junio</option><option value={7}>Julio</option><option value={8}>Agosto</option><option value={9}>Septiembre</option><option value={10}>Octubre</option><option value={11}>Noviembre</option><option value={12}>Diciembre</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Año<input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value) || INITIAL_YEAR)} className="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2" /></label>
          <button type="button" onClick={exportExcel} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Download size={17} /> Exportar Excel</button>
          <button type="button" onClick={loadReport} disabled={loading} aria-label="Actualizar reporte" className="rounded-lg border border-slate-300 p-3 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={17} /></button>
        </div>
      </header>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <LoadingState message="Cargando consumo..." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-max border-collapse text-sm">
            <thead className="bg-slate-800 text-white"><tr><th className="sticky left-0 z-20 min-w-56 border-r border-slate-600 bg-slate-800 px-4 py-3 text-left">Usuario</th>{model.dates.map((date) => <th key={date} className="min-w-20 px-3 py-3 text-center">{formatDate(date)}</th>)}<th className="sticky right-0 z-20 min-w-32 border-l border-slate-600 bg-slate-800 px-4 py-3 text-center">Total mensual</th></tr></thead>
            <tbody>{model.rows.map((row) => <tr key={row.personKey} className="border-t border-slate-200"><th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 text-left font-semibold text-slate-800">{row.name}</th>{model.dates.map((date) => <td key={date} className="px-3 py-3 text-center text-slate-700">{row.quantities[date] || ''}</td>)}<td className="sticky right-0 z-10 border-l border-slate-200 bg-white px-4 py-3 text-center font-semibold text-slate-900">{row.monthlyTotal}</td></tr>)}<tr className="border-t-2 border-slate-400 bg-slate-100 font-bold"><th className="sticky left-0 z-10 bg-slate-100 px-4 py-3 text-left">Total diario</th>{model.dates.map((date) => <td key={date} className="px-3 py-3 text-center">{model.dailyTotals[date]}</td>)}<td className="sticky right-0 z-10 border-l border-slate-300 bg-slate-100 px-4 py-3 text-center">{model.grandTotal}</td></tr></tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default ConsumptionReportPage