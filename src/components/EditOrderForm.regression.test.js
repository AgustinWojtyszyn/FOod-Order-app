import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./EditOrderForm.jsx', import.meta.url), 'utf8')

describe('EditOrderForm regression guards', () => {
  it('preserva Administración ServiFood cuando es la empresa original del pedido', () => {
    expect(source).toContain('originalCompany?.slug === ADMIN_SERVIFOOD_SLUG')
    expect(source).toContain('appendOriginalLocation(baseLocations, originalLocation)')
  })
})
