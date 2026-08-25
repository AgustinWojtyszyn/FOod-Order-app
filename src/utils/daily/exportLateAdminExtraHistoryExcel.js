import ExcelJS from 'exceljs'
import { downloadWorkbook } from './dailyOrderCalculations'

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
const SUMMARY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const DELETED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
}

const formatDate = (value = '') => {
  const raw = String(value || '').slice(0, 10)
  if (!raw) return ''
  const [year, month, day] = raw.split('-').map(Number)
  if (!year || !month || !day) return raw
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

const formatDateTime = (value = '') => {
  if (!value) return ''
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

const formatTime = (value = '') => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const formatFileDate = (value = '') => formatDate(value).replaceAll('/', '-') || String(value || 'sin_fecha')

const normalizeRows = ({ closure = null, rows = [] } = {}) => {
  const snapshotRows = Array.isArray(closure?.snapshot?.rows) ? closure.snapshot.rows : null
  return snapshotRows || (Array.isArray(rows) ? rows : [])
}

const getItemsDetail = (row = {}) => {
  const snapshot = row.order_snapshot || row.orderSnapshot || {}
  const detail = row.detail || {}
  const items = Array.isArray(detail.items) ? detail.items : (Array.isArray(snapshot.items) ? snapshot.items : [])
  const responses = Array.isArray(detail.custom_responses)
    ? detail.custom_responses
    : (Array.isArray(snapshot.custom_responses) ? snapshot.custom_responses : [])
  const itemText = items
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const name = item.name || item.label || item.title || 'Ítem'
      const quantity = item.quantity || item.qty || item.count || 1
      return `${quantity} x ${name}`
    })
    .filter(Boolean)
    .join(' | ')
  const responseText = responses
    .map((response) => {
      if (!response || typeof response !== 'object') return ''
      const title = response.title || response.label || response.name || 'Opción'
      const value = response.answer ?? response.response ?? response.value ?? response.options ?? ''
      if (Array.isArray(value)) return `${title}: ${value.join(', ')}`
      if (value && typeof value === 'object') return `${title}: ${JSON.stringify(value)}`
      return `${title}: ${value}`
    })
    .filter(Boolean)
    .join(' | ')
  return [itemText, responseText].filter(Boolean).join(' | ')
}

const autoFitColumns = (worksheet, minWidth = 12, maxWidth = 52) => {
  worksheet.columns.forEach((column) => {
    let max = String(column.header || '').length
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value == null
        ? ''
        : typeof cell.value === 'object'
          ? String(cell.value.text || cell.value.result || JSON.stringify(cell.value))
          : String(cell.value)
      max = Math.max(max, value.length)
    })
    column.width = Math.min(Math.max(max + 2, minWidth), maxWidth)
  })
}

const buildWorkbook = ({ operationalDate, rows = [], closure = null, status = 'open' } = {}) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ServiFood'
  workbook.created = new Date()

  const normalizedRows = normalizeRows({ closure, rows })
  const totalOrders = Number(closure?.total_orders ?? closure?.totalOrders ?? normalizedRows.length ?? 0)
  const totalUnits = Number(closure?.total_units ?? closure?.totalUnits ?? normalizedRows.reduce((sum, row) => sum + Number(row.total_items || 0), 0))
  const windowStartedAt = closure?.window_started_at || closure?.windowStartedAt || normalizedRows[0]?.window_started_at || ''
  const windowClosedAt = closure?.window_closed_at || closure?.windowClosedAt || normalizedRows[0]?.window_closed_at || ''
  const closureStatus = status === 'closed' ? 'Cerrado' : 'Abierto'

  const summary = workbook.addWorksheet('Resumen')
  summary.columns = [
    { header: 'Concepto', key: 'concepto', width: 34 },
    { header: 'Valor', key: 'valor', width: 58 }
  ]
  summary.addRows([
    { concepto: 'HISTÓRICO DE EXTRAS', valor: closureStatus },
    { concepto: 'Fecha de entrega', valor: formatDate(operationalDate) },
    { concepto: 'Inicio ventana operativa', valor: formatDateTime(windowStartedAt) },
    { concepto: 'Fin ventana operativa', valor: formatDateTime(windowClosedAt) },
    { concepto: 'Ventana operativa', valor: `${formatDateTime(windowStartedAt)} -> ${formatDateTime(windowClosedAt)}` },
    { concepto: 'Pedidos extra', valor: totalOrders },
    { concepto: 'Viandas', valor: totalUnits },
    { concepto: 'Estado del cierre', valor: closureStatus }
  ])
  summary.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', bold: row.number === 1 }
      cell.fill = row.number === 1 ? HEADER_FILL : SUMMARY_FILL
      if (row.number === 1) cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } }
      cell.border = BORDER
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  })

  const details = workbook.addWorksheet('Pedidos extra')
  details.columns = [
    { header: 'Fecha de carga', key: 'createdDate' },
    { header: 'Hora de carga', key: 'createdTime' },
    { header: 'Fecha de entrega', key: 'deliveryDate' },
    { header: 'Empresa', key: 'company' },
    { header: 'Sede / ubicación', key: 'location' },
    { header: 'Detalle', key: 'detail' },
    { header: 'Cantidad', key: 'quantity' },
    { header: 'Cargado por', key: 'createdBy' },
    { header: 'Estado', key: 'status' },
    { header: 'Eliminado', key: 'deleted' },
    { header: 'Eliminado por', key: 'deletedBy' },
    { header: 'Motivo eliminación', key: 'deletedReason' }
  ]
  details.addRows(normalizedRows.map((row) => ({
    createdDate: formatDate(row.created_at || row.createdAt),
    createdTime: formatTime(row.created_at || row.createdAt),
    deliveryDate: formatDate(row.delivery_date || row.deliveryDate || row.operational_date || row.operationalDate || operationalDate),
    company: row.company_name || row.companyName || row.company_slug || row.companySlug || '',
    location: row.location || row.delivery_location || row.deliveryLocation || '',
    detail: getItemsDetail(row),
    quantity: Number(row.total_items ?? row.totalItems ?? 0),
    createdBy: row.created_by_name || row.createdByName || row.created_by_email || row.createdByEmail || '',
    status: row.deleted_at || row.deletedAt
      ? 'Eliminado'
      : status === 'closed' || row.historical_status === 'closed' || row.historicalStatus === 'closed'
        ? 'Incluido en cierre'
        : 'Registrado',
    deleted: row.deleted_at || row.deletedAt ? 'Sí' : 'No',
    deletedBy: row.deleted_by_name || row.deletedByName || row.deleted_by_email || row.deletedByEmail || '',
    deletedReason: row.deleted_reason || row.deletedReason || ''
  })))
  const header = details.getRow(1)
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = HEADER_FILL
    cell.border = BORDER
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  details.eachRow((row) => {
    if (row.number === 1) return
    const deleted = row.getCell('deleted').value === 'Sí'
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 }
      cell.fill = deleted ? DELETED_FILL : undefined
      cell.border = BORDER
      cell.alignment = { vertical: 'top', wrapText: true }
    })
  })
  details.views = [{ state: 'frozen', ySplit: 1 }]
  details.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: details.columnCount }
  }
  autoFitColumns(details)

  return workbook
}

export const downloadLateAdminExtraHistoryExcel = async ({ operationalDate, rows = [], closure = null, status = 'open' } = {}) => {
  const workbook = buildWorkbook({ operationalDate, rows, closure, status })
  const fileName = `Pedidos_Extra_${formatFileDate(operationalDate)}.xlsx`
  await downloadWorkbook(workbook, fileName)
  return { fileName }
}

export { buildWorkbook as buildLateAdminExtraHistoryWorkbook }
