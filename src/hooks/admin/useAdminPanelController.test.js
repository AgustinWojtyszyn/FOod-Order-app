import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'useAdminPanelController.js'), 'utf8')

describe('useAdminPanelController menu save messaging contract', () => {
  it('reports weekly partial saves with saved and not saved sections', () => {
    expect(source).toContain('getWeeklyMenuFailureReason')
    expect(source).toContain('Se guardaron ${savedDates.length} de ${selectedDates.length} fechas.')
    expect(source).toContain('Guardadas:')
    expect(source).toContain('No guardadas:')
    expect(source).not.toContain('Menú guardado correctamente')
  })
})
