import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'ConsumptionReportPage.jsx'), 'utf8')

describe('ConsumptionReportPage', () => {
  it('shows and exports the order origin location next to the user name', () => {
    expect(source).toContain("['Usuario', 'Lugar / Sede'")
    expect(source).toContain('row.locationLabel')
    expect(source).toContain('Lugar / Sede')
    expect(source).toContain('worksheet.autoFilter')
    expect(source).toContain('to: { row: worksheet.rowCount, column: headers.length }')
  })
})
