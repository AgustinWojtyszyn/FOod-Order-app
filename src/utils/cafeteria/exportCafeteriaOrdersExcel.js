import { CAFETERIA_PLANS } from '../../cafeteria/cafeteriaPlans'
import { downloadWorkbook } from '../daily/dailyOrderCalculations'
import { loadExcelJS } from '../loadExcelJS'
import { notifyError, notifyInfo, notifySuccess } from '../notice'

const normalizeOrderRow = (order) => {
  const quantities = {}
  CAFETERIA_PLANS.forEach((plan) => {
    quantities[plan.id] = 0
  })

  ;(order.items || []).forEach((item) => {
    if (!item?.planId) return
    quantities[item.planId] = Number(item.quantity || 0)
  })

  return {
    id: order.id,
    created_at: order.created_at,
    delivery_date: order.delivery_date,
    company: order.company_name || order.company_slug || 'Sin empresa',
    admin: order.admin_name || order.admin_email || 'Sin nombre',
    notes: order.notes || '',
    quantities,
    total: order.total_items || 0
  }
}

export async function exportCafeteriaOrdersExcel(orders = [], companyFilter = 'all') {
  const filtered = companyFilter === 'all'
    ? orders
    : orders.filter((order) => (order.company_slug || order.company_name || '').toLowerCase() === companyFilter.toLowerCase())

  if (filtered.length === 0) {
    notifyInfo('No hay pedidos de cafeteria para exportar')
    return
  }

  try {
    const rows = filtered.map((order) => {
      const normalized = normalizeOrderRow(order)
      return {
        'ID Pedido': normalized.id,
        'Fecha': new Date(normalized.created_at).toLocaleString('es-AR'),
        'Fecha operativa': normalized.delivery_date || '',
        'Empresa': normalized.company,
        'Administrador': normalized.admin,
        'Aclaraciones': normalized.notes,
        'Plan Basico': normalized.quantities.basico || 0,
        'Plan Medium': normalized.quantities.medium || 0,
        'Plan Premium': normalized.quantities.premium || 0,
        'Total': normalized.total
      }
    })

    const ExcelJS = await loadExcelJS()
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Cafeteria')
    ws.columns = [
      { header: 'ID Pedido', key: 'ID Pedido', width: 18 },
      { header: 'Fecha', key: 'Fecha', width: 20 },
      { header: 'Fecha operativa', key: 'Fecha operativa', width: 16 },
      { header: 'Empresa', key: 'Empresa', width: 16 },
      { header: 'Administrador', key: 'Administrador', width: 22 },
      { header: 'Aclaraciones', key: 'Aclaraciones', width: 30 },
      { header: 'Plan Basico', key: 'Plan Basico', width: 12 },
      { header: 'Plan Medium', key: 'Plan Medium', width: 12 },
      { header: 'Plan Premium', key: 'Plan Premium', width: 12 },
      { header: 'Total', key: 'Total', width: 10 }
    ]
    ws.addRows(rows)

    const stamp = new Date().toISOString().split('T')[0]
    const companyTag = companyFilter === 'all' ? 'todas' : companyFilter.replace(/\s+/g, '_')
    const fileName = `cafeteria-${companyTag}-${stamp}.xlsx`

    await downloadWorkbook(workbook, fileName)
    notifySuccess(`✓ ${filtered.length} pedidos exportados a ${fileName}`)
  } catch (error) {
    console.error('Error al exportar cafeteria:', error)
    notifyError('Error al exportar pedidos de cafeteria.')
  }
}

export const summarizeCafeteriaOrders = (orders = []) => {
  const summary = {
    totalOrders: orders.length,
    totalsByPlan: {
      basico: 0,
      medium: 0,
      premium: 0
    }
  }

  orders.forEach((order) => {
    ;(order.items || []).forEach((item) => {
      if (!item?.planId) return
      const qty = Number(item.quantity || 0)
      if (!Number.isFinite(qty)) return
      if (summary.totalsByPlan[item.planId] === undefined) return
      summary.totalsByPlan[item.planId] += qty
    })
  })

  return summary
}
