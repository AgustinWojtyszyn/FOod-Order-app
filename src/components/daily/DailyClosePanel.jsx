import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  XCircle
} from 'lucide-react'

const toneClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700'
}

const statusStyles = {
  ok: {
    icon: CheckCircle2,
    className: toneClasses.success,
    iconClassName: 'text-emerald-600'
  },
  warning: {
    icon: AlertTriangle,
    className: toneClasses.warning,
    iconClassName: 'text-amber-600'
  },
  error: {
    icon: XCircle,
    className: toneClasses.error,
    iconClassName: 'text-red-600'
  }
}

const overallIconByState = {
  ok: CheckCircle2,
  attention: AlertTriangle,
  failed: XCircle
}

const Chip = ({ children, tone = 'neutral' }) => (
  <span className={`inline-flex min-h-[30px] items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${toneClasses[tone] || toneClasses.neutral}`}>
    {children}
  </span>
)

const getReportLabel = (reportStatus = {}) => {
  if (reportStatus.state === 'sent') return 'Reporte automático: Enviado'
  if (reportStatus.state === 'failed' || reportStatus.state === 'unavailable') return 'Reporte automático: Falló'
  if (reportStatus.state === 'no_record') return 'Reporte automático: Sin registro'
  return 'Reporte automático: Pendiente'
}

const getArchiveLabel = (pendingCount = 0) => {
  if (pendingCount === 0) return 'Pendientes por archivar: 0'
  if (pendingCount === 1) return 'Pendientes por archivar: 1'
  return `Pendientes por archivar: ${pendingCount}`
}

const getInconsistencyLabel = (inconsistencyCount = 0) => `Inconsistencias: ${inconsistencyCount}`

const getChecklistItemLabel = (item, status) => {
  if (item?.id === 'report') return getReportLabel(status.reportStatus)
  if (item?.id === 'archive') return getArchiveLabel(status.pendingCount)
  if (item?.id === 'inconsistencies') return getInconsistencyLabel(status.inconsistencyCount)
  return item?.label || 'Control pendiente'
}

const ChecklistItem = ({ item, label }) => {
  const safeItem = item && typeof item === 'object' ? item : {}
  const styles = statusStyles[safeItem.status] || statusStyles.warning
  const Icon = styles.icon

  return (
    <li className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${styles.className}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${styles.iconClassName}`} />
      <div className="min-w-0">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs font-semibold opacity-80">{safeItem.detail || 'Sin detalle disponible'}</p>
      </div>
    </li>
  )
}

const DailyClosePanel = ({ status }) => {
  const safeStatus = status && typeof status === 'object' ? status : {}
  const [expanded, setExpanded] = useState(false)
  const overallStatus = safeStatus.overallStatus || { state: 'attention', label: 'Atención', tone: 'warning' }
  const OverallIcon = overallIconByState[overallStatus.state] || AlertTriangle
  const reportTone = safeStatus.reportStatus?.tone || 'warning'
  const autoArchiveStatus = safeStatus.archiveStatus || null
  const archiveTone = safeStatus.pendingCount > 0 ? 'warning' : 'success'
  const inconsistencyTone = safeStatus.inconsistencyCount > 0 ? 'error' : 'success'
  const hasContextWarning = safeStatus.isExportFiltered || safeStatus.totalOrders === 0
  const reportLabel = getReportLabel(safeStatus.reportStatus)
  const archiveLabel = getArchiveLabel(safeStatus.pendingCount)
  const inconsistencyLabel = getInconsistencyLabel(safeStatus.inconsistencyCount)
  const checklist = (Array.isArray(safeStatus.checklist) ? safeStatus.checklist : []).filter(Boolean)

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm print-hide">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex min-h-[32px] items-center gap-2 rounded-full border px-3 py-1 text-sm font-black ${toneClasses[overallStatus.tone] || toneClasses.warning}`}>
              <OverallIcon className="h-4 w-4" />
              Cierre: {overallStatus.label}
            </span>
            <h2 className="text-sm font-black text-slate-900">Cierre diario operativo</h2>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              {safeStatus.lastUpdatedLabel || 'Sin actualización'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={reportTone}>{reportLabel}</Chip>
          {autoArchiveStatus && (
            <Chip tone={autoArchiveStatus.tone}>
              <span>{autoArchiveStatus.label}</span>
              {autoArchiveStatus.detail && (
                <span className="font-semibold opacity-80">· {autoArchiveStatus.detail}</span>
              )}
            </Chip>
          )}
          <Chip tone={archiveTone}>{archiveLabel}</Chip>
          <Chip tone={inconsistencyTone}>{inconsistencyLabel}</Chip>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" />
                Ocultar checklist
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" />
                Ver checklist
              </>
            )}
          </button>
        </div>
      </div>

      {hasContextWarning && !expanded && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          {safeStatus.totalOrders === 0 && <span>Sin pedidos para esta fecha.</span>}
          {safeStatus.isExportFiltered && <span>Exportación filtrada por {safeStatus.exportCompany}.</span>}
        </div>
      )}

      {expanded && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {checklist.map((item, index) => (
              <ChecklistItem
                key={item.id || `checklist-${index}`}
                item={item}
                label={getChecklistItemLabel(item, safeStatus)}
              />
            ))}
          </ul>
          {safeStatus.isExportFiltered && (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              Las exportaciones manuales están filtradas por empresa: {safeStatus.exportCompany}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export default DailyClosePanel
