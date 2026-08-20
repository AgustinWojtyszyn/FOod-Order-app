import ExcelJS from 'exceljs'
import { downloadWorkbook, filterOrdersByCompany } from './dailyOrderCalculations'
import {
  buildDailyOrdersExcelDetailRows,
  buildDailyOrdersExcelFileName,
  buildDailyOrdersSummary
} from './dailyOrdersExportModel'
import { notifyError, notifyInfo, notifySuccess } from '../notice'

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }
const SUMMARY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }

const applyHeaderStyle = (worksheet) => {
  const header = worksheet.getRow(1)
  header.font = HEADER_FONT
  header.fill = HEADER_FILL
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]

  if (worksheet.columnCount > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount }
    }
  }
}

const autoFitColumns = (worksheet, minWidth = 12, maxWidth = 48) => {
  worksheet.columns.forEach((column) => {
    let max = String(column.header || '').length
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? '' : String(cell.value)
      max = Math.max(max, value.length)
    })
    column.width = Math.min(Math.max(max + 2, minWidth), maxWidth)
  })
}

const addSectionRow = (worksheet, label) => {
  const row = worksheet.addRow({ Concepto: label, Valor: '' })
  row.font = { bold: true, color: { argb: 'FF111827' } }
  row.fill = SUMMARY_FILL
}

const addSummarySheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Resumen')
  worksheet.columns = [
    { header: 'Concepto', key: 'Concepto' },
    { header: 'Valor', key: 'Valor' }
  ]

  worksheet.addRows([
    { Concepto: 'Fecha de entrega', Valor: summary.deliveryDate || 'Sin fecha' },
    { Concepto: 'Estado exportado', Valor: summary.exportedStatus },
    { Concepto: 'Total de pedidos', Valor: summary.totalOrders },
    { Concepto: 'Cantidad de pedidos con comentarios', Valor: summary.commentsCount }
  ])

  addSectionRow(worksheet, 'Totales por ubicación / empresa')
  summary.byLocation.forEach((row) => {
    worksheet.addRow({ Concepto: row.label, Valor: `${row.orders} pedidos / ${row.items} ítems` })
  })

  addSectionRow(worksheet, 'Totales por lugar de entrega')
  ;(summary.byDeliveryLocation || []).forEach((row) => {
    worksheet.addRow({ Concepto: row.label, Valor: `${row.orders} pedidos / ${row.items} ítems` })
  })

  addSectionRow(worksheet, 'Totales por menú / opción')
  summary.byMenu.forEach((row) => {
    worksheet.addRow({ Concepto: row.label, Valor: row.quantity })
  })

  addSectionRow(worksheet, 'Totales por servicio / turno')
  summary.byService.forEach((row) => {
    worksheet.addRow({ Concepto: row.label, Valor: `${row.orders} pedidos / ${row.items} ítems` })
  })

  applyHeaderStyle(worksheet)
  autoFitColumns(worksheet)
}

const addDetailsSheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Pedidos Detallados')
  const rows = buildDailyOrdersExcelDetailRows(summary.rows.map((row) => row.original))
  worksheet.columns = Object.keys(rows[0] || {
    Cliente: '',
    'Ubicación / empresa': '',
    'Fecha de entrega': '',
    'Turno / servicio': '',
    'Menú elegido': '',
    Guarniciones: '',
    'Respuestas personalizadas': '',
    Comentarios: ''
  }).map((key) => ({ header: key, key }))
  worksheet.addRows(rows)
  applyHeaderStyle(worksheet)
  worksheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
  autoFitColumns(worksheet)
}

const addCommentsSheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Comentarios')
  worksheet.columns = [
    { header: 'Cliente', key: 'Cliente' },
    { header: 'Ubicación / Empresa', key: 'Ubicación / Empresa' },
    { header: 'Servicio / Turno', key: 'Servicio / Turno' },
    { header: 'Menú / Opción', key: 'Menú / Opción' },
    { header: 'Comentario', key: 'Comentario' }
  ]
  worksheet.addRows(summary.comments.map((row) => ({
    Cliente: row.cliente,
    'Ubicación / Empresa': row.ubicacion,
    'Servicio / Turno': row.servicio,
    'Menú / Opción': row.menuOpcion,
    Comentario: row.comentarios
  })))
  applyHeaderStyle(worksheet)
  autoFitColumns(worksheet)
}

const addInconsistenciesSheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Inconsistencias')
  worksheet.columns = [
    { header: 'Pedido', key: 'Pedido' },
    { header: 'Ubicación / Empresa', key: 'Ubicación / Empresa' },
    { header: 'Problema', key: 'Problema' }
  ]

  if (summary.inconsistencies.length) {
    worksheet.addRows(summary.inconsistencies.map((row) => ({
      Pedido: row.pedido,
      'Ubicación / Empresa': row.ubicacion,
      Problema: row.problema
    })))
  } else {
    worksheet.addRow({
      Pedido: 'No se detectaron datos incompletos o inconsistentes.',
      'Ubicación / Empresa': '',
      Problema: ''
    })
  }

  applyHeaderStyle(worksheet)
  autoFitColumns(worksheet)
}

export async function exportDailyOrdersExcel({
  sortedOrders,
  exportCompany,
  selectedStatus
}) {
  const filteredOrders = filterOrdersByCompany(sortedOrders, exportCompany)

  const ordersById = new Map()
  const ordersWithoutId = []
  let duplicateCount = 0

  filteredOrders.forEach((order) => {
    if (!order || !order.id) {
      ordersWithoutId.push(order)
      return
    }

    if (ordersById.has(order.id)) {
      duplicateCount += 1
      return
    }

    ordersById.set(order.id, order)
  })

  const ordersToExport = [...ordersById.values(), ...ordersWithoutId]

  if (ordersToExport.length === 0) {
    notifyInfo('No hay pedidos para exportar')
    return
  }

  try {
    const summary = buildDailyOrdersSummary(ordersToExport, selectedStatus)
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ServiFood Pedidos'
    workbook.created = new Date()

    addSummarySheet(workbook, summary)
    addDetailsSheet(workbook, summary)
    addCommentsSheet(workbook, summary)
    addInconsistenciesSheet(workbook, summary)

    const fileName = buildDailyOrdersExcelFileName(summary)
    await downloadWorkbook(workbook, fileName)

    const duplicateText = duplicateCount > 0 ? ` Se omitieron ${duplicateCount} duplicados.` : ''
    notifySuccess(`✓ ${ordersToExport.length} pedidos exportados correctamente a ${fileName}.${duplicateText}`)
  } catch (error) {
    console.error('Error al exportar:', error)
    notifyError('Error al exportar el archivo. Por favor, inténtalo de nuevo.')
  }
}
