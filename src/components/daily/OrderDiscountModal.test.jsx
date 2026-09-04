import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'OrderDiscountModal.jsx'), 'utf8')

describe('OrderDiscountModal', () => {
  it('labels each order context explicitly', () => {
    expect(source).toContain("if (order.order_origin === 'admin_extra') return 'admin_extra'")
    expect(source).toContain("if (order.status === 'post_report_extra') return 'post_report_extra'")
    expect(source).toContain("if (context === 'admin_extra') return 'Pedido extra'")
    expect(source).toContain("if (context === 'post_report_extra') return 'Extra post reporte'")
    expect(source).toContain("return 'Normal'")
  })

  it('does not display an explicit zero quantity as one available item', () => {
    expect(source).toContain("Object.prototype.hasOwnProperty.call(item, 'quantity')")
    expect(source).toContain('return Number.isFinite(quantity) && quantity > 0 ? quantity : 0')
    expect(source).toContain('order.items.some((item) => getItemQuantity(item) > 0)')
  })
})
