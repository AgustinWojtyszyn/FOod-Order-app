import ExcelJS from 'exceljs'
import { db } from '../../supabaseClient'
import logoUrl from '../../assets/servifood logo.jpg'
import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'
import { downloadWorkbook, filterOrdersByCompany } from './dailyOrderCalculations'
import {
  extractOrderItems,
  formatDateOnly,
  getOrderLocation,
  getOrderTotalItems
} from './dailyOrdersExportModel'
import { notifyError, notifyInfo, notifySuccess } from '../notice'
import { getUserFriendlyErrorMessage } from '../index'

const REMITO_COLUMNS = [
  { header: 'Cantidad', key: 'cantidad', width: 12 },
  { header: 'Producto / detalle', key: 'producto', width: 44 },
  { header: 'Observaciones', key: 'observaciones', width: 22 }
]
const MIN_REMITO_DETAIL_ROWS = 16

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }
const LIGHT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
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

const summarizeProducts = (orders = []) => {
  const totals = new Map()
  orders.forEach((order) => {
    const items = extractOrderItems(order)
    if (!items.length) {
      totals.set('Sin menú / opción', (totals.get('Sin menú / opción') || 0) + 1)
      return
    }
    items.forEach((item) => {
      const label = normalizeText(item.label) || 'Sin menú / opción'
      totals.set(label, (totals.get(label) || 0) + item.quantity)
    })
  })
  return [...totals.entries()]
    .map(([producto, cantidad]) => ({ producto, cantidad }))
    .sort((a, b) => a.producto.localeCompare(b.producto))
}

const getTotalItems = (orders = []) =>
  orders.reduce((sum, order) => sum + getOrderTotalItems(order), 0)

const addLogo = async (workbook, worksheet) => {
  try {
    const response = await fetch(logoUrl)
    const buffer = await response.arrayBuffer()
    const imageId = workbook.addImage({ buffer, extension: 'jpeg' })
    worksheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.25 },
      ext: { width: 58, height: 58 }
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('No se pudo agregar el logo al Excel:', error)
    }
  }
}

const configurePrintPage = (worksheet, printArea = 'A1:C34') => {
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
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
      top: 0.25,
      bottom: 0.25,
      header: 0.12,
      footer: 0.12
    },
    printArea
  }
  worksheet.properties.showGridLines = false
  worksheet.views = [{ showGridLines: false }]
}

const styleCellRange = (worksheet, fromRow, toRow, fromCol = 1, toCol = 3) => {
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    for (let colNumber = fromCol; colNumber <= toCol; colNumber += 1) {
      const cell = row.getCell(colNumber)
      cell.border = BORDER
      cell.alignment = { vertical: 'middle', wrapText: true }
    }
  }
}

const addRemitoSheet = async (workbook, remito, sheetName) => {
  const worksheet = workbook.addWorksheet(sheetName)
  worksheet.columns = REMITO_COLUMNS
  worksheet.getColumn(1).width = 12
  worksheet.getColumn(2).width = 44
  worksheet.getColumn(3).width = 22

  await addLogo(workbook, worksheet)

  worksheet.mergeCells('A1:C2')
  worksheet.getCell('A1').value = ''
  worksheet.getRow(1).height = 24
  worksheet.getRow(2).height = 24

  worksheet.mergeCells('A3:C3')
  worksheet.getCell('A3').value = 'REMITO'
  worksheet.getCell('A3').font = { bold: true, size: 18, color: { argb: 'FF111827' } }
  worksheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(3).height = 26

  worksheet.getCell('A4').value = 'Número'
  worksheet.mergeCells('B4:C4')
  worksheet.getCell('B4').value = remito.remitoNumber
  worksheet.getCell('A5').value = 'Fecha'
  worksheet.mergeCells('B5:C5')
  worksheet.getCell('B5').value = formatDateOnly(remito.deliveryDate)
  worksheet.getCell('A6').value = 'Empresa destinataria'
  worksheet.mergeCells('B6:C6')
  worksheet.getCell('B6').value = remito.companyDisplayName
  worksheet.getCell('A7').value = 'Cantidad total'
  worksheet.mergeCells('B7:C7')
  worksheet.getCell('B7').value = remito.totalItems

  ;[4, 5, 6, 7].forEach((rowNumber) => {
    worksheet.getCell(`A${rowNumber}`).font = { bold: true, color: { argb: 'FF374151' } }
    worksheet.getCell(`A${rowNumber}`).fill = LIGHT_FILL
    worksheet.getCell(`B${rowNumber}`).font = {
      bold: rowNumber === 4,
      size: rowNumber === 4 ? 14 : 11,
      color: { argb: 'FF111827' }
    }
  })
  styleCellRange(worksheet, 4, 7)

  worksheet.addRow([])
  const headerRow = worksheet.addRow(REMITO_COLUMNS.map((column) => column.header))
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = HEADER_FILL
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }

  const detailStartRow = worksheet.rowCount + 1
  remito.products.forEach((product) => {
    worksheet.addRow({
      cantidad: product.cantidad,
      producto: product.producto,
      observaciones: ''
    })
  })

  const blankRows = Math.max(MIN_REMITO_DETAIL_ROWS - remito.products.length, 0)
  for (let index = 0; index < blankRows; index += 1) {
    worksheet.addRow({ cantidad: '', producto: '', observaciones: '' })
  }

  for (let rowNumber = detailStartRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = 22
  }

  const totalRow = worksheet.addRow({ cantidad: remito.totalItems, producto: 'Total', observaciones: '' })
  totalRow.font = { bold: true, color: { argb: 'FF111827' } }
  totalRow.fill = LIGHT_FILL

  worksheet.addRow([])
  const signatureRowNumber = worksheet.rowCount + 1
  worksheet.mergeCells(`A${signatureRowNumber}:B${signatureRowNumber}`)
  worksheet.getCell(`A${signatureRowNumber}`).value = 'Recibí conforme: ______________________________'
  worksheet.getCell(`C${signatureRowNumber}`).value = 'Aclaración: __________________'
  worksheet.getRow(signatureRowNumber).height = 24
  styleCellRange(worksheet, signatureRowNumber, signatureRowNumber)

  const returnRowNumber = Math.max(worksheet.rowCount + 2, 34)
  worksheet.getCell(`A${returnRowNumber}`).value = {
    text: 'Volver al índice',
    hyperlink: "#'Índice'!A1"
  }
  worksheet.getCell(`A${returnRowNumber}`).font = { color: { argb: 'FF2563EB' }, underline: true, size: 9 }
  worksheet.getCell(`A${returnRowNumber}`).alignment = { vertical: 'middle' }

  styleCellRange(worksheet, 9, worksheet.rowCount)
  worksheet.getColumn(1).alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getColumn(2).alignment = { vertical: 'middle', wrapText: true }
  worksheet.getColumn(3).alignment = { vertical: 'middle', wrapText: true }
  configurePrintPage(worksheet, `A1:C${returnRowNumber}`)
  return worksheet
}

const addIndexSheet = (workbook, remitos) => {
  const worksheet = workbook.addWorksheet('Índice', { properties: { tabColor: { argb: 'FF111827' } } })
  worksheet.columns = [
    { header: 'Empresa', key: 'empresa', width: 34 },
    { header: 'Número de remito', key: 'numero', width: 18 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Cantidad total', key: 'cantidad', width: 16 },
    { header: 'Enlace', key: 'enlace', width: 18 }
  ]
  worksheet.views = [{ showGridLines: false }]
  worksheet.properties.showGridLines = false

  worksheet.mergeCells('A1:E1')
  worksheet.getCell('A1').value = 'Índice de remitos'
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
    formula: `HYPERLINK("#'"&VLOOKUP(B3,$H$2:$I$${remitos.length + 1},2,FALSE)&"'!A1","Ir al remito")`,
    result: 'Ir al remito'
  }
  worksheet.getCell('C3').font = { color: { argb: 'FF2563EB' }, underline: true, bold: true }

  const headerRow = worksheet.getRow(5)
  ;['Empresa', 'Número de remito', 'Fecha', 'Cantidad total', 'Enlace directo'].forEach((header, index) => {
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
      text: 'Ir al remito',
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
    return `Remito_${companyPart}_${remitos[0].remitoNumber}_${dateForFile}.xlsx`
  }
  return `Remitos_Empresas_${dateForFile}.xlsx`
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
        console.error('Error al emitir remito:', error)
        notifyError(getUserFriendlyErrorMessage(
          error,
          'No pudimos emitir el remito. Verificá que la empresa tenga número inicial configurado.'
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
