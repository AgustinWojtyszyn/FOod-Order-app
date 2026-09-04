import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'AdminExtraOrderModal.jsx'), 'utf8')

describe('AdminExtraOrderModal admin extra beverage options', () => {
  it('adds Agua saborizada inside the admin extra flow without depending on a company-specific DB update', () => {
    expect(source).toContain("const ADMIN_EXTRA_BEVERAGE_LABEL = 'Agua saborizada'")
    expect(source).toContain('withAdminExtraBeverageOption(nextCustomOptions)')
    expect(source).toContain('return [ADMIN_EXTRA_BEVERAGE_OPTION, ...normalizedOptions]')
    expect(source).toContain("options: ['Agua', 'Soda', ADMIN_EXTRA_BEVERAGE_LABEL, 'Coca cola', 'Coca Zero']")
  })
})
