import { describe, expect, it } from 'vitest'
import {
  getDailyCloseOverallStatus,
  getDailyOperationalStatus,
  normalizeDailyReportRunStatus
} from './dailyCloseStatus'
import { formatTimeOnly } from './dailyOrdersExportModel'

const baseOrder = {
  id: 'order-1',
  status: 'pending',
  service: 'lunch',
  delivery_date: '2026-07-02',
  customer_name: 'Ana Cliente',
  customer_email: 'ana@example.com',
  location: 'Genneia',
  items: [{ name: 'Menú principal', quantity: 4 }],
  total_items: 4,
  custom_responses: []
}

describe('daily close status', () => {
  it('builds a clean checklist without inconsistencies', () => {
    const status = getDailyOperationalStatus({
      orders: [{ ...baseOrder, total_items: 1, items: [{ name: 'Menú principal', quantity: 1 }] }],
      reportRun: { status: 'sent', sent_at: '2026-07-01T01:10:00Z', report_type: 'daily_orders' },
      lastUpdatedAt: '2026-07-01T21:55:00Z'
    })

    expect(status.inconsistencyCount).toBe(0)
    expect(status.overallStatus).toMatchObject({ state: 'attention', label: 'Atención' })
    expect(status.reportStatus.state).toBe('sent')
    expect(status.checklist.find(item => item.id === 'inconsistencies')).toMatchObject({ status: 'ok' })
  })

  it('marks pending archive when there are pending orders', () => {
    const status = getDailyOperationalStatus({
      orders: [baseOrder],
      reportRun: { status: 'sent' },
      lastUpdatedAt: '2026-07-01T21:55:00Z'
    })

    expect(status.pendingCount).toBe(1)
    expect(status.canArchivePending).toBe(true)
    expect(status.checklist.find(item => item.id === 'archive')).toMatchObject({ status: 'warning' })
  })

  it('normalizes failed and missing report statuses', () => {
    expect(normalizeDailyReportRunStatus({ status: 'failed', error: 'SMTP down' })).toMatchObject({
      state: 'failed',
      label: 'Reporte falló',
      tone: 'error',
      error: 'SMTP down'
    })

    expect(normalizeDailyReportRunStatus(null)).toMatchObject({
      state: 'no_record',
      label: 'Sin ejecución registrada',
      tone: 'warning'
    })
  })

  it('uses normalized item totals instead of raw total_items', () => {
    const status = getDailyOperationalStatus({
      orders: [baseOrder],
      reportRun: null,
      lastUpdatedAt: '2026-07-01T21:55:00Z'
    })

    expect(status.totalItems).toBe(1)
    expect(status.inconsistencyCount).toBeGreaterThan(0)
  })

  it('disables archive when there are no pending orders', () => {
    const status = getDailyOperationalStatus({
      orders: [{ ...baseOrder, status: 'archived' }],
      reportRun: { status: 'sent' },
      lastUpdatedAt: '2026-07-01T21:55:00Z'
    })

    expect(status.pendingCount).toBe(0)
    expect(status.canArchivePending).toBe(false)
    expect(status.checklist.find(item => item.id === 'archive')).toMatchObject({ status: 'ok' })
  })

  it('marks the compact state as ok only when report is sent and nothing is pending', () => {
    const status = getDailyOperationalStatus({
      orders: [{ ...baseOrder, status: 'archived', total_items: 1, items: [{ name: 'Menú principal', quantity: 1 }] }],
      reportRun: { status: 'sent', sent_at: '2026-07-01T21:55:00Z' },
      lastUpdatedAt: '2026-07-01T21:55:00Z'
    })

    expect(status.overallStatus).toMatchObject({ state: 'ok', label: 'OK', tone: 'success' })
  })

  it('marks the compact state as failed when the automatic report failed', () => {
    expect(getDailyCloseOverallStatus({
      totalOrders: 1,
      inconsistencyCount: 0,
      pendingCount: 0,
      reportStatus: normalizeDailyReportRunStatus({ status: 'failed' })
    })).toMatchObject({ state: 'failed', label: 'Falló', tone: 'error' })
  })

  it('does not expose autoarchive state when archive_status is null', () => {
    const status = getDailyOperationalStatus({
      orders: [],
      reportRun: { status: 'sent', archive_status: null }
    })

    expect(status.archiveStatus).toBeNull()
    expect(status.reportStatus.archiveStatus).toBeNull()
  })

  it('normalizes pending autoarchive state', () => {
    const status = getDailyOperationalStatus({
      orders: [],
      reportRun: { status: 'sent', archive_status: 'pending' }
    })

    expect(status.archiveStatus).toMatchObject({
      state: 'pending',
      label: 'Autoarchivado: Pendiente',
      tone: 'warning'
    })
  })

  it('normalizes completed autoarchive state with count and time', () => {
    const archivedAt = '2026-07-01T21:55:00Z'
    const status = getDailyOperationalStatus({
      orders: [],
      reportRun: {
        status: 'sent',
        archive_status: 'archived',
        archived_count: 5,
        archived_at: archivedAt
      }
    })

    expect(status.archiveStatus).toMatchObject({
      state: 'archived',
      label: 'Autoarchivado: Completado',
      tone: 'success'
    })
    expect(status.archiveStatus.detail).toContain('5 pedidos archivados')
    expect(status.archiveStatus.detail).toContain(formatTimeOnly(archivedAt))
  })

  it('normalizes failed autoarchive state without exposing the technical error', () => {
    const status = getDailyOperationalStatus({
      orders: [],
      reportRun: {
        status: 'sent',
        archive_status: 'failed',
        archive_error: 'rpc archive_orders_bulk_by_delivery_date failed with 500'
      }
    })

    expect(status.archiveStatus).toMatchObject({
      state: 'failed',
      label: 'Autoarchivado: Falló',
      tone: 'error',
      detail: 'No se pudieron archivar los pedidos automáticamente'
    })
    expect(status.archiveStatus.detail).not.toContain('rpc')
  })
})
