import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'App.jsx'), 'utf8')

describe('App route guards', () => {
  it('allows limited consumption viewers to keep using normal order routes', () => {
    expect(source).toContain('USER_ROUTE_PATHS_FOR_CONSUMPTION_VIEWERS')
    expect(source).toContain("'/order'")
    expect(source).toContain("pathname.startsWith('/order/')")
    expect(source).toContain("pathname.startsWith('/orders/')")
    expect(source).toContain('!canLimitedConsumptionViewerUseRoute(location.pathname)')
  })
})
