import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Eye, FileText, Printer, RotateCcw } from 'lucide-react'
import { db } from '../../supabaseClient'
import { addDaysToISO, getTodayISOInTimeZone } from '../../utils/dateUtils'
import { filterOrdersByCompany } from '../../utils/daily/dailyOrderCalculations'
import {
  buildCompanyGroups,
  buildRemitoSnapshot,
  downloadRemitoWorkbook,
  getOrderIds,
  getRemitoIssueFallbackMessage,
  isRemitoNumberInCompanyRange,
  remitoFromSnapshot
} from '../../utils/daily/exportDailyOrderNotesExcel'
import { getUserFriendlyErrorMessage } from '../../utils'
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notice'

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const getRemitoStatus = (remito = {}) => {
  const status = String(remito.status || '').toLowerCase()
  if (status === 'cancelled') return { label: 'ANULADO', tone: 'bg-red-50 text-red-700 border-red-200' }
  if (remito.remito_number || status === 'issued') return { label: 'EMITIDO', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  return { label: 'SIN EMITIR', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
}

const getIssuerLabel = (remito = {}) =>
  remito.issued_by_name || remito.issued_by_email || remito.issued_by || '-'

const buildLocationOptions = (orders = []) => {
  const locations = new Set()
  orders.forEach((order) => {
    const location = String(order?.location || order?.delivery_location || '').trim()
    if (location) locations.add(location)
  })
  return [...locations].sort((a, b) => a.localeCompare(b))
}

const filterOrdersForRemitos = ({ orders = [], companySlug = 'all', location = 'all' } = {}) => {
  const companyFiltered = filterOrdersByCompany(orders, companySlug)
  return companyFiltered.filter((order) => {
    const status = String(order?.status || '').toLowerCase()
    if (!['pending', 'archived'].includes(status)) return false
    if (location === 'all') return true
    return String(order?.location || order?.delivery_location || '').trim() === location
  })
}

const buildRequestId = ({ group, deliveryDate, locationKey }) =>
  [
    'retro-remito',
    group?.slug,
    deliveryDate,
    locationKey || 'all',
    getOrderIds(group?.orders || []).sort().join(',')
  ].join(':')

const DailyRemitosPanel = ({
  orders,
  deliveryDate,
  exportCompany,
  onExportCompanyChange,
  companyOptions,
  onDeliveryDateChange,
  onRefresh
}) => {
  const [locationFilter, setLocationFilter] = useState('all')
  const [remitos, setRemitos] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState('')
  const today = getTodayISOInTimeZone()

  const locationOptions = useMemo(() => buildLocationOptions(orders), [orders])
  const locationKey = locationFilter === 'all' ? '' : normalizeText(locationFilter)
  const filteredOrders = useMemo(() => filterOrdersForRemitos({
    orders,
    companySlug: exportCompany,
    location: locationFilter
  }), [exportCompany, locationFilter, orders])

  const buildGroupsForOrders = useCallback((orderRows = []) => buildCompanyGroups(filterOrdersForRemitos({
    orders: orderRows,
    companySlug: exportCompany,
    location: locationFilter
  })), [exportCompany, locationFilter])

  const groups = useMemo(() => buildCompanyGroups(filteredOrders), [filteredOrders])
  const remitosByCompany = useMemo(() => {
    const map = new Map()
    remitos.forEach((remito) => {
      const key = `${remito.company_slug || remito.companySlug || ''}:${remito.location_key || ''}`
      map.set(key, remito)
    })
    return map
  }, [remitos])

  const loadRemitos = useCallback(async () => {
    if (!deliveryDate) return
    setLoading(true)
    try {
      const { data, error } = await db.getCompanyRemitosForDate({
        deliveryDate,
        companySlug: exportCompany,
        locationKey
      })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cargar los remitos de la fecha.'))
        setRemitos([])
        return []
      }
      const rows = Array.isArray(data) ? data : []
      setRemitos(rows)
      return rows
    } finally {
      setLoading(false)
    }
  }, [deliveryDate, exportCompany, locationKey])

  useEffect(() => {
    loadRemitos()
  }, [loadRemitos])

  const previewGroup = async (group) => {
    const snapshot = buildRemitoSnapshot({
      group,
      deliveryDate,
      status: 'draft'
    })
    const remito = {
      ...remitoFromSnapshot(snapshot),
      remitoNumber: 'SIN EMITIR'
    }
    await downloadRemitoWorkbook([remito], deliveryDate)
    notifyInfo('Vista previa generada. REMITO SIN EMITIR: no se asignó número ni se escribió en la base.')
  }

  const downloadIssued = async (remito, group = null) => {
    const snapshot = remito.snapshot && typeof remito.snapshot === 'object' ? remito.snapshot : {}
    const hasSnapshotProducts = Array.isArray(snapshot.products) && snapshot.products.length > 0
    const legacySnapshot = !hasSnapshotProducts && group
      ? buildRemitoSnapshot({
        group,
        remitoNumber: remito.remito_number,
        deliveryDate: remito.delivery_date || deliveryDate,
        issuedAt: remito.issued_at || null,
        issuedBy: remito.issued_by || null,
        status: remito.status || 'issued'
      })
      : snapshot
    const printable = remitoFromSnapshot(legacySnapshot, remito)
    await downloadRemitoWorkbook([printable], printable.deliveryDate || deliveryDate)
    notifySuccess(hasSnapshotProducts
      ? 'Remito descargado desde snapshot emitido.'
      : 'Remito histórico descargado reconstruyendo el detalle desde los pedidos de esa fecha.')
  }

  const issueGroup = async (group) => {
    const key = `${group.slug}:${locationKey || 'all'}`
    setBusyKey(key)
    try {
      const snapshot = buildRemitoSnapshot({
        group,
        deliveryDate,
        status: 'issued'
      })
      const { data, error } = await db.issueCompanyRemito({
        companySlug: group.slug,
        companyName: group.name,
        deliveryDate,
        orderIds: getOrderIds(group.orders),
        requestId: buildRequestId({ group, deliveryDate, locationKey }),
        snapshot,
        locationKey
      })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, getRemitoIssueFallbackMessage(group.displayName, error)))
        return
      }
      const issuedNumber = Number(data?.remito_number)
      if (!isRemitoNumberInCompanyRange(data?.company_slug || group.slug, issuedNumber)) {
        notifyError(`La nota de pedido para ${group.displayName} recibió un número fuera del rango de su empresa.`)
        return
      }
      await loadRemitos()
      await onRefresh?.()
      notifySuccess(data?.reused ? 'Remito ya emitido reutilizado sin avanzar numeración.' : `Remito emitido: N° ${issuedNumber}.`)
    } finally {
      setBusyKey('')
    }
  }

  const refreshIssuedSnapshot = async (group, existing, { silent = false, manageBusy = true } = {}) => {
    if (!existing?.remito_id) return false
    const key = `${group.slug}:${locationKey || 'all'}`
    if (manageBusy) setBusyKey(key)
    try {
      const issuedBy = existing?.snapshot?.issuedBy || {
        id: existing?.issued_by || null,
        email: existing?.issued_by_email || null,
        name: existing?.issued_by_name || null
      }
      const snapshot = buildRemitoSnapshot({
        group,
        remitoNumber: existing.remito_number,
        deliveryDate: existing.delivery_date || deliveryDate,
        issuedAt: existing.issued_at || null,
        issuedBy,
        status: existing.status || 'issued'
      })
      const orderIds = getOrderIds(group.orders)
      const { data, error } = await db.refreshCompanyRemitoSnapshot({
        remitoId: existing.remito_id,
        orderIds,
        snapshot,
        requestId: [
          'refresh-remito',
          existing.remito_id,
          orderIds.slice().sort().join(',')
        ].join(':')
      })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, `No pudimos actualizar el remito N° ${existing.remito_number}.`))
        return false
      }
      if (data) {
        setRemitos((prev) => (Array.isArray(prev) ? prev.map((row) => (
          row?.remito_id === data.remito_id ? data : row
        )) : prev))
      }
      if (!silent) {
        notifySuccess(`Remito N° ${data?.remito_number || existing.remito_number} actualizado con ${snapshot.totalItems} viandas.`)
      }
      return true
    } finally {
      if (manageBusy) setBusyKey('')
    }
  }

  const refreshVisibleIssuedSnapshots = async () => {
    const key = '__refresh_visible_remitos__'
    setBusyKey(key)
    try {
      const refreshedOrders = await onRefresh?.()
      const currentGroups = buildGroupsForOrders(Array.isArray(refreshedOrders) ? refreshedOrders : orders)
      const currentRemitos = await loadRemitos()
      const currentRemitosByCompany = new Map()
      ;(Array.isArray(currentRemitos) ? currentRemitos : []).forEach((remito) => {
        currentRemitosByCompany.set(`${remito.company_slug || remito.companySlug || ''}:${remito.location_key || ''}`, remito)
      })

      let refreshedCount = 0
      for (const group of currentGroups) {
        const existing = currentRemitosByCompany.get(`${group.slug}:${locationKey}`)
        if (!existing || String(existing.status || '').toLowerCase() === 'cancelled') continue
        const updated = await refreshIssuedSnapshot(group, existing, { silent: true, manageBusy: false })
        if (updated) refreshedCount += 1
      }

      await loadRemitos()
      if (refreshedCount > 0) {
        notifySuccess(`Remitos actualizados: ${refreshedCount}. La numeración no avanzó.`)
      } else {
        notifyInfo('No hay remitos emitidos para actualizar con los filtros actuales.')
      }
    } finally {
      setBusyKey('')
    }
  }

  return (
    <section className="space-y-4 print-hide">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label htmlFor="remito-date" className="text-xs font-semibold text-slate-600">Fecha de servicio</label>
            <div className="mt-1 flex items-center gap-1">
              <button type="button" className="rounded-lg border border-slate-300 p-2" onClick={() => onDeliveryDateChange(addDaysToISO(deliveryDate, -1))} aria-label="Día anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input id="remito-date" type="date" value={deliveryDate} onChange={(event) => onDeliveryDateChange(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
              <button type="button" className="rounded-lg border border-slate-300 p-2" onClick={() => onDeliveryDateChange(addDaysToISO(deliveryDate, 1))} aria-label="Día siguiente">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => onDeliveryDateChange(today)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
              Hoy
            </button>
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Empresa
            <select value={exportCompany} onChange={(event) => onExportCompanyChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
              <option value="all">Todas</option>
              {companyOptions.map((company) => (
                <option key={company.value} value={company.value}>{company.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Sede / ubicación
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
              <option value="all">Todas</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Remitos de la jornada</h2>
            <p className="text-xs font-semibold text-slate-500">{filteredOrders.length} pedidos considerados por delivery_date</p>
          </div>
          <button type="button" disabled={busyKey === '__refresh_visible_remitos__'} onClick={refreshVisibleIssuedSnapshots} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
            <RotateCcw className="mr-2 h-4 w-4" />
            Actualizar
          </button>
        </div>

        {loading && <p className="px-4 py-4 text-sm font-semibold text-slate-500">Cargando remitos...</p>}
        {!loading && groups.length === 0 && (
          <p className="px-4 py-4 text-sm font-semibold text-slate-500">No hay pedidos emitibles para los filtros seleccionados.</p>
        )}
        {!loading && groups.length > 0 && (
          <div className="divide-y divide-slate-100">
            {groups.map((group) => {
              const existing = remitosByCompany.get(`${group.slug}:${locationKey}`)
              const status = getRemitoStatus(existing)
              const snapshot = existing?.snapshot && typeof existing.snapshot === 'object' ? existing.snapshot : null
              const totalItems = snapshot?.totalItems ?? buildRemitoSnapshot({ group, deliveryDate }).totalItems
              const busy = busyKey === `${group.slug}:${locationKey || 'all'}`
              return (
                <div key={`${group.slug}:${locationKey || 'all'}`} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900">{group.displayName || group.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{group.orders.length} pedidos · {totalItems} viandas</p>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${status.tone}`}>{status.label}</span>
                    <p className="mt-1">N° {existing?.remito_number || '-'}</p>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    <p>Servicio: {deliveryDate}</p>
                    <p>Emisión: {existing?.issued_at ? new Date(existing.issued_at).toLocaleString('es-AR') : '-'}</p>
                    <p>Emitió: {getIssuerLabel(existing)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {!existing && (
                      <>
                        <button type="button" onClick={() => previewGroup(group)} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
                          <Eye className="mr-2 h-4 w-4" />
                          Vista previa
                        </button>
                        <button type="button" disabled={busy} onClick={() => issueGroup(group)} className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                          <FileText className="mr-2 h-4 w-4" />
                          Emitir
                        </button>
                      </>
                    )}
                    {existing && (
                      <>
                        <button type="button" disabled={busy} onClick={() => refreshIssuedSnapshot(group, existing)} className="inline-flex items-center rounded-lg border border-orange-200 px-3 py-2 text-sm font-bold text-orange-700 disabled:opacity-60">
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Actualizar
                        </button>
                        <button type="button" onClick={() => downloadIssued(existing, group)} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
                          <Download className="mr-2 h-4 w-4" />
                          Descargar
                        </button>
                        <button type="button" onClick={() => downloadIssued(existing, group)} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
                          <Printer className="mr-2 h-4 w-4" />
                          Reimprimir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default DailyRemitosPanel
