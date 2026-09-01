import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Eye, FileText, Printer, RotateCcw } from 'lucide-react'
import { db } from '../../supabaseClient'
import { addDaysToISO, getTodayISOInTimeZone } from '../../utils/dateUtils'
import { filterOrdersByCompany } from '../../utils/daily/dailyOrderCalculations'
import {
  buildCompanyGroups,
  buildRemitoConfigBySlug,
  buildRemitoSnapshot,
  downloadRemitoWorkbook,
  getOrderIds,
  getOrderRemitoLocationKey,
  getOrderRemitoLocationLabel,
  getRemitoIssueFallbackMessage,
  isRemitoNumberInCompanyRange,
  isValidRemitoNumberingConfig,
  remitoFromSnapshot
} from '../../utils/daily/exportDailyOrderNotesExcel'
import { getUserFriendlyErrorMessage } from '../../utils'
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notice'
import { confirmAction } from '../../utils/confirm'

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const REMITO_PANEL_DEBUG_PREFIX = '[ServiFood remitos panel]'
const REFRESH_VISIBLE_REMITOS_KEY = '__refresh_visible_remitos__'
const REFRESH_ALL_REMITOS_KEY = '__refresh_all_remitos__'
const MULTILOCATION_REMITO_COMPANY_SLUGS = new Set(['epse', 'isemar'])

const getSafeRemito = (remito) =>
  remito && typeof remito === 'object' ? remito : {}

const getRemitoStatus = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  const status = String(safeRemito.status || '').toLowerCase()
  if (status === 'cancelled') return { label: 'ANULADO', tone: 'bg-red-50 text-red-700 border-red-200' }
  if (safeRemito.remito_number || status === 'issued') return { label: 'EMITIDO', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  return { label: 'SIN EMITIR', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
}

const getIssuerLabel = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  return safeRemito.issued_by_name || safeRemito.issued_by_email || safeRemito.issued_by || '-'
}

const getUpdaterLabel = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  const snapshotUpdater = safeRemito?.snapshot?.updatedBy || safeRemito?.snapshot?.refreshedBy || {}
  return safeRemito.updated_by_name ||
    safeRemito.updated_by_email ||
    snapshotUpdater.name ||
    snapshotUpdater.email ||
    ''
}

const getUpdatedAt = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  return safeRemito.updated_at || safeRemito?.snapshot?.updatedAt || safeRemito?.snapshot?.refreshedAt || ''
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('es-AR')
}

const getSnapshotOrderCount = (snapshot = {}, remito = {}) => {
  const count = Number(snapshot?.ordersCount)
  if (Number.isFinite(count)) return count
  if (Array.isArray(snapshot?.orderIds)) return snapshot.orderIds.length
  if (Array.isArray(remito?.order_ids)) return remito.order_ids.length
  return 0
}

const getSnapshotMenuTotal = (snapshot = {}) => {
  const total = Number(snapshot?.totalMenus ?? snapshot?.totalItems)
  return Number.isFinite(total) ? total : 0
}

const isMultiLocationRemitoCompany = (companySlug = '') =>
  MULTILOCATION_REMITO_COMPANY_SLUGS.has(normalizeText(companySlug))

const EXCLUDED_REMITO_COMPANY_SLUGS = new Set(['global', 'administracion_servifood'])

const canIssueRemitoForCompany = (companySlug = '', configBySlug = new Map()) => {
  const slug = normalizeText(companySlug)
  if (!slug || EXCLUDED_REMITO_COMPANY_SLUGS.has(slug)) return false
  return isValidRemitoNumberingConfig(configBySlug.get(slug))
}

const getRemitoSnapshot = (remito = {}) =>
  remito?.snapshot && typeof remito.snapshot === 'object' ? remito.snapshot : {}

const isCancelledRemito = (remito = {}) =>
  String(remito?.status || '').toLowerCase() === 'cancelled'

const hasRemitoNumberOrIssuedStatus = (remito = {}) =>
  Boolean(remito?.remito_number || String(remito?.status || '').toLowerCase() === 'issued')

const isOperationalRemito = (remito = {}) =>
  !isCancelledRemito(remito) && hasRemitoNumberOrIssuedStatus(remito)

const getRemitoOrderIdCount = (remito = {}) => {
  const snapshot = getRemitoSnapshot(remito)
  if (Array.isArray(snapshot.orderIds)) return snapshot.orderIds.length
  if (Array.isArray(remito?.order_ids)) return remito.order_ids.length
  return 0
}

const isEmptyIssuedRemito = (remito = {}) => {
  const snapshot = getRemitoSnapshot(remito)
  return isOperationalRemito(remito) &&
    getRemitoOrderIdCount(remito) === 0 &&
    getSnapshotOrderCount(snapshot, remito) === 0 &&
    getSnapshotMenuTotal(snapshot) === 0
}

const arraysMatchAsSet = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  const sortedLeft = left.map(String).sort()
  const sortedRight = right.map(String).sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

const buildLocationOptions = (orders = []) => {
  const locations = new Map()
  orders.forEach((order) => {
    const location = getOrderRemitoLocationLabel(order)
    const key = getOrderRemitoLocationKey(order) || normalizeText(location)
    if (location && key) locations.set(key, location)
  })
  return [...locations.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

const getOrderLocationKey = (order = {}) =>
  getOrderRemitoLocationKey(order) || normalizeText(order?.location || order?.delivery_location || '')

const filterOrdersForRemitos = ({ orders = [], companySlug = 'all', location = 'all' } = {}) => {
  const companyFiltered = filterOrdersByCompany(orders, companySlug)
  const selectedLocationKey = location === 'all' ? '' : normalizeText(location)
  return companyFiltered.filter((order) => {
    const status = String(order?.status || '').toLowerCase()
    if (!['pending', 'archived', 'post_report_extra'].includes(status)) return false
    if (location === 'all') return true
    return getOrderLocationKey(order) === selectedLocationKey
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

const getRemitoIdentityKey = ({ deliveryDate = '', companySlug = '', locationKey = '' } = {}) =>
  [deliveryDate, companySlug, locationKey || ''].join(':')

const getRemitoCompanySlug = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  return safeRemito.company_slug || safeRemito.companySlug || ''
}

const getRemitoLocationKey = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  return String(safeRemito.location_key ?? safeRemito.locationKey ?? '').trim()
}

const buildSyntheticGroupFromRemito = (remito = {}) => {
  const safeRemito = getSafeRemito(remito)
  const companySlug = getRemitoCompanySlug(safeRemito)
  const snapshot = getRemitoSnapshot(safeRemito)
  const companyName = safeRemito.company_name || safeRemito.companyName || snapshot.companyName || companySlug || 'Empresa'
  const companyDisplayName = snapshot.companyDisplayName || safeRemito.company_name || safeRemito.companyName || companyName
  return {
    slug: companySlug,
    name: companyName,
    displayName: companyDisplayName,
    locationKey: getRemitoLocationKey(remito),
    locationLabel: snapshot.locationLabel || '',
    orders: []
  }
}

export const buildDailyRemitoRows = ({
  groups = [],
  remitos = [],
  deliveryDate = '',
  locationKey = ''
} = {}) => {
  const remitosByCompany = new Map()
  remitos.filter(Boolean).forEach((remito) => {
    if (!isOperationalRemito(remito)) return
    const companySlug = getRemitoCompanySlug(remito)
    const remitoLocationKey = getRemitoLocationKey(remito)
    if (isMultiLocationRemitoCompany(companySlug) && !remitoLocationKey) return
    const key = getRemitoIdentityKey({
      deliveryDate: String(remito.delivery_date || remito.deliveryDate || deliveryDate || '').slice(0, 10),
      companySlug,
      locationKey: remitoLocationKey
    })
    remitosByCompany.set(key, remito)
  })

  const rows = []
  const seenKeys = new Set()

  groups.forEach((group) => {
    const rowLocationKey = group.locationKey ?? locationKey
    const key = getRemitoIdentityKey({
      deliveryDate,
      companySlug: group.slug,
      locationKey: rowLocationKey
    })
    rows.push({
      key,
      group: { ...group, locationKey: rowLocationKey },
      existing: remitosByCompany.get(key) || null
    })
    seenKeys.add(key)
  })

  remitos.filter(Boolean).forEach((remito) => {
    const companySlug = getRemitoCompanySlug(remito)
    const remitoDate = String(remito.delivery_date || remito.deliveryDate || deliveryDate || '').slice(0, 10)
    const rowLocationKey = getRemitoLocationKey(remito)
    const key = getRemitoIdentityKey({
      deliveryDate: remitoDate,
      companySlug,
      locationKey: rowLocationKey
    })
    if (seenKeys.has(key)) return
    if (!isOperationalRemito(remito)) return
    if (isEmptyIssuedRemito(remito)) return

    rows.push({
      key,
      group: buildSyntheticGroupFromRemito(remito),
      existing: remito
    })
    seenKeys.add(key)
  })

  return rows
}

const buildFreshGroupForRemito = ({
  orders = [],
  existing = {},
  fallbackGroup = {},
  deliveryDate = ''
} = {}) => {
  const safeExisting = getSafeRemito(existing)
  const targetSlug = safeExisting.company_slug || safeExisting.companySlug || fallbackGroup.slug || ''
  const targetDate = String(safeExisting.delivery_date || safeExisting.deliveryDate || deliveryDate || '').slice(0, 10)
  const targetLocationKey = String(safeExisting.location_key ?? fallbackGroup.locationKey ?? '').trim()
  if (isMultiLocationRemitoCompany(targetSlug) && !targetLocationKey) {
    return {
      slug: targetSlug || fallbackGroup.slug || '',
      name: safeExisting.company_name || safeExisting.companyName || fallbackGroup.name || targetSlug || 'Empresa',
      displayName: safeExisting.company_name || safeExisting.companyName || fallbackGroup.displayName || fallbackGroup.name || targetSlug || 'Empresa',
      locationKey: '',
      locationLabel: fallbackGroup.locationLabel || '',
      orders: []
    }
  }
  const freshOrders = (Array.isArray(orders) ? orders : []).filter((order) => {
    const status = String(order?.status || '').toLowerCase()
    if (!['pending', 'archived', 'post_report_extra'].includes(status)) return false
    if (targetDate && String(order?.delivery_date || '').slice(0, 10) !== targetDate) return false
    if (targetLocationKey && getOrderLocationKey(order) !== targetLocationKey) return false
    return true
  })
  const freshGroup = buildCompanyGroups(freshOrders).find((candidate) => (
    candidate.slug === targetSlug &&
    String(candidate.locationKey || '') === targetLocationKey
  ))
  if (freshGroup) return freshGroup

  return {
    slug: targetSlug || fallbackGroup.slug || '',
    name: safeExisting.company_name || safeExisting.companyName || fallbackGroup.name || targetSlug || 'Empresa',
    displayName: safeExisting.company_name || safeExisting.companyName || fallbackGroup.displayName || fallbackGroup.name || targetSlug || 'Empresa',
    locationKey: targetLocationKey,
    locationLabel: fallbackGroup.locationLabel || '',
    orders: []
  }
}

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
  const [remitoConfigs, setRemitoConfigs] = useState([])
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

  const groups = useMemo(() => buildCompanyGroups(filteredOrders), [filteredOrders])
  const remitoConfigBySlug = useMemo(() => buildRemitoConfigBySlug(remitoConfigs), [remitoConfigs])
  const remitoRows = useMemo(() => buildDailyRemitoRows({
    groups,
    remitos,
    deliveryDate,
    locationKey
  }), [deliveryDate, groups, locationKey, remitos])

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
      const rows = Array.isArray(data) ? data.filter(Boolean) : []
      setRemitos(rows)
      return rows
    } finally {
      setLoading(false)
    }
  }, [deliveryDate, exportCompany, locationKey])

  const loadRemitoConfigs = useCallback(async () => {
    const { data, error } = await db.getCompaniesRemitoConfig()
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cargar la configuración de numeración de notas de pedido.'))
      setRemitoConfigs([])
      return []
    }
    const rows = Array.isArray(data) ? data.filter(Boolean) : []
    setRemitoConfigs(rows)
    return rows
  }, [])

  useEffect(() => {
    loadRemitos()
  }, [loadRemitos])

  useEffect(() => {
    loadRemitoConfigs()
  }, [loadRemitoConfigs])

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
    const hasSnapshot = Array.isArray(snapshot.products) || Array.isArray(snapshot.orderIds)
    const legacySnapshot = !hasSnapshot && group
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
    notifySuccess(hasSnapshot
      ? 'Remito descargado desde snapshot emitido.'
      : 'Remito histórico descargado reconstruyendo el detalle desde los pedidos de esa fecha.')
  }

  const issueGroup = async (group) => {
    const rowLocationKey = group.locationKey ?? locationKey
    if (!canIssueRemitoForCompany(group?.slug, remitoConfigBySlug)) {
      notifyError('La empresa existe, pero no tiene configurados todos los datos de numeración de notas de pedido.')
      return
    }
    if (!Array.isArray(group?.orders) || group.orders.length === 0) {
      notifyError('No se puede emitir un remito sin pedidos.')
      return
    }
    const key = `${group.slug}:${rowLocationKey || 'all'}`
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
        requestId: buildRequestId({ group, deliveryDate, locationKey: rowLocationKey }),
        snapshot,
        locationKey: rowLocationKey
      })
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, getRemitoIssueFallbackMessage(group.displayName, error)))
        return
      }
      const issuedNumber = Number(data?.remito_number)
      if (!isRemitoNumberInCompanyRange(data?.company_slug || group.slug, issuedNumber, remitoConfigBySlug)) {
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

  const refreshIssuedSnapshot = async (group, existing, { silent = false, manageBusy = true, force = false } = {}) => {
    if (!existing?.remito_id) return false
    const rowLocationKey = group.locationKey ?? locationKey
    const key = `${group.slug}:${rowLocationKey || 'all'}`
    if (manageBusy && busyKey) return false

    if (!silent) {
      const confirmed = await confirmAction({
        title: `Actualizar remito N.º ${existing.remito_number}`,
        message: `Se actualizará el remito N.º ${existing.remito_number} con los pedidos vigentes de ${group.displayName || group.name} para el ${existing.delivery_date || deliveryDate}. Se conservará el mismo número.`,
        confirmText: 'Actualizar remito'
      })
      if (!confirmed) return false
    }

    if (manageBusy) setBusyKey(key)
    try {
      const refreshedOrders = await onRefresh?.()
      if (!Array.isArray(refreshedOrders)) {
        if (!silent) {
          notifyError('No pudimos obtener los pedidos vigentes para actualizar el remito. Intentá nuevamente.')
        }
        return false
      }
      const freshGroup = buildFreshGroupForRemito({
        orders: refreshedOrders,
        existing,
        fallbackGroup: group,
        deliveryDate
      })
      const orderIds = getOrderIds(freshGroup.orders)
      if (!Array.isArray(freshGroup.orders) || freshGroup.orders.length === 0) {
        if (!silent) notifyError('No se puede actualizar un remito con cero pedidos vigentes.')
        return false
      }
      const liveDraft = buildRemitoSnapshot({
        group: freshGroup,
        remitoNumber: existing.remito_number,
        deliveryDate: existing.delivery_date || deliveryDate,
        issuedAt: existing.issued_at || null,
        issuedBy: existing?.snapshot?.issuedBy || {
          id: existing?.issued_by || null,
          email: existing?.issued_by_email || null,
          name: existing?.issued_by_name || null
        },
        status: existing.status || 'issued'
      })
      const currentSnapshot = existing?.snapshot && typeof existing.snapshot === 'object' ? existing.snapshot : {}
      const sameOrders = arraysMatchAsSet(currentSnapshot.orderIds || existing.order_ids || [], orderIds)
      const sameTotals =
        getSnapshotOrderCount(currentSnapshot, existing) === liveDraft.ordersCount &&
        getSnapshotMenuTotal(currentSnapshot) === liveDraft.totalMenus &&
        Number(currentSnapshot.totalBeverages ?? 0) === Number(liveDraft.totalBeverages ?? 0) &&
        Number(currentSnapshot.totalDesserts ?? 0) === Number(liveDraft.totalDesserts ?? 0)

      if (!force && sameOrders && sameTotals) {
        if (!silent) notifyInfo('El remito ya coincide con los pedidos vigentes de la jornada.')
        return false
      }

      const { data, error } = await db.refreshCompanyRemitoSnapshot({
        remitoId: existing.remito_id,
        orderIds,
        snapshot: liveDraft,
        requestId: [
          'refresh-remito',
          existing.remito_id,
          orderIds.slice().sort().join(',')
        ].join(':')
      })
      if (error) {
        if (import.meta.env.DEV) {
          console.error('[refreshCompanyRemitoSnapshot] failed', {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            error,
            remitoId: existing?.remito_id,
            remitoNumber: existing?.remito_number,
            orderIds,
            snapshot: liveDraft
          })
        }
        if (!silent) {
          notifyError(getUserFriendlyErrorMessage(error, `No pudimos actualizar el remito N° ${existing.remito_number}.`))
        }
        return false
      }
      if (data) {
        setRemitos((prev) => {
          if (!Array.isArray(prev)) return [data]
          const found = prev.some((row) => row?.remito_id === data.remito_id)
          if (!found) return [...prev, data]
          return prev.map((row) => (
            row?.remito_id === data.remito_id ? { ...row, ...data } : row
          ))
        })
      }
      if (!silent) {
        notifySuccess(`Remito N.º ${data?.remito_number || existing.remito_number} actualizado correctamente sin modificar su numeración.`)
      }
      return true
    } finally {
      if (manageBusy) setBusyKey('')
    }
  }

  const refreshAllVisibleIssuedSnapshots = async () => {
    if (busyKey) return

    const issuedRows = remitoRows.filter(({ existing }) => (
      existing?.remito_id && String(existing?.status || '').toLowerCase() === 'issued'
    ))

    if (issuedRows.length === 0) {
      notifyInfo('No hay remitos emitidos visibles para actualizar.')
      return
    }

    setBusyKey(REFRESH_ALL_REMITOS_KEY)
    const updated = []
    const failed = []

    try {
      for (const { group, existing } of issuedRows) {
        const ok = await refreshIssuedSnapshot(group, existing, {
          silent: true,
          manageBusy: false,
          force: true
        })
        const label = `N° ${existing.remito_number || existing.remito_id}`
        if (ok) {
          updated.push(label)
        } else {
          failed.push(label)
        }
      }

      await loadRemitos()

      if (failed.length > 0) {
        notifyError(`Se actualizaron ${updated.length} remito(s). Fallaron: ${failed.join(', ')}.`)
      } else {
        notifySuccess(`Remitos actualizados correctamente: ${updated.length}.`)
      }
    } finally {
      setBusyKey('')
    }
  }

  const refreshVisibleIssuedSnapshots = async () => {
    const key = REFRESH_VISIBLE_REMITOS_KEY
    if (busyKey) return
    setBusyKey(key)
    try {
      await onRefresh?.()
      await loadRemitos()
      notifyInfo('Datos de remitos recargados.')
    } finally {
      setBusyKey('')
    }
  }

  const isPanelBusy = Boolean(busyKey)
  const isRefreshingVisible = busyKey === REFRESH_VISIBLE_REMITOS_KEY
  const isRefreshingAll = busyKey === REFRESH_ALL_REMITOS_KEY

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
              {(Array.isArray(companyOptions) ? companyOptions : []).filter(Boolean).map((company) => (
                <option key={company.value} value={company.value}>{company.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Sede / ubicación
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
              <option value="all">Todas</option>
              {locationOptions.map((location) => (
                <option key={location.key} value={location.key}>{location.label}</option>
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
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPanelBusy} onClick={refreshVisibleIssuedSnapshots} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
              <RotateCcw className="mr-2 h-4 w-4" />
              {isRefreshingVisible ? 'Recargando...' : 'Recargar'}
            </button>
            <button type="button" disabled={isPanelBusy} onClick={refreshAllVisibleIssuedSnapshots} className="inline-flex items-center rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700 disabled:opacity-60">
              <RotateCcw className="mr-2 h-4 w-4" />
              {isRefreshingAll ? 'Actualizando...' : 'Actualizar todos'}
            </button>
          </div>
        </div>

        {loading && <p className="px-4 py-4 text-sm font-semibold text-slate-500">Cargando remitos...</p>}
        {!loading && remitoRows.length === 0 && (
          <p className="px-4 py-4 text-sm font-semibold text-slate-500">No hay pedidos emitibles para los filtros seleccionados.</p>
        )}
        {!loading && remitoRows.length > 0 && (
          <div className="divide-y divide-slate-100">
            {remitoRows.map(({ key, group, existing }) => {
              const rowLocationKey = group.locationKey ?? locationKey
              const status = getRemitoStatus(existing)
              const snapshot = existing?.snapshot && typeof existing.snapshot === 'object' ? existing.snapshot : null
              let liveSnapshot
              try {
                liveSnapshot = buildRemitoSnapshot({ group, deliveryDate })
              } catch (error) {
                console.error(`${REMITO_PANEL_DEBUG_PREFIX} Error renderizando fila de remito`, {
                  error,
                  rowKey: key,
                  deliveryDate,
                  locationKey: rowLocationKey,
                  groupSlug: group?.slug,
                  groupName: group?.name,
                  ordersCount: Array.isArray(group?.orders) ? group.orders.length : null,
                  orderIds: Array.isArray(group?.orders) ? group.orders.map((order) => order?.id) : [],
                  remitoId: existing?.remito_id,
                  remitoNumber: existing?.remito_number,
                  existing,
                  group
                })
                throw error
              }
              const snapshotOrderCount = existing ? getSnapshotOrderCount(snapshot || {}, existing) : group.orders.length
              const totalItems = existing ? getSnapshotMenuTotal(snapshot || {}) : liveSnapshot.totalItems
              const busy = busyKey === `${group.slug}:${rowLocationKey || 'all'}`
              const canIssue = canIssueRemitoForCompany(group.slug, remitoConfigBySlug)
              const updatedAt = getUpdatedAt(existing)
              const updater = getUpdaterLabel(existing)
              return (
                <div key={key} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900">{group.displayName || group.name}</p>
                    <p className="text-xs font-semibold text-slate-500">{snapshotOrderCount} pedidos · {totalItems} viandas</p>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${status.tone}`}>{status.label}</span>
                    <p className="mt-1">N° {existing?.remito_number || '-'}</p>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    <p>Servicio: {deliveryDate}</p>
                    <p>Emisión: {formatDateTime(existing?.issued_at)}</p>
                    <p>Emitió: {getIssuerLabel(existing)}</p>
                    {updatedAt && (
                      <>
                        <p>Actualización: {formatDateTime(updatedAt)}</p>
                        <p>Actualizó: {updater || '-'}</p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {!existing && (
                      <>
                        <button type="button" disabled={isPanelBusy} onClick={() => previewGroup(group)} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
                          <Eye className="mr-2 h-4 w-4" />
                          Vista previa
                        </button>
                        {canIssue && (
                          <button type="button" disabled={isPanelBusy || busy} onClick={() => issueGroup(group)} className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                            <FileText className="mr-2 h-4 w-4" />
                            Emitir
                          </button>
                        )}
                        {!canIssue && (
                          <p className="max-w-52 text-xs font-semibold text-amber-700">
                            Numeración de nota de pedido sin configurar.
                          </p>
                        )}
                      </>
                    )}
                    {existing && (
                      <>
                        <button type="button" disabled={isPanelBusy || busy} onClick={() => refreshIssuedSnapshot(group, existing)} className="inline-flex items-center rounded-lg border border-orange-200 px-3 py-2 text-sm font-bold text-orange-700 disabled:opacity-60">
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Actualizar
                        </button>
                        <button type="button" disabled={isPanelBusy} onClick={() => downloadIssued(existing, group)} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
                          <Download className="mr-2 h-4 w-4" />
                          Descargar
                        </button>
                        <button type="button" disabled={isPanelBusy} onClick={() => downloadIssued(existing, group)} className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">
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
