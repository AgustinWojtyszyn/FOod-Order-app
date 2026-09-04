import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'useDailyOrdersData.js'), 'utf8')
const dailyOrdersSource = readFileSync(join(currentDir, '../components/DailyOrders.jsx'), 'utf8')
const dailyHeaderSource = readFileSync(join(currentDir, '../components/daily/DailyHeader.jsx'), 'utf8')
const dailyExportActionsSource = readFileSync(join(currentDir, '../components/daily/DailyExportActions.jsx'), 'utf8')

describe('useDailyOrdersData daily orders loading', () => {
  it('starts with the current operational delivery date', () => {
    expect(source).toContain('useState(() => getTomorrowISOInTimeZone())')
  })

  it('loads daily orders with server-side delivery_date and operational statuses', () => {
    expect(source).toContain('db.getDailyOrdersForAdmin')
    expect(source).toContain('deliveryDate: nextOperationalDate')
    expect(source).toContain("statuses: ['pending', 'archived', 'post_report_extra']")
    expect(source).toContain('resolveAdminExtraCreator(order')
    expect(source).not.toContain('db.getOrdersWithPersonKey(')
    expect(source).not.toContain('Solicitado por admin')
  })

  it('changes the selected delivery date and reloads through the filtered loader', () => {
    expect(source).toContain('handleDeliveryDateChange')
    expect(source).toContain('setOperationalDate(nextDate)')
    expect(source).toContain('deliveryDate = operationalDate')
    expect(dailyOrdersSource).toContain('onDeliveryDateChange={handleDeliveryDateChange}')
    expect(dailyHeaderSource).toContain('onDeliveryDateChange(event.target.value)')
  })

  it('refreshes using the selected delivery date', () => {
    expect(source).toContain('await fetchDailyOrders(false, operationalDate)')
  })

  it('routes the refresh button through the filtered daily orders loader', () => {
    expect(dailyOrdersSource).toContain('onRefresh={handleRefresh}')
    expect(dailyHeaderSource).toContain('onRefresh={onRefresh}')
    expect(dailyExportActionsSource).toContain('onClick={onRefresh}')
    expect(dailyOrdersSource).not.toContain('getOrdersWithPersonKey(')
    expect(dailyHeaderSource).not.toContain('getOrdersWithPersonKey(')
    expect(dailyExportActionsSource).not.toContain('getOrdersWithPersonKey(')
  })

  it('keeps exports, summaries and close status based on the loaded daily dataset', () => {
    expect(dailyOrdersSource).toContain('filterOrdersByCompany(sortedOrders, exportCompany)')
    expect(dailyOrdersSource).toContain('const deliveryDateLabel = formatDeliveryDateLabel(operationalDate)')
    expect(dailyOrdersSource).toContain('tomorrowLabel={deliveryDateLabel}')
    expect(dailyOrdersSource).toContain('getDailyOperationalStatus({')
    expect(dailyOrdersSource).toContain('orders: allOrders')
    expect(dailyOrdersSource).toContain('deliveryDate: operationalDate')
    expect(dailyOrdersSource).toContain('buildPrintStats(allOrders)')
  })

  it('cancels admin extra orders through their isolated flow scoped to the selected delivery date', () => {
    expect(source).toContain('handleCancelExtraOrders')
    expect(source).toContain('isAdminExtraOrder(order)')
    expect(source).toContain("String(order.delivery_date || '') === String(operationalDate || '')")
    expect(source).toContain('db.deleteAdminExtraOrder')
    expect(source).not.toContain('cancelOwnPendingOrder')
    expect(dailyOrdersSource).toContain('AdminExtraCancelPanel')
    expect(dailyOrdersSource).toContain('onCancelExtras={handleCancelExtraOrders}')
  })
})
