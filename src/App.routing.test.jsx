import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'App.jsx'), 'utf8')

describe('App route guards', () => {
  it('does not turn consumption report access into a global redirect', () => {
    expect(source).not.toContain('isLimitedConsumptionViewer')
    expect(source).not.toContain('canLimitedConsumptionViewerUseRoute')
    expect(source).not.toContain('Navigate to="/consumption-report"')
  })

  it('keeps the consumption report as an explicit protected route', () => {
    expect(source).toContain("path=\"/consumption-report\"")
    expect(source).toContain('<Route element={<AdminLayoutRoute')
  })
})
