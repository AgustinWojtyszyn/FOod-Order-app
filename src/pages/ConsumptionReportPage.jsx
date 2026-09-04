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
  const { isAdmin, canViewConsumptionReport } = useAuthContext()
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
    if (isAdmin || canViewConsumptionReport) loadReport()
  }, [loadReport, isAdmin, canViewConsumptionReport])

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ServiFood'
    workbook.created = new Date()
    const worksheet = workbook.addWorksheet('Consumo mensual')
    const headers = ['Usuario', ...model.dates.map(formatDate), 'Total mensual']
    worksheet.addRow(headers)
    model.rows.forEach((row) => worksheet.addRow([row.name, ...model.dates.map((date) => row.quantities[date]), row.monthlyTotal]))
    worksheet.addRow(['Total diario', ...model.dates.map((date) => model.dailyTotals[date]), model.grandTotal])
    worksheet.getColumn(1).width = 32
    model.dates.forEach((_, index) => { worksheet.getColumn(index + 2).width = 9 })
    worksheet.getColumn(headers.length).width = 16
    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    worksheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: false
    }
    worksheet.properties.defaultRowHeight = 22

    const headerRowNumber = 1
    const totalRowNumber = worksheet.rowCount
    const totalColumnNumber = headers.length

    worksheet.eachRow((row, rowNumber) => {
      row.height = rowNumber === headerRowNumber ? 26 : 22
      row.eachCell((cell, columnNumber) => {
        const isHeader = rowNumber === headerRowNumber
        const isTotalRow = rowNumber === totalRowNumber
        const isTotalColumn = columnNumber === totalColumnNumber
        const isNameColumn = columnNumber === 1

        cell.alignment = {
          vertical: 'middle',
          horizontal: isNameColumn ? 'left' : 'center'
        }
        cell.font = {
          color: { argb: isHeader ? 'FFFFFFFF' : 'FF0F172A' },
          bold: isHeader || isTotalRow || isTotalColumn,
          size: 11
        }
        cell.border = {
          top: { style: isTotalRow ? 'medium' : 'thin', color: { argb: isTotalRow ? 'FF94A3B8' : 'FFE2E8F0' } },
          left: { style: isTotalColumn ? 'medium' : 'thin', color: { argb: isTotalColumn ? 'FF94A3B8' : 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        }

        if (isHeader) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } }
        } else if (isTotalRow) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
        } else if (isTotalColumn) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        }
      })
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
    <section className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Consumo mensual</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Reporte de consumo · IGARRETA + ISEMAR</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:p-3">
          <label className="text-sm font-semibold text-slate-700">Mes<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-xs"><option value={1}>Enero</option><option value={2}>Febrero</option><option value={3}>Marzo</option><option value={4}>Abril</option><option value={5}>Mayo</option><option value={6}>Junio</option><option value={7}>Julio</option><option value={8}>Agosto</option><option value={9}>Septiembre</option><option value={10}>Octubre</option><option value={11}>Noviembre</option><option value={12}>Diciembre</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Año<input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value) || INITIAL_YEAR)} className="mt-1 block min-h-10 w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-xs" /></label>
          <button type="button" onClick={exportExcel} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"><Download size={17} /> Exportar Excel</button>
          <button type="button" onClick={loadReport} disabled={loading} aria-label="Actualizar reporte" className="min-h-10 rounded-md border border-slate-300 bg-white p-2.5 text-slate-800 shadow-xs hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={17} /></button>
        </div>
      </header>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <LoadingState message="Cargando consumo..." /> : (
        <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-max border-separate border-spacing-0 text-sm text-slate-950">
            <thead className="sticky top-0 z-30 bg-slate-800 text-white"><tr><th className="sticky left-0 z-50 min-w-72 border-b border-r border-slate-600 bg-slate-800 px-5 py-4 text-left font-bold whitespace-nowrap">Usuario</th>{model.dates.map((date) => <th key={date} className="min-w-20 border-b border-r border-slate-700 bg-slate-800 px-3 py-4 text-center font-semibold whitespace-nowrap">{formatDate(date)}</th>)}<th className="sticky right-0 z-50 min-w-36 border-b border-l border-slate-500 bg-slate-800 px-5 py-4 text-center font-bold whitespace-nowrap shadow-[-8px_0_14px_-14px_rgba(15,23,42,0.65)]">Total mensual</th></tr></thead>
            <tbody>{model.rows.map((row) => <tr key={row.personKey} className="bg-white"><th className="sticky left-0 z-20 min-w-72 border-b border-r border-slate-200 bg-white px-5 py-3.5 text-left font-semibold text-slate-950 whitespace-nowrap shadow-[8px_0_14px_-16px_rgba(15,23,42,0.55)]">{row.name}</th>{model.dates.map((date) => <td key={date} className="min-w-20 border-b border-r border-slate-100 px-3 py-3.5 text-center text-slate-950 tabular-nums">{row.quantities[date] || ''}</td>)}<td className="sticky right-0 z-20 min-w-36 border-b border-l border-slate-300 bg-slate-50 px-5 py-3.5 text-center font-bold text-slate-950 tabular-nums shadow-[-8px_0_14px_-16px_rgba(15,23,42,0.55)]">{row.monthlyTotal}</td></tr>)}<tr className="bg-blue-50 font-bold text-slate-950"><th className="sticky left-0 z-20 min-w-72 border-t-2 border-r border-slate-300 bg-blue-50 px-5 py-4 text-left whitespace-nowrap shadow-[8px_0_14px_-16px_rgba(15,23,42,0.55)]">Total diario</th>{model.dates.map((date) => <td key={date} className="min-w-20 border-t-2 border-r border-slate-200 px-3 py-4 text-center text-slate-950 tabular-nums">{model.dailyTotals[date]}</td>)}<td className="sticky right-0 z-20 min-w-36 border-l border-t-2 border-slate-400 bg-blue-100 px-5 py-4 text-center font-extrabold text-slate-950 tabular-nums shadow-[-8px_0_14px_-16px_rgba(15,23,42,0.55)]">{model.grandTotal}</td></tr></tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default ConsumptionReportPage
