import {
  buildOrderPreview,
  buildTurnSummary
} from './dailyOrderCalculations'
import { getAdminExtraOrderLabel, isAdminExtraOrder, resolveAdminExtraCreator } from './adminExtraOrders'
import { getStatusText } from './dailyOrderFormatters'
import { notifyError, notifyInfo } from '../notice'

const formatDeliveryDateLabel = (value) => {
  if (!value) return 'Sin fecha de entrega'
  const raw = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'UTC',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'Sin fecha de entrega'
    : parsed.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
}

const getExportDeliveryDateLabel = (orders = []) => {
  const firstWithDeliveryDate = orders.find(order => order?.delivery_date)
  return formatDeliveryDateLabel(firstWithDeliveryDate?.delivery_date)
}

export function exportDailyOrdersPdf(sortedOrders) {
  if (!sortedOrders.length) {
    notifyInfo('No hay pedidos para exportar.')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const deliveryDateLabel = getExportDeliveryDateLabel(sortedOrders)
  const { turnCounts, byLocationTurn } = buildTurnSummary(sortedOrders)
  const rowsHtml = sortedOrders.map(order => {
    const preview = buildOrderPreview(order)
    const rowDeliveryDateLabel = formatDeliveryDateLabel(order.delivery_date)
    const isExtra = isAdminExtraOrder(order)
    const adminCreator = resolveAdminExtraCreator(order)
    return `
        <tr>
          <td>${isExtra ? adminCreator.label : order.customer_name || order.user_name || 'Usuario'}</td>
          <td>${isExtra ? adminCreator.email : order.user_email || order.customer_email || ''}</td>
          <td>${order.location || '—'}</td>
          <td>${getStatusText(order.status)}</td>
          <td>${preview.itemsText}</td>
          <td>${preview.optionsText}</td>
          <td>${(order.service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo'}</td>
          <td>${rowDeliveryDateLabel}</td>
          <td>${getAdminExtraOrderLabel(order)}</td>
        </tr>
      `
  }).join('')

  const byLocationTurnRows = Object.entries(byLocationTurn).map(([loc, turns]) => `
      <tr>
        <td>${loc}</td>
        <td style="text-align:right">${turns.lunch}</td>
        <td style="text-align:right">${turns.dinner}</td>
        <td style="text-align:right">${turns.total}</td>
      </tr>
    `).join('')

  const html = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Pedidos diarios - ${today}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { margin: 0 0 8px; }
            h2 { margin: 4px 0 16px; font-size: 16px; color: #444; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
            th { background: #f3f4f6; text-align: left; }
            tr:nth-child(every) { background: #fafafa; }
            .meta { margin-bottom: 12px; font-size: 12px; color: #555; }
          </style>
        </head>
        <body>
          <h1>Pedidos diarios</h1>
          <h2>Fecha de generación: ${today} · Entrega: ${deliveryDateLabel}</h2>
          <div class="meta">Total pedidos: ${sortedOrders.length}</div>

          <h2>Resumen por turno</h2>
          <table>
            <thead>
              <tr>
                <th>Turno</th>
                <th>Pedidos</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Almuerzo</td>
                <td style="text-align:right">${turnCounts.lunch.orders}</td>
                <td style="text-align:right">${turnCounts.lunch.items}</td>
              </tr>
              <tr>
                <td>Cena</td>
                <td style="text-align:right">${turnCounts.dinner.orders}</td>
                <td style="text-align:right">${turnCounts.dinner.items}</td>
              </tr>
              <tr>
                <td><strong>Total</strong></td>
                <td style="text-align:right"><strong>${turnCounts.lunch.orders + turnCounts.dinner.orders}</strong></td>
                <td style="text-align:right"><strong>${turnCounts.lunch.items + turnCounts.dinner.items}</strong></td>
              </tr>
            </tbody>
          </table>

          <h2>Empresas por turno</h2>
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Almuerzo</th>
                <th>Cena</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${byLocationTurnRows || '<tr><td colspan="4">Sin pedidos</td></tr>'}
            </tbody>
          </table>

          <h2>Detalle de pedidos</h2>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Email</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Menú</th>
                <th>Opciones</th>
                <th>Turno</th>
                <th>Entrega</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>window.print(); setTimeout(() => window.close(), 300);</script>
        </body>
      </html>
    `

  const w = window.open('', '_blank')
  if (!w) {
    notifyError('No se pudo abrir la vista de impresión. Permite popups e inténtalo de nuevo.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
