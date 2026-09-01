import ExcelJS from 'exceljs'
import { supabase } from './supabase'
import { buildSideBucketsFromOrders } from '../utils/analytics/trendsHelpers'
import { normalizeLabel } from '../utils/monthly/monthlyOrderFormatters'

const PAGE_SIZE = 1000

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

const normalizeSideRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    delivery_date: row.delivery_date || '',
    company_slug: row.company_slug || 'sin_empresa',
    company_name: row.company_name || row.company_slug || 'Sin empresa',
    side_label: row.side_label || '',
    quantity: Number(row.quantity || 0)
  })).filter((row) => row.side_label && row.quantity > 0)

const normalizeCompanySlug = (value = '') => String(value || '').trim().toLowerCase() || 'sin_empresa'

const matchesService = (order, service) => {
  const normalizedService = normalizeService(service)
  if (normalizedService === 'all') return true
  const orderService = String(order?.service || 'lunch').trim().toLowerCase() || 'lunch'
  if (normalizedService === 'cena') return orderService === 'dinner'
  return orderService !== 'dinner'
}

const fetchTotalizerSideRows = async ({ fromDate, toDate, service, companySlugs = [] }) => {
  let from = 0
  let orders = []
  const selectedCompanySlugs = new Set(
    Array.isArray(companySlugs) ? companySlugs.map(normalizeCompanySlug).filter(Boolean) : []
  )

  while (true) {
    const query = supabase
      .from('orders')
      .select('id,status,delivery_date,created_at,items,custom_responses,location,company_slug,company_name,service,total_items,order_origin,created_by_admin_id,admin_extra_created_at')
      .gte('delivery_date', fromDate)
      .lte('delivery_date', toDate)
      .in('status', ['pending', 'archived', 'post_report_extra'])
      .order('delivery_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) return { rows: [], error }
    const batch = data || []
    orders = orders.concat(batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const groupedOrders = new Map()
  orders.filter((order) => (
    matchesService(order, service) &&
    (selectedCompanySlugs.size === 0 || selectedCompanySlugs.has(normalizeCompanySlug(order.company_slug)))
  )).forEach((order) => {
    const deliveryDate = String(order.delivery_date || '').slice(0, 10)
    const companySlug = normalizeCompanySlug(order.company_slug)
    const key = `${deliveryDate}:${companySlug}`
    const group = groupedOrders.get(key) || {
      delivery_date: deliveryDate,
      company_slug: companySlug,
      company_name: order.company_name || order.location || companySlug || 'Sin empresa',
      orders: []
    }
    group.orders.push(order)
    groupedOrders.set(key, group)
  })

  const rows = []
  groupedOrders.forEach((group) => {
    const sideBuckets = buildSideBucketsFromOrders(group.orders)
    Object.entries(sideBuckets.tiposGuarniciones || {}).forEach(([sideLabel, quantity]) => {
      if (!sideLabel || Number(quantity) <= 0) return
      rows.push({
        delivery_date: group.delivery_date,
        company_slug: group.company_slug,
        company_name: group.company_name,
        side_label: sideLabel,
        quantity: Number(quantity || 0)
      })
    })
  })

  return { rows: normalizeSideRows(rows), error: null }
}

export const totalizerService = {
  getSummary: async ({ fromDate, toDate, service = 'all', companySlugs = [] }) => {
    const [summaryResult, sideResult] = await Promise.all([
      supabase.rpc('totalizer_get_summary', {
        p_from_date: fromDate,
        p_to_date: toDate,
        p_service: normalizeService(service),
        p_company_slugs: Array.isArray(companySlugs) && companySlugs.length > 0 ? companySlugs : null
      }),
      fetchTotalizerSideRows({ fromDate, toDate, service, companySlugs })
    ])
    const { data, error } = summaryResult

    if (sideResult.error) {
      console.error('[totalizer] side detail error', sideResult.error)
    }

    return {
      data: {
        rows: normalizeRows(data?.rows),
        companies: Array.isArray(data?.companies) ? data.companies : [],
        dates: Array.isArray(data?.dates) ? data.dates : [],
        sideRows: sideResult.error ? normalizeSideRows(data?.sideRows || data?.side_rows) : sideResult.rows
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
const SIDE_CONCEPT_CODE = 'guarniciones'

const buildSideColumns = (sideRows = []) => {
  const columns = new Map()
  sideRows.forEach((row) => {
    const label = String(row.side_label || '').trim()
    const key = normalizeLabel(label) || label.toLowerCase()
    if (label && !columns.has(key)) columns.set(key, label)
  })
  return Array.from(columns, ([key, label]) => ({ key, label }))
}

const getConceptTotalsByCompany = ({ rows, companies }) => {
  const totals = new Map()
  companies.forEach((company) => {
    totals.set(getCompanyKey(company), Object.fromEntries(TOTALIZER_CONCEPTS.map((concept) => [concept.code, 0])))
  })

  rows.forEach((row) => {
    const companyTotals = totals.get(row.company_slug)
    if (!companyTotals) return
    companyTotals[row.concept_code] = (companyTotals[row.concept_code] || 0) + Number(row.quantity || 0)
  })

  return totals
}

const getSideTotalsByCompany = ({ sideRows = [], companies }) => {
  const companyKeys = new Set(companies.map(getCompanyKey))
  const totals = new Map()
  companies.forEach((company) => totals.set(getCompanyKey(company), new Map()))

  sideRows.forEach((row) => {
    if (!companyKeys.has(row.company_slug)) return
    const label = String(row.side_label || '').trim()
    const sideKey = normalizeLabel(label) || label.toLowerCase()
    if (!sideKey) return
    const companyTotals = totals.get(row.company_slug)
    companyTotals.set(sideKey, (companyTotals.get(sideKey) || 0) + Number(row.quantity || 0))
  })

  return totals
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

const addDaySheet = ({ workbook, date, rows, companies, sideRows = [] }) => {
  const worksheet = workbook.addWorksheet(date.slice(5).replace('-', '-'))
  const sideColumns = buildSideColumns(sideRows)
  const visibleConcepts = sideColumns.length > 0
    ? TOTALIZER_CONCEPTS.filter((concept) => concept.code !== SIDE_CONCEPT_CODE)
    : TOTALIZER_CONCEPTS
  const conceptTotalsByCompany = getConceptTotalsByCompany({ rows, companies })
  const sideTotalsByCompany = getSideTotalsByCompany({ sideRows, companies })

  worksheet.addRow([`TOTALIZADORA ${dateLabel(date)}`])
  worksheet.addRow(['EMPRESA', ...visibleConcepts.map((concept) => concept.label.toUpperCase()), ...sideColumns.map((column) => column.label.toUpperCase()), 'TOTAL'])

  companies.forEach((company) => {
    const companyKey = getCompanyKey(company)
    const conceptTotals = conceptTotalsByCompany.get(companyKey) || {}
    const sideTotals = sideTotalsByCompany.get(companyKey) || new Map()
    const total = TOTALIZER_CONCEPTS.reduce((sum, concept) => sum + Number(conceptTotals[concept.code] || 0), 0)

    worksheet.addRow([
      getCompanyName(company),
      ...visibleConcepts.map((concept) => Number(conceptTotals[concept.code] || 0)),
      ...sideColumns.map((column) => Number(sideTotals.get(column.key) || 0)),
      total
    ])
  })

  const summaryValues = TOTALIZER_CONCEPTS.reduce((values, concept) => {
    values[concept.code] = rows
      .filter((row) => row.concept_code === concept.code)
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0)
    return values
  }, {})
  const sideSummaryValues = sideColumns.map((column) =>
    sideRows
      .filter((row) => (normalizeLabel(row.side_label) || String(row.side_label || '').trim().toLowerCase()) === column.key)
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  )
  const grandTotal = TOTALIZER_CONCEPTS.reduce((sum, concept) => sum + Number(summaryValues[concept.code] || 0), 0)

  worksheet.addRow([
    'TOTAL',
    ...visibleConcepts.map((concept) => Number(summaryValues[concept.code] || 0)),
    ...sideSummaryValues,
    grandTotal
  ])
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

export const exportTotalizerWorkbook = async ({ fromDate, toDate, service, rows, companies, dates, sideRows = [] }) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ServiFood'
  workbook.created = new Date()

  const orderedDates = dates.length > 0 ? dates : [...new Set(rows.map((row) => row.delivery_date))].sort()
  orderedDates.forEach((date) => {
    addDaySheet({
      workbook,
      date,
      rows: rows.filter((row) => row.delivery_date === date),
      companies,
      sideRows: sideRows.filter((row) => row.delivery_date === date)
    })
  })

  if (orderedDates.length === 0) {
    addDaySheet({ workbook, date: fromDate, rows: [], companies, sideRows: [] })
  }

  await downloadWorkbook(workbook, `totalizadora-${fromDate}-a-${toDate}-${normalizeService(service)}.xlsx`)
}
