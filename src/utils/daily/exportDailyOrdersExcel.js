import ExcelJS from 'exceljs'
import { db } from '../../supabaseClient'
import logoUrl from '../../assets/servifood logo.jpg'
import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'
import { downloadWorkbook, filterOrdersByCompany } from './dailyOrderCalculations'
import {
  extractCustomResponses,
  extractOrderItems,
  formatDateOnly,
  getOrderLocation,
  getOrderTotalItems
} from './dailyOrdersExportModel'
import { notifyError, notifyInfo, notifySuccess } from '../notice'
import { getUserFriendlyErrorMessage } from '../index'

const DETAIL_ROWS_PER_COPY = 16

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
const LIGHT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const WHITE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
const BORDER = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } }
}
const THICK_BORDER = {
  top: { style: 'medium', color: { argb: 'FF000000' } },
  left: { style: 'medium', color: { argb: 'FF000000' } },
  bottom: { style: 'medium', color: { argb: 'FF000000' } },
  right: { style: 'medium', color: { argb: 'FF000000' } }
}

const INVALID_SHEET_CHARS = new Set(['[', ']', '*', '?', ':', '/', '\\', "'"])
const INVALID_FILE_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

const normalizeText = (value) => String(value ?? '').trim()

const slugify = (value = '') =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('')
    .filter((char) => !INVALID_FILE_CHARS.has(char) && char.charCodeAt(0) >= 32)
    .join('')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Empresa'

const sanitizeFileName = (value = '') =>
  normalizeText(value)
    .split('')
    .map((char) => (INVALID_FILE_CHARS.has(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/\s+/g, '_')

const sanitizeSheetNameBase = (value = '') =>
  normalizeText(value)
    .split('')
    .map((char) => (INVALID_SHEET_CHARS.has(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim() || 'Empresa'

const buildUniqueSheetName = (displayName, usedNames) => {
  const base = sanitizeSheetNameBase(displayName)
  let candidate = base.slice(0, 31)
  let suffix = 1
  while (usedNames.has(candidate.toLowerCase())) {
    const end = ` ${suffix}`
    candidate = `${base.slice(0, 31 - end.length)}${end}`
    suffix += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

const getOrderIds = (orders = []) =>
  orders
    .map((order) => order?.id)
    .filter((id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))

const getDeliveryDate = (orders = []) =>
  normalizeText(orders.find((order) => order?.delivery_date)?.delivery_date).slice(0, 10) ||
  new Date().toISOString().slice(0, 10)

const formatDateForFile = (isoDate) => {
  const formatted = formatDateOnly(isoDate)
  return formatted ? formatted.replaceAll('/', '-') : new Date().toLocaleDateString('es-AR').replaceAll('/', '-')
}

const resolveCompanyForOrder = (order = {}) => {
  const raw = getOrderLocation(order)
  const company = getCompanyByLocationOrSlug(raw) || getCompanyByLocationOrSlug(order.company_slug || order.company)
  return {
    slug: company?.slug || slugify(raw).toLowerCase(),
    name: company?.name || raw || 'Sin ubicación',
    displayName: raw || company?.name || 'Sin ubicación'
  }
}

const buildCompanyGroups = (orders = []) => {
  const groups = new Map()
  orders.forEach((order) => {
    const company = resolveCompanyForOrder(order)
    if (!groups.has(company.slug)) {
      groups.set(company.slug, { ...company, orders: [] })
    }
    groups.get(company.slug).orders.push(order)
  })
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const incrementSummary = (map, label, quantity = 1) => {
  const safeLabel = normalizeText(label)
  if (!safeLabel) return
  map.set(safeLabel, (map.get(safeLabel) || 0) + quantity)
}

const summarizeProducts = (orders = []) => {
  const totals = new Map()
  orders.forEach((order) => {
    const items = extractOrderItems(order)
    if (!items.length) {
      incrementSummary(totals, 'Sin menú / opción', 1)
    } else {
      items.forEach((item) => {
        incrementSummary(totals, item.label || 'Sin menú / opción', item.quantity)
      })
    }

    const custom = extractCustomResponses(order)
    if (custom.side) incrementSummary(totals, `Guarnición: ${custom.side}`, 1)
    if (custom.beverage) incrementSummary(totals, `Bebida: ${custom.beverage}`, 1)
    if (custom.additional) {
      custom.additional
        .split('|')
        .map(normalizeText)
        .filter(Boolean)
        .forEach((label) => incrementSummary(totals, label, 1))
    }
    if (normalizeText(order.comments)) {
      incrementSummary(totals, `Observación: ${normalizeText(order.comments)}`, 1)
    }
  })
  return [...totals.entries()]
    .map(([producto, cantidad]) => ({ producto, cantidad }))
    .sort((a, b) => a.producto.localeCompare(b.producto))
}

const getTotalItems = (orders = []) =>
  orders.reduce((sum, order) => sum + getOrderTotalItems(order), 0)

const configurePrintPage = (worksheet, printArea = 'A1:M33') => {
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: false,
    printTitlesRow: '',
    printTitlesColumn: '',
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.12,
      footer: 0.12
    },
    printArea
  }
  worksheet.properties.showGridLines = false
  worksheet.views = [{ showGridLines: false }]
}

const applyOuterBorder = (worksheet, fromRow, toRow, fromCol, toCol) => {
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber += 1) {
    for (let colNumber = fromCol; colNumber <= toCol; colNumber += 1) {
      const cell = worksheet.getCell(rowNumber, colNumber)
      cell.border = {
        top: rowNumber === fromRow ? THICK_BORDER.top : (cell.border?.top || BORDER.top),
        left: colNumber === fromCol ? THICK_BORDER.left : (cell.border?.left || BORDER.left),
        bottom: rowNumber === toRow ? THICK_BORDER.bottom : (cell.border?.bottom || BORDER.bottom),
        right: colNumber === toCol ? THICK_BORDER.right : (cell.border?.right || BORDER.right)
      }
    }
  }
}

const addLogoAt = async (workbook, worksheet, startCol) => {
  try {
    const response = await fetch(logoUrl)
    const buffer = await response.arrayBuffer()
    const imageId = workbook.addImage({ buffer, extension: 'jpeg' })
    worksheet.addImage(imageId, {
      tl: { col: startCol - 0.85, row: 0.35 },
      ext: { width: 58, height: 58 }
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('No se pudo agregar el logo al Excel:', error)
    }
  }
}

const copyCell = (worksheet, row, col, value, options = {}) => {
  const cell = worksheet.getCell(row, col)
  cell.value = value
  cell.font = options.font || { size: 8, color: { argb: 'FF000000' } }
  cell.alignment = options.alignment || { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.fill = options.fill || WHITE_FILL
  cell.border = options.border || BORDER
  return cell
}

const mergeAndSet = (worksheet, fromRow, fromCol, toRow, toCol, value, options = {}) => {
  worksheet.mergeCells(fromRow, fromCol, toRow, toCol)
  return copyCell(worksheet, fromRow, fromCol, value, options)
}

const addInstitutionalBlock = (worksheet, startCol) => {
  const lines = [
    'Servi Food S.A.',
    'Saturnino Sarassa 345 Este.',
    'C.P. 5400 - Ciudad.',
    'San Juan - Argentina.',
    'Teléfonos.',
    'IVA Responsable Inscripto.',
    'CUIT.'
  ]
  mergeAndSet(worksheet, 1, startCol + 1, 4, startCol + 2, lines.join('\n'), {
    font: { size: 7, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
}

const getPrintableDetailRows = (products = []) => {
  if (products.length <= DETAIL_ROWS_PER_COPY) return products

  const visibleRows = products.slice(0, DETAIL_ROWS_PER_COPY - 1)
  const remainingRows = products.slice(DETAIL_ROWS_PER_COPY - 1)
  const remainingQuantity = remainingRows.reduce((sum, product) => sum + Number(product?.cantidad || 0), 0)
  const remainingLabels = remainingRows.map((product) => product.producto).filter(Boolean).join(', ')
  return [
    ...visibleRows,
    {
      cantidad: remainingQuantity || '',
      producto: `Otros conceptos (${remainingRows.length}): ${remainingLabels}`
    }
  ]
}

const addCopySheetBlock = async (workbook, worksheet, remito, startCol, copyLabel) => {
  const endCol = startCol + 5
  const xCol = startCol + 3
  const titleStartCol = startCol + 4
  await addLogoAt(workbook, worksheet, startCol)

  mergeAndSet(worksheet, 1, startCol, 4, startCol, '', { border: BORDER })
  addInstitutionalBlock(worksheet, startCol)
  copyCell(worksheet, 1, xCol, 'X', {
    font: { size: 20, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 1, titleStartCol, 1, endCol, copyLabel, {
    font: { size: 8, bold: true },
    fill: LIGHT_FILL,
    alignment: { vertical: 'middle', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 2, titleStartCol, 3, endCol, 'NOTA DE PEDIDO', {
    font: { size: 12, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 4, titleStartCol, 4, endCol, `N° ${remito.remitoNumber}`, {
    font: { size: 10, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' }
  })

  mergeAndSet(worksheet, 5, startCol, 5, startCol + 2, `Fecha: ${formatDateOnly(remito.deliveryDate)}`, {
    font: { size: 9, bold: true },
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, 5, xCol, 5, endCol, `Empresa: ${remito.companyDisplayName}`, {
    font: { size: 9, bold: true },
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, 6, startCol, 6, endCol, 'Documento no válido como factura', {
    font: { size: 8, italic: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  mergeAndSet(worksheet, 7, startCol, 7, startCol + 2, 'I.V.A. RESPONSABLE INSCRIPTO', {
    font: { size: 7, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  mergeAndSet(worksheet, 7, xCol, 7, endCol, 'C.U.I.T. N°: 30-71000228-9', {
    font: { size: 7, bold: true },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  copyCell(worksheet, 8, startCol, 'CANT.', {
    font: { size: 8, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: HEADER_FILL
  })
  mergeAndSet(worksheet, 8, startCol + 1, 8, endCol, 'DETALLE', {
    font: { size: 8, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: HEADER_FILL
  })

  const detailRows = getPrintableDetailRows(remito.products)
  for (let index = 0; index < DETAIL_ROWS_PER_COPY; index += 1) {
    const rowNumber = 9 + index
    const product = detailRows[index]
    copyCell(worksheet, rowNumber, startCol, product?.cantidad || '', {
      font: { size: 8 },
      alignment: { vertical: 'middle', horizontal: 'center' }
    })
    mergeAndSet(worksheet, rowNumber, startCol + 1, rowNumber, endCol, product?.producto || '', {
      font: { size: 8 },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
    worksheet.getRow(rowNumber).height = 15.5
  }

  copyCell(worksheet, 25, startCol, remito.totalItems, {
    font: { size: 8, bold: true },
    fill: LIGHT_FILL
  })
  mergeAndSet(worksheet, 25, startCol + 1, 25, endCol, 'TOTAL MENÚ', {
    font: { size: 8, bold: true },
    fill: LIGHT_FILL,
    alignment: { vertical: 'middle', horizontal: 'left' }
  })

  mergeAndSet(worksheet, 27, startCol, 29, endCol, 'DEVOLUCIONES', {
    font: { size: 8, bold: true },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, 30, startCol, 30, endCol, 'CONTROL DE CALIDAD / CANTIDAD:    CONFORME  □      NO CONFORME  □', {
    font: { size: 8, bold: true },
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  mergeAndSet(worksheet, 32, startCol, 33, startCol + 2, 'FIRMA RESPONSABLE', {
    font: { size: 8, bold: true },
    alignment: { vertical: 'bottom', horizontal: 'center' }
  })
  mergeAndSet(worksheet, 32, xCol, 33, endCol, 'FIRMA TRANSPORTE', {
    font: { size: 8, bold: true },
    alignment: { vertical: 'bottom', horizontal: 'center' }
  })

  applyOuterBorder(worksheet, 1, 33, startCol, endCol)
}

const addRemitoSheet = async (workbook, remito, sheetName) => {
  const worksheet = workbook.addWorksheet(sheetName)
  worksheet.columns = [
    { key: 'margin', width: 1.6 },
    { key: 'originalCantidad', width: 7.5 },
    { key: 'originalDetalleA', width: 10 },
    { key: 'originalDetalleB', width: 10 },
    { key: 'originalDetalleC', width: 10 },
    { key: 'originalDetalleD', width: 11 },
    { key: 'originalDetalleE', width: 11 },
    { key: 'duplicadoCantidad', width: 7.5 },
    { key: 'duplicadoDetalleA', width: 10 },
    { key: 'duplicadoDetalleB', width: 10 },
    { key: 'duplicadoDetalleC', width: 10 },
    { key: 'duplicadoDetalleD', width: 11 },
    { key: 'duplicadoDetalleE', width: 11 }
  ]
  worksheet.properties.showGridLines = false
  worksheet.views = [{ showGridLines: false }]
  for (let rowNumber = 1; rowNumber <= 35; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = rowNumber <= 7 ? 16 : 15.5
  }

  await addCopySheetBlock(workbook, worksheet, remito, 2, 'ORIGINAL')
  await addCopySheetBlock(workbook, worksheet, remito, 8, 'DUPLICADO')

  worksheet.getCell('A35').value = {
    text: 'Volver al índice',
    hyperlink: "#'Índice'!A1"
  }
  worksheet.getCell('A35').font = { color: { argb: 'FF2563EB' }, underline: true, size: 8 }
  worksheet.getCell('A35').alignment = { vertical: 'middle', horizontal: 'left' }

  configurePrintPage(worksheet, 'A1:M33')
  return worksheet
}

const addIndexSheet = (workbook, remitos) => {
  const worksheet = workbook.addWorksheet('Índice', { properties: { tabColor: { argb: 'FF111827' } } })
  worksheet.columns = [
    { header: 'Empresa', key: 'empresa', width: 34 },
    { header: 'Número de nota', key: 'numero', width: 18 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Cantidad total', key: 'cantidad', width: 16 },
    { header: 'Enlace', key: 'enlace', width: 18 }
  ]
  worksheet.views = [{ showGridLines: false }]
  worksheet.properties.showGridLines = false

  worksheet.mergeCells('A1:E1')
  worksheet.getCell('A1').value = 'Índice de notas de pedido'
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF111827' } }
  worksheet.getCell('A1').alignment = { vertical: 'middle' }

  worksheet.getCell('A3').value = 'Empresa'
  worksheet.getCell('A3').font = { bold: true }
  worksheet.getCell('B3').dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`$H$2:$H$${remitos.length + 1}`]
  }
  worksheet.getCell('B3').value = remitos[0]?.companyDisplayName || ''
  worksheet.getCell('C3').value = {
    formula: `HYPERLINK("#'"&VLOOKUP(B3,$H$2:$I$${remitos.length + 1},2,FALSE)&"'!A1","Ir a la nota")`,
    result: 'Ir a la nota'
  }
  worksheet.getCell('C3').font = { color: { argb: 'FF2563EB' }, underline: true, bold: true }

  const headerRow = worksheet.getRow(5)
  ;['Empresa', 'Número de nota', 'Fecha', 'Cantidad total', 'Enlace directo'].forEach((header, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER
  })

  remitos.forEach((remito, index) => {
    const rowNumber = index + 6
    const row = worksheet.getRow(rowNumber)
    row.getCell(1).value = remito.companyDisplayName
    row.getCell(2).value = remito.remitoNumber
    row.getCell(3).value = formatDateOnly(remito.deliveryDate)
    row.getCell(4).value = remito.totalItems
    row.getCell(5).value = {
      text: 'Ir a la nota',
      hyperlink: `#'${remito.sheetName}'!A1`
    }
    row.getCell(5).font = { color: { argb: 'FF2563EB' }, underline: true }
    row.eachCell((cell) => {
      cell.border = BORDER
      cell.alignment = { vertical: 'middle', wrapText: true }
    })

    worksheet.getCell(`H${index + 2}`).value = remito.companyDisplayName
    worksheet.getCell(`I${index + 2}`).value = remito.sheetName
  })

  worksheet.getColumn(8).hidden = true
  worksheet.getColumn(9).hidden = true
  configurePrintPage(worksheet, `A1:E${remitos.length + 6}`)
  return worksheet
}

const buildFileName = (remitos, deliveryDate) => {
  const dateForFile = formatDateForFile(deliveryDate)
  if (remitos.length === 1) {
    const companyPart = sanitizeFileName(slugify(remitos[0].companyName).toUpperCase())
    return `Nota_de_Pedido_${companyPart}_${remitos[0].remitoNumber}_${dateForFile}.xlsx`
  }
  return `Notas_de_Pedido_Empresas_${dateForFile}.xlsx`
}

export async function exportDailyOrdersExcel({
  sortedOrders,
  exportCompany,
  selectedStatus: _selectedStatus
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
    const deliveryDate = getDeliveryDate(ordersToExport)
    const groups = buildCompanyGroups(ordersToExport)
    const usedSheetNames = new Set(['índice'])
    const remitos = []

    for (const group of groups) {
      const { data, error } = await db.issueCompanyRemito({
        companySlug: group.slug,
        companyName: group.name,
        deliveryDate,
        orderIds: getOrderIds(group.orders)
      })

      if (error) {
        console.error('Error al emitir nota de pedido:', error)
        notifyError(getUserFriendlyErrorMessage(
          error,
          `No pudimos emitir la nota de pedido para ${group.displayName}. Verificá que la empresa tenga número inicial configurado.`
        ))
        return
      }

      const products = summarizeProducts(group.orders)
      const sheetName = buildUniqueSheetName(`${group.name} ${data.remito_number}`, usedSheetNames)
      remitos.push({
        companySlug: group.slug,
        companyName: group.name,
        companyDisplayName: group.displayName,
        remitoNumber: data.remito_number,
        deliveryDate,
        totalItems: getTotalItems(group.orders),
        products,
        sheetName,
        reused: !!data.reused
      })
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ServiFood'
    workbook.created = new Date()

    addIndexSheet(workbook, remitos)
    for (const remito of remitos) {
      await addRemitoSheet(workbook, remito, remito.sheetName)
    }
    if (remitos.length === 1) {
      workbook.views = [{ activeTab: 1 }]
    }

    const fileName = buildFileName(remitos, deliveryDate)
    await downloadWorkbook(workbook, fileName)

    const duplicateText = duplicateCount > 0 ? ` Se omitieron ${duplicateCount} duplicados.` : ''
    const reusedText = remitos.some((remito) => remito.reused)
      ? ' Se reutilizó la numeración ya emitida cuando correspondía.'
      : ''
    notifySuccess(`✓ ${ordersToExport.length} pedidos exportados a ${fileName}.${duplicateText}${reusedText}`)
  } catch (error) {
    console.error('Error al exportar:', error)
    notifyError(getUserFriendlyErrorMessage(error, 'Error al exportar el archivo. Por favor, inténtalo de nuevo.'))
  }
}
