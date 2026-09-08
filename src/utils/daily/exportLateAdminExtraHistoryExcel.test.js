import { describe, expect, it } from 'vitest'
import { buildLateAdminExtraHistoryWorkbook } from './exportLateAdminExtraHistoryExcel'

describe('late admin extra history Excel', () => {
  it('builds the closure workbook from the immutable closure snapshot and marks deleted rows', async () => {
    const workbook = await buildLateAdminExtraHistoryWorkbook({
      operationalDate: '2026-08-21',
      status: 'closed',
      closure: {
        total_orders: 1,
        total_units: 3,
        window_started_at: '2026-08-21T01:00:00.000Z',
        window_closed_at: '2026-08-21T21:00:00.000Z',
        snapshot: {
          rows: [{
            id: 'history-1',
            operational_date: '2026-08-21',
            created_at: '2026-08-21T13:00:00.000Z',
            company_name: 'Genneia',
            location: 'Genneia',
            service: 'lunch',
            total_items: 3,
            created_by_name: 'Claudia',
            historical_status: 'deleted',
            deleted_at: '2026-08-21T14:00:00.000Z',
            deleted_by_name: 'Agustin',
            deleted_reason: 'Duplicado',
            detail: {
              items: [{ quantity: 3, name: 'Opción 1 - Pollo' }],
              custom_responses: [{ title: 'Bebida', response: 'Agua' }]
            },
            order_snapshot: {
              items: [{ quantity: 99, name: 'No debe usarse si hay detail' }]
            }
          }]
        }
      },
      rows: [{
        id: 'current-row',
        total_items: 99,
        company_name: 'No usar'
      }]
    })

    const summary = workbook.getWorksheet('Resumen')
    const details = workbook.getWorksheet('Pedidos extra')

    expect(summary.getCell('B2').value).toBe('Cerrado')
    expect(summary.getCell('B3').value).toBe('21/8/2026')
    expect(summary.getCell('B7').value).toBe(1)
    expect(summary.getCell('B8').value).toBe(3)
    expect(summary.getCell('B9').value).toBe('Cerrado')
    expect(details.getCell('A1').value).toBe('Fecha de carga')
    expect(details.getCell('B1').value).toBe('Hora de carga')
    expect(details.getCell('C1').value).toBe('Fecha de entrega')
    expect(details.getCell('D2').value).toBe('Genneia')
    expect(details.getCell('F2').value).toContain('3 x Opción 1 - Pollo')
    expect(details.getCell('F2').value).toContain('Bebida: Agua')
    expect(details.getCell('G2').value).toBe(3)
    expect(details.getCell('I2').value).toBe('Eliminado')
    expect(details.getCell('J2').value).toBe('Sí')
    expect(details.getCell('L2').value).toBe('Duplicado')
    expect(details.getCell('A1').font).toMatchObject({ name: 'Calibri', bold: true })
  })
})
