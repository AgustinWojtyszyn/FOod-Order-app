import ExcelJS from 'exceljs'
import { supabase } from './supabase'

export const TOTALIZER_CONCEPTS = [
  { code: 'menu_principal', label: 'Menú principal' },
  { code: 'opcion_1', label: 'Opción 1' },
  { code: 'opcion_2', label: 'Opción 2' },
  { code: 'opcion_3', label: 'Opción 3' },
  { code: 'otros_menus', label: 'Otros menús' },
  { code: 'dieta', label: 'Dieta' },
  { code: 'celiacos', label: 'Celíacos' },
  { code: 'bife_lomo', label: 'Bife de lomo' },
  { code: 'bife_pollo', label: 'Bife de pollo' },
  { code: 'guarniciones', label: 'Guarniciones' }
]

const normalizeService = (service = 'all') => {
  const value = String(service || 'all').toLowerCase()
  return ['almuerzo', 'cena'].includes(value) ? value : 'all'
}

const normalizeRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    delivery_date: row.delivery_date || '',
    company_slug: row.company_slug || 'sin_empresa',
    company_name: row.company_name || row.company_slug || 'Sin empresa',
    concept_code: row.concept_code || 'otros_menus',
    concept_label: row.concept_label || 'Otros menús',
    quantity: Number(row.quantity || 0)
  }))

export const totalizerService = {
  getSummary: async ({ fromDate, toDate, service = 'all', companySlugs = [] }) => {
    const { data, error } = await supabase.rpc('totalizer_get_summary', {
      p_from_date: fromDate,
      p_to_date: toDate,
      p_service: normalizeService(service),
      p_company_slugs: Array.isArray(companySlugs) && companySlugs.length > 0 ? companySlugs : null
    })

    return {
      data: {
        rows: normalizeRows(data?.rows),
        companies: Array.isArray(data?.companies) ? data.companies : [],
        dates: Array.isArray(data?.dates) ? data.dates : []
      },
      error
    }
  }
}

const dateLabel = (value = '') => {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return [day, month, year].filter(Boolean).join('/')
}

const getCompanyKey = (company) => company.company_slug || company.slug || company.company_name || company.name || 'sin_empresa'
const getCompanyName = (company) => company.company_name || company.name || company.company_slug || company.slug || 'Sin empresa'

const buildMatrix = ({ rows, companies }) => {
  const matrix = new Map()
  rows.forEach((row) => {
    const key = `${row.concept_code}:${row.company_slug}`
    matrix.set(key, (matrix.get(key) || 0) + Number(row.quantity || 0))
  })

  return TOTALIZER_CONCEPTS.map((concept) => {
    const quantities = companies.map((company) => matrix.get(`${concept.code}:${getCompanyKey(company)}`) || 0)
    const total = quantities.reduce((sum, quantity) => sum + quantity, 0)
    return { concept, quantities, total }
  })
}

const styleSheet = (worksheet) => {
  worksheet.getRow(1).font = { bold: true, size: 14 }
  worksheet.getRow(2).font = { bold: true }
  worksheet.getColumn(1).width = 24
  worksheet.columns.forEach((column, index) => {
    if (index > 0) column.width = 16
    column.alignment = index === 0 ? { horizontal: 'left' } : { horizontal: 'right' }
  })
  worksheet.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }]
}

const addDaySheet = ({ workbook, date, rows, companies }) => {
  const worksheet = workbook.addWorksheet(date.slice(5).replace('-', '-'))
  worksheet.addRow([`TOTALIZADORA ${dateLabel(date)}`])
  worksheet.addRow(['Concepto', ...companies.map(getCompanyName), 'TOTAL'])

  buildMatrix({ rows, companies }).forEach(({ concept, quantities, total }) => {
    worksheet.addRow([concept.label, ...quantities, total])
  })

  const companyTotals = companies.map((company) =>
    rows
      .filter((row) => row.company_slug === getCompanyKey(company))
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  )
  worksheet.addRow(['TOTAL', ...companyTotals, companyTotals.reduce((sum, quantity) => sum + quantity, 0)])
  worksheet.lastRow.font = { bold: true }
  styleSheet(worksheet)
}

const downloadWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const exportTotalizerWorkbook = async ({ fromDate, toDate, service, rows, companies, dates }) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ServiFood'
  workbook.created = new Date()

  const orderedDates = dates.length > 0 ? dates : [...new Set(rows.map((row) => row.delivery_date))].sort()
  orderedDates.forEach((date) => {
    addDaySheet({
      workbook,
      date,
      rows: rows.filter((row) => row.delivery_date === date),
      companies
    })
  })

  if (orderedDates.length === 0) {
    addDaySheet({ workbook, date: fromDate, rows: [], companies })
  }

  await downloadWorkbook(workbook, `totalizadora-${fromDate}-a-${toDate}-${normalizeService(service)}.xlsx`)
}
