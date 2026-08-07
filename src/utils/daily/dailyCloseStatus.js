import { buildDailyOrdersSummary, formatTimeOnly } from './dailyOrdersExportModel'
import { getOperationalOrderUnits } from './dailyOrderCalculations'

const normalizeText = (value = '') => String(value || '').trim()

const countByStatus = (orders = [], status) =>
  (orders || []).reduce((sum, order) => (
    String(order?.status || '').toLowerCase() === status
      ? sum + getOperationalOrderUnits(order)
      : sum
  ), 0)

const normalizeDailyReportArchiveStatus = (run = null) => {
  const status = String(run?.archive_status || '').toLowerCase()
  if (!status) return null

  if (status === 'pending') {
    return {
      state: 'pending',
      label: 'Autoarchivado: Pendiente',
      tone: 'warning',
      detail: 'Pendiente de ejecución automática'
    }
  }

  if (status === 'archived') {
    const count = Number(run?.archived_count)
    const hasCount = Number.isFinite(count)
    const archivedAtLabel = run?.archived_at ? formatTimeOnly(run.archived_at) : ''
    const countLabel = hasCount
      ? `${count} pedido${count === 1 ? '' : 's'} archivado${count === 1 ? '' : 's'}`
      : 'Pedidos archivados'
    return {
      state: 'archived',
      label: 'Autoarchivado: Completado',
      tone: 'success',
      detail: archivedAtLabel ? `${countLabel} · ${archivedAtLabel}` : countLabel
    }
  }

  if (status === 'failed') {
    return {
      state: 'failed',
      label: 'Autoarchivado: Falló',
      tone: 'error',
      detail: 'No se pudieron archivar los pedidos automáticamente'
    }
  }

  return null
}

export const normalizeDailyReportRunStatus = (run = null, error = '') => {
  const errorMessage = normalizeText(error)
  if (errorMessage) {
    return {
      state: 'unavailable',
      label: 'No se pudo consultar',
      tone: 'error',
      lastRunAt: '',
      lastRunLabel: 'Sin dato',
      reportType: '',
      error: errorMessage
    }
  }

  if (!run) {
    return {
      state: 'no_record',
      label: 'Sin ejecución registrada',
      tone: 'warning',
      lastRunAt: '',
      lastRunLabel: 'Sin ejecución',
      reportType: '',
      error: ''
    }
  }

  const status = String(run.status || '').toLowerCase()
  const lastRunAt = run.sent_at || run.updated_at || run.created_at || ''
  const base = {
    rawStatus: status,
    lastRunAt,
    lastRunLabel: lastRunAt ? formatTimeOnly(lastRunAt) : 'Sin hora',
    reportType: run.report_type || '',
    ordersCount: Number.isFinite(Number(run.orders_count)) ? Number(run.orders_count) : null,
    recipientsCount: Number.isFinite(Number(run.recipients_count)) ? Number(run.recipients_count) : null,
    archiveStatus: normalizeDailyReportArchiveStatus(run),
    error: normalizeText(run.error)
  }

  if (status === 'sent' || status === 'sent_empty') {
    return {
      ...base,
      state: 'sent',
      label: status === 'sent_empty' ? 'Reporte enviado sin pedidos' : 'Reporte enviado',
      tone: 'success'
    }
  }

  if (status === 'failed') {
    return {
      ...base,
      state: 'failed',
      label: 'Reporte falló',
      tone: 'error'
    }
  }

  return {
    ...base,
    state: 'pending',
    label: status === 'running' ? 'Reporte en proceso' : 'Reporte pendiente',
    tone: 'warning'
  }
}

export const buildDailyCloseChecklist = ({
  totalOrders = 0,
  inconsistencyCount = 0,
  pendingCount = 0,
  reportStatus,
  lastUpdatedAt
} = {}) => {
  const hasOrders = totalOrders > 0
  const reportState = reportStatus?.state || 'no_record'

  return [
    {
      id: 'fresh-data',
      label: 'Datos actualizados',
      status: lastUpdatedAt ? 'ok' : 'warning',
      detail: lastUpdatedAt ? `Última actualización ${formatTimeOnly(lastUpdatedAt)}` : 'Actualización no confirmada'
    },
    {
      id: 'inconsistencies',
      label: inconsistencyCount === 0 ? 'Sin inconsistencias' : 'Inconsistencias detectadas',
      status: inconsistencyCount === 0 ? 'ok' : 'error',
      detail: inconsistencyCount === 0 ? 'No hay avisos críticos en los pedidos cargados' : `${inconsistencyCount} aviso${inconsistencyCount === 1 ? '' : 's'} para revisar`
    },
    {
      id: 'excel',
      label: 'Excel disponible',
      status: hasOrders ? 'ok' : 'warning',
      detail: hasOrders ? 'Listo para exportar' : 'Sin pedidos para exportar'
    },
    {
      id: 'share',
      label: 'WhatsApp/PDF disponible',
      status: hasOrders ? 'ok' : 'warning',
      detail: hasOrders ? 'Listo para compartir o imprimir' : 'Sin pedidos para compartir'
    },
    {
      id: 'report',
      label: reportStatus?.label || 'Reporte pendiente',
      status: reportState === 'sent' ? 'ok' : reportState === 'failed' || reportState === 'unavailable' ? 'error' : 'warning',
      detail: reportStatus?.lastRunLabel || 'Sin ejecución'
    },
    {
      id: 'archive',
      label: pendingCount === 0 ? 'Archivado realizado o sin pendientes' : 'Pedidos pendientes de archivar',
      status: pendingCount === 0 ? 'ok' : 'warning',
      detail: pendingCount === 0 ? 'No quedan pedidos pendientes' : `${pendingCount} pedido${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`
    }
  ]
}

export const getDailyCloseOverallStatus = ({
  totalOrders = 0,
  inconsistencyCount = 0,
  pendingCount = 0,
  reportStatus
} = {}) => {
  const reportState = reportStatus?.state || 'no_record'

  if (reportState === 'failed' || reportState === 'unavailable') {
    return {
      state: 'failed',
      label: 'Falló',
      tone: 'error'
    }
  }

  if (totalOrders === 0 || inconsistencyCount > 0 || pendingCount > 0 || reportState !== 'sent') {
    return {
      state: 'attention',
      label: 'Atención',
      tone: 'warning'
    }
  }

  return {
    state: 'ok',
    label: 'OK',
    tone: 'success'
  }
}

export const getDailyOperationalStatus = ({
  orders = [],
  deliveryDate = '',
  selectedStatus = 'all',
  reportRun = null,
  reportRunError = '',
  lastUpdatedAt = '',
  exportCompany = 'all'
} = {}) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const summary = buildDailyOrdersSummary(safeOrders, selectedStatus)
  const reportStatus = normalizeDailyReportRunStatus(reportRun, reportRunError)
  const totalOrders = safeOrders.reduce((sum, order) => sum + getOperationalOrderUnits(order), 0)
  const pendingCount = countByStatus(safeOrders, 'pending')
  const archivedCount = countByStatus(safeOrders, 'archived')
  const inconsistencyCount = summary.inconsistencies.length
  const overallStatus = getDailyCloseOverallStatus({
    totalOrders,
    inconsistencyCount,
    pendingCount,
    reportStatus
  })

  return {
    deliveryDate,
    totalOrders,
    totalItems: summary.totalItems,
    pendingCount,
    archivedCount,
    inconsistencyCount,
    inconsistencies: summary.inconsistencies,
    lastUpdatedAt,
    lastUpdatedLabel: lastUpdatedAt ? formatTimeOnly(lastUpdatedAt) : 'Sin actualización',
    overallStatus,
    reportStatus,
    archiveStatus: reportStatus.archiveStatus || null,
    exportCompany,
    isExportFiltered: exportCompany !== 'all',
    canArchivePending: pendingCount > 0,
    checklist: buildDailyCloseChecklist({
      totalOrders,
      inconsistencyCount,
      pendingCount,
      reportStatus,
      lastUpdatedAt
    })
  }
}
