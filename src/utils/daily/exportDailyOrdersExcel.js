import ExcelJS from 'exceljs'
import { downloadWorkbook, filterOrdersByCompany } from './dailyOrderCalculations'
import {
  buildDailyOrdersExcelDetailRows,
  buildDailyOrdersExcelFileName,
  buildDailyOrdersSummary,
  formatDailyOrdersOperationalText
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

const addOperationalTextSheet = (workbook, orders, selectedStatus) => {
  const worksheet = workbook.addWorksheet('Resumen operativo')
  worksheet.columns = [
    { header: 'Reporte', key: 'reporte', width: 96 }
  ]

  formatDailyOrdersOperationalText(orders, selectedStatus, {
    title: 'REPORTE DIARIO DE PEDIDOS SERVIFOOD'
  }).split('\n').forEach((line) => {
    const cleanLine = line.replace(/\*/g, '')
    const row = worksheet.addRow({ reporte: cleanLine })
    if (/^[A-ZÁÉÍÓÚÑ /]+$/.test(cleanLine) && cleanLine.length > 3) {
      row.font = { bold: true, color: { argb: 'FF111827' } }
      row.fill = SUMMARY_FILL
    }
  })

  applyHeaderStyle(worksheet)
  worksheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
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

const addLocationMenuSheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Detalle por empresa')
  worksheet.columns = [
    { header: 'Ubicación / Empresa', key: 'ubicacion', width: 30 },
    { header: 'Menú / opción', key: 'menu', width: 54 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Subtotal empresa', key: 'subtotal', width: 18 }
  ]

  if (summary.byLocationMenu.length) {
    summary.byLocationMenu.forEach((location) => {
      if (!location.menus.length) {
        worksheet.addRow({
          ubicacion: location.label,
          menu: 'Sin menús/opciones para listar.',
          cantidad: '',
          subtotal: location.items
        })
        return
      }

      location.menus.forEach((menu, index) => {
        worksheet.addRow({
          ubicacion: location.label,
          menu: menu.label,
          cantidad: menu.quantity,
          subtotal: index === 0 ? location.items : ''
        })
      })
    })
  } else {
    worksheet.addRow({
      ubicacion: 'Sin detalle por ubicación.',
      menu: '',
      cantidad: '',
      subtotal: ''
    })
  }

  applyHeaderStyle(worksheet)
  worksheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
}

const addAdditionalByLocationSheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Adicionales por empresa')
  worksheet.columns = [
    { header: 'Ubicación / Empresa', key: 'ubicacion', width: 30 },
    { header: 'Guarnición / adicional', key: 'adicional', width: 54 },
    { header: 'Cantidad', key: 'cantidad', width: 12 }
  ]

  if (summary.additionalByLocation.length) {
    summary.additionalByLocation.forEach((location) => {
      if (!location.items.length) {
        worksheet.addRow({
          ubicacion: location.label,
          adicional: 'Sin guarniciones/adicionales destacados.',
          cantidad: ''
        })
        return
      }

      location.items.forEach((item) => {
        worksheet.addRow({
          ubicacion: location.label,
          adicional: item.label,
          cantidad: item.quantity
        })
      })
    })
  } else {
    worksheet.addRow({
      ubicacion: 'Sin guarniciones/adicionales destacados.',
      adicional: '',
      cantidad: ''
    })
  }

  applyHeaderStyle(worksheet)
  worksheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
}

const addCommentsByLocationSheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet('Comentarios por empresa')
  worksheet.columns = [
    { header: 'Ubicación / Empresa', key: 'ubicacion', width: 30 },
    { header: 'Comentario / observación', key: 'comentario', width: 64 },
    { header: 'Cantidad', key: 'cantidad', width: 12 }
  ]

  if (summary.commentsByLocation.length) {
    summary.commentsByLocation.forEach((location) => {
      if (!location.comments.length) {
        worksheet.addRow({
          ubicacion: location.label,
          comentario: 'Sin comentarios destacados.',
          cantidad: ''
        })
        return
      }

      location.comments.forEach((comment) => {
        worksheet.addRow({
          ubicacion: location.label,
          comentario: comment.comment,
          cantidad: comment.count
        })
      })
    })
  } else {
    worksheet.addRow({
      ubicacion: 'Sin comentarios destacados.',
      comentario: '',
      cantidad: ''
    })
  }

  applyHeaderStyle(worksheet)
  worksheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
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
    'Opción elegida': '',
    Guarniciones: '',
    'Respuestas personalizadas': '',
    Comentarios: '',
    Estado: ''
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

    addOperationalTextSheet(workbook, ordersToExport, selectedStatus)
    addSummarySheet(workbook, summary)
    addLocationMenuSheet(workbook, summary)
    addAdditionalByLocationSheet(workbook, summary)
    addCommentsByLocationSheet(workbook, summary)
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
