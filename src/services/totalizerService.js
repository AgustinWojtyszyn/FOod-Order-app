import ExcelJS from 'exceljs'
import { supabase } from './supabase'
import {
  getOrderRemitoLocationKey,
  getOrderRemitoLocationLabel,
  resolveCompanyForOrder
} from '../utils/daily/exportDailyOrderNotesExcel'
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

const safeArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const normalizeCompanySlug = (value = '') => String(value || '').trim().toLowerCase() || 'sin_empresa'
const isEpseSlug = (value = '') => normalizeCompanySlug(value) === 'epse'

const getTotalizerCompanyForOrder = (order = {}) => {
  const companySlug = normalizeCompanySlug(order.company_slug)
  const resolvedCompany = resolveCompanyForOrder(order)
  if (!isEpseSlug(companySlug) && !isEpseSlug(resolvedCompany.slug)) {
    return {
      slug: companySlug,
      name: order.company_name || order.location || companySlug || 'Sin empresa'
    }
  }

  const locationKey = getOrderRemitoLocationKey(order)
  const locationLabel = getOrderRemitoLocationLabel(order)
  return {
    slug: ['epse', locationKey || 'general'].join(':'),
    name: locationKey === 'epse' ? 'EPSE' : (locationLabel || 'EPSE')
  }
}

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
      .select('id,status,delivery_date,created_at,items,custom_responses,location,delivery_location,requesting_location_code,organization,company_slug,company_name,service,total_items,order_origin,created_by_admin_id,admin_extra_created_at')
      .gte('delivery_date', fromDate)
      .lte('delivery_date', toDate)
      .in('status', ['pending', 'archived', 'post_report_extra'])
      .order('delivery_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) return { orders: [], rows: [], error }
    const batch = data || []
    orders = orders.concat(batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const groupedOrders = new Map()
  const filteredOrders = orders.filter((order) => (
    matchesService(order, service) &&
    (selectedCompanySlugs.size === 0 || selectedCompanySlugs.has(normalizeCompanySlug(order.company_slug)))
  ))

  filteredOrders.forEach((order) => {
    const deliveryDate = String(order.delivery_date || '').slice(0, 10)
    const company = getTotalizerCompanyForOrder(order)
    const companySlug = company.slug
    const key = `${deliveryDate}:${companySlug}`
    const group = groupedOrders.get(key) || {
      delivery_date: deliveryDate,
      company_slug: companySlug,
      company_name: company.name,
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

  return { orders: filteredOrders, rows: normalizeSideRows(rows), error: null }
}

const getNumericQuantity = (...values) => {
  const match = values.find((value) => String(value ?? '').match(/^-?[0-9]+(\.[0-9]+)?$/))
  return Math.max(Number(match ?? 1), 0)
}

const buildClassifiableLabel = (source = {}, fields = []) =>
  fields.map((field) => source?.[field]).filter(Boolean).join(' ').toLowerCase()

const classifyItemLabel = (label = '') => {
  if (/opci[oó]n[ \t\r\n]*1|opcion_1/.test(label)) return 'opcion_1'
  if (/opci[oó]n[ \t\r\n]*2|opcion_2/.test(label)) return 'opcion_2'
  if (/opci[oó]n[ \t\r\n]*3|opcion_3/.test(label)) return 'opcion_3'
  if (/cel[ií]ac|sin[ \t\r\n]*tacc/.test(label)) return 'celiacos'
  if (/dieta|diet[eé]tico|hipos[oó]dico|vegetariano|vegano/.test(label)) return 'dieta'
  if (/bife.*lomo|lomo/.test(label)) return 'bife_lomo'
  if (/bife.*pollo/.test(label)) return 'bife_pollo'
  if (/men[uú][ \t\r\n]*principal|menu[ \t\r\n]*principal|plato[ \t\r\n]*principal|principal/.test(label)) return 'menu_principal'
  if (/opci[oó]n|menu|men[uú]|cena|almuerzo/.test(label)) return 'otros_menus'
  return null
}

const classifyResponseLabel = (label = '') => {
  if (/guarnici[oó]n|guarnicion|acompa[nñ]amiento/.test(label)) return SIDE_CONCEPT_CODE
  return classifyItemLabel(label)
}

const conceptLabelForCode = (code = '') =>
  TOTALIZER_CONCEPTS.find((concept) => concept.code === code)?.label || 'Otros menús'

const buildEpseRowsFromOrders = (orders = []) => {
  const totals = new Map()

  const addQuantity = ({ order, conceptCode, quantity }) => {
    if (!conceptCode) return
    const deliveryDate = String(order.delivery_date || '').slice(0, 10)
    const company = getTotalizerCompanyForOrder(order)
    const key = `${deliveryDate}:${company.slug}:${conceptCode}`
    const current = totals.get(key) || {
      delivery_date: deliveryDate,
      company_slug: company.slug,
      company_name: company.name,
      concept_code: conceptCode,
      concept_label: conceptLabelForCode(conceptCode),
      quantity: 0
    }
    current.quantity += Number(quantity || 0)
    totals.set(key, current)
  }

  orders
    .filter((order) => isEpseSlug(order.company_slug) || isEpseSlug(resolveCompanyForOrder(order).slug))
    .forEach((order) => {
      const items = safeArray(order.items)
      items.forEach((item) => {
        const label = buildClassifiableLabel(item, ['name', 'title', 'menu', 'option', 'selected_option', 'choice'])
        addQuantity({
          order,
          conceptCode: classifyItemLabel(label),
          quantity: getNumericQuantity(item?.quantity, item?.qty)
        })
      })

      const responses = safeArray(order.custom_responses)
      responses.forEach((response) => {
        const label = buildClassifiableLabel(response, ['title', 'label', 'response', 'answer', 'value'])
        addQuantity({
          order,
          conceptCode: classifyResponseLabel(label),
          quantity: getNumericQuantity(response?.quantity, response?.qty, response?.count, order.total_items)
        })
      })
    })

  return Array.from(totals.values()).filter((row) => row.quantity > 0)
}

const buildEpseCompaniesFromRows = (rows = []) => {
  const companies = new Map()
  rows.forEach((row) => {
    if (!isEpseSlug(String(row.company_slug).split(':')[0])) return
    if (!companies.has(row.company_slug)) {
      companies.set(row.company_slug, {
        company_slug: row.company_slug,
        company_name: row.company_name,
        sort_order: 70
      })
    }
  })
  return Array.from(companies.values()).sort((a, b) => getCompanyName(a).localeCompare(getCompanyName(b)))
}

const applyEpseLocationBreakdown = ({ rows, companies, orders }) => {
  const epseRows = buildEpseRowsFromOrders(orders)
  if (epseRows.length === 0) return { rows, companies }

  const nonEpseRows = rows.filter((row) => !isEpseSlug(row.company_slug))
  const nonEpseCompanies = companies.filter((company) => !isEpseSlug(getCompanyKey(company)))
  const epseCompanies = buildEpseCompaniesFromRows(epseRows)
  const epseInsertIndex = companies.findIndex((company) => isEpseSlug(getCompanyKey(company)))
  const nextCompanies = [...nonEpseCompanies]

  if (epseInsertIndex >= 0) {
    nextCompanies.splice(Math.min(epseInsertIndex, nextCompanies.length), 0, ...epseCompanies)
  } else {
    nextCompanies.push(...epseCompanies)
  }

  return {
    rows: [...nonEpseRows, ...epseRows],
    companies: nextCompanies
  }
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

    const summaryRows = normalizeRows(data?.rows)
    const summaryCompanies = Array.isArray(data?.companies) ? data.companies : []
    const groupedSummary = sideResult.error
      ? { rows: summaryRows, companies: summaryCompanies }
      : applyEpseLocationBreakdown({
        rows: summaryRows,
        companies: summaryCompanies,
        orders: sideResult.orders
      })

    return {
      data: {
        rows: groupedSummary.rows,
        companies: groupedSummary.companies,
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
