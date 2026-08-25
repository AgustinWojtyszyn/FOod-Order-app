import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, Eye, RefreshCw, X } from 'lucide-react'
import { db } from '../../supabaseClient'
import { notifyError, notifySuccess } from '../../utils/notice'
import { getUserFriendlyErrorMessage } from '../../utils'
import { downloadLateAdminExtraHistoryExcel } from '../../utils/daily/exportLateAdminExtraHistoryExcel'

const formatDate = (value = '') => {
  const raw = String(value || '').slice(0, 10)
  if (!raw) return '-'
  const [year, month, day] = raw.split('-').map(Number)
  if (!year || !month || !day) return raw
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

const formatDateTime = (value = '') => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const formatDateTimeFull = (value = '') => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const getStatusBadge = (status = '') => {
  if (status === 'closed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

const getStatusLabel = (status = '') => {
  if (status === 'closed') return 'Cerrado'
  return 'Abierto'
}

const getRowStatusLabel = (row = {}, dayStatus = '') => {
  if (row.deleted_at) return 'Eliminado'
  if (dayStatus === 'closed' || row.historical_status === 'closed') return 'Incluido en cierre'
  return 'Registrado'
}

const getDetailText = (row = {}) => {
  const snapshot = row.order_snapshot || {}
  const detail = row.detail || {}
  const items = Array.isArray(detail.items) ? detail.items : (Array.isArray(snapshot.items) ? snapshot.items : [])
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      return `${item.quantity || 1} x ${item.name || item.label || item.title || 'Ítem'}`
    })
    .filter(Boolean)
    .join(' · ') || 'Sin detalle'
}

const LateAdminExtraHistoryPanel = ({ operationalDate = '' }) => {
  const [selectedDate, setSelectedDate] = useState(operationalDate)
  const [days, setDays] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [detailRows, setDetailRows] = useState([])
  const [loadingDays, setLoadingDays] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [closingDate, setClosingDate] = useState('')

  const selectedStatus = selectedDay?.status || ''
  const selectedOperationalDate = selectedDay?.operational_date || ''
  const selectedTotals = useMemo(() => ({
    orders: detailRows.length,
    units: detailRows.reduce((sum, row) => sum + Number(row.total_items || 0), 0)
  }), [detailRows])

  const loadDays = async () => {
    setLoadingDays(true)
    try {
      const { data, error } = await db.getLateAdminExtraHistoryDays({
        fromDate: selectedDate || null,
        toDate: selectedDate || null
      })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cargar el histórico de extras.'))
        setDays([])
        setSelectedDay(null)
        setDetailRows([])
        return
      }
      const nextDays = Array.isArray(data) ? data : []
      setDays(nextDays)
      if (nextDays.length > 0) {
        await viewDay(nextDays[0])
      } else {
        setSelectedDay(null)
        setDetailRows([])
      }
    } finally {
      setLoadingDays(false)
    }
  }

  useEffect(() => {
    loadDays()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const viewDay = async (day) => {
    setSelectedDay(day)
    setLoadingDetail(true)
    try {
      const { data, error } = await db.getLateAdminExtraHistoryForDay({ operationalDate: day.operational_date })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cargar el detalle histórico de extras.'))
        setDetailRows([])
        return
      }
      setDetailRows(Array.isArray(data) ? data : [])
    } finally {
      setLoadingDetail(false)
    }
  }

  const downloadExcel = async (day) => {
    const { data: closure, error } = await db.getLateAdminExtraClosure({ operationalDate: day.operational_date })
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos obtener el cierre para descargar.'))
      return
    }
    let rows = detailRows
    if (!closure && selectedOperationalDate !== day.operational_date) {
      const detail = await db.getLateAdminExtraHistoryForDay({ operationalDate: day.operational_date })
      rows = Array.isArray(detail.data) ? detail.data : []
    }
    const { fileName } = await downloadLateAdminExtraHistoryExcel({
      operationalDate: day.operational_date,
      rows,
      closure,
      status: closure ? 'closed' : 'open'
    })
    notifySuccess(`Excel generado: ${fileName}`)
  }

  const closeDay = async (day) => {
    setClosingDate(day.operational_date)
    try {
      const { data, error } = await db.closeLateAdminExtraOperationalDay({ operationalDate: day.operational_date })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cerrar el histórico de extras.'))
        return
      }
      notifySuccess('Histórico de extras cerrado.')
      const closedDay = {
        ...day,
        status: 'closed',
        closure_id: data?.id || day.closure_id,
        closure_version: data?.version || day.closure_version,
        closed_at: data?.closed_at || day.closed_at,
        total_orders: data?.total_orders ?? day.total_orders,
        total_units: data?.total_units ?? day.total_units,
        window_started_at: data?.window_started_at || day.window_started_at,
        window_closed_at: data?.window_closed_at || day.window_closed_at
      }
      setDays((prev) => prev.map((item) => item.operational_date === day.operational_date ? closedDay : item))
      await viewDay(closedDay)
    } finally {
      setClosingDate('')
    }
  }

  return (
    <section className="space-y-4 print-hide">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Histórico de extras</h2>
            <p className="text-sm font-semibold text-slate-600">Pedidos extra agregados en la fecha de entrega seleccionada.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">
              Fecha de entrega
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="mt-1 h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold" />
            </label>
            <button type="button" onClick={loadDays} disabled={loadingDays} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-black text-white disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loadingDays ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Rango</th>
                <th className="px-4 py-3 text-right">Pedidos</th>
                <th className="px-4 py-3 text-right">Viandas</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {days.map((day) => (
                <tr key={day.operational_date} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{formatDate(day.operational_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTimeFull(day.window_started_at)} → {formatDateTimeFull(day.window_closed_at)}</td>
                  <td className="px-4 py-3 text-right font-bold">{day.total_orders}</td>
                  <td className="px-4 py-3 text-right font-bold">{day.total_units}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-black ${getStatusBadge(day.status)}`}>
                      {getStatusLabel(day.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => viewDay(day)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-black text-slate-700 hover:bg-slate-50">
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </button>
                      {day.status !== 'closed' && (
                        <button type="button" onClick={() => closeDay(day)} disabled={closingDate === day.operational_date} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Cerrar
                        </button>
                      )}
                      <button type="button" onClick={() => downloadExcel(day)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-black text-slate-700 hover:bg-slate-50">
                        <Download className="h-3.5 w-3.5" />
                        Excel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loadingDays && days.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-semibold text-slate-500">No hay jornadas históricas para mostrar.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDay && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900">{formatDate(selectedOperationalDate)}</h3>
              <div className="mt-1 flex flex-wrap gap-2 text-sm font-semibold text-slate-600">
                <span>{selectedTotals.orders} pedidos</span>
                <span>{selectedTotals.units} viandas</span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-black ${getStatusBadge(selectedStatus)}`}>
                  {getStatusLabel(selectedStatus)}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Ventana operativa: {formatDateTimeFull(selectedDay.window_started_at)} → {formatDateTimeFull(selectedDay.window_closed_at)}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          {loadingDetail ? (
            <div className="py-8 text-center font-semibold text-slate-500">Cargando detalle...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Carga</th>
                    <th className="px-3 py-2 text-left">Entrega</th>
                    <th className="px-3 py-2 text-left">Empresa</th>
                    <th className="px-3 py-2 text-left">Sede</th>
                    <th className="px-3 py-2 text-left">Detalle</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-left">Cargado por</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailRows.map((row) => (
                    <tr key={row.id} className={row.deleted_at ? 'bg-red-50/60' : ''}>
                      <td className="px-3 py-2 text-slate-600">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatDate(row.delivery_date || row.operational_date)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.company_name || row.company_slug || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.location || row.delivery_location || '-'}</td>
                      <td className="max-w-md px-3 py-2 text-slate-700">{getDetailText(row)}</td>
                      <td className="px-3 py-2 text-right font-bold">{row.total_items || 0}</td>
                      <td className="px-3 py-2 text-slate-700">{row.created_by_name || row.created_by_email || '-'}</td>
                      <td className="px-3 py-2">
                        {row.deleted_at ? (
                          <span className="font-black text-red-700">Eliminado</span>
                        ) : (
                          <span className="font-black text-emerald-700">{getRowStatusLabel(row, selectedStatus)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default LateAdminExtraHistoryPanel
