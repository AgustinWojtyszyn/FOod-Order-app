import { readFile } from 'node:fs/promises'
import { buildRemitoWorkbook } from '../../src/utils/daily/exportDailyOrderNotesExcel.js'

globalThis.fetch = async () => ({
  arrayBuffer: async () => (await readFile('./src/assets/servifood logo.jpg')).buffer
})

const makeProducts = (count) =>
  Array.from({ length: count }, (_, index) => ({
    cantidad: index + 1,
    producto: `Producto de prueba ${index + 1}`,
    category: 'menu'
  }))

const cases = [
  {
    name: 'short',
    remito: {
      companySlug: 'epse',
      companyName: 'EPSE',
      companyDisplayName: 'EPSE - Los Caracoles',
      remitoNumber: 30007,
      deliveryDate: '2026-08-20',
      products: makeProducts(2)
    }
  },
  {
    name: 'long',
    remito: {
      companySlug: 'genneia',
      companyName: 'Genneia',
      companyDisplayName: 'Genneia',
      remitoNumber: 40012,
      deliveryDate: '2026-08-20',
      products: makeProducts(32)
    }
  }
]

for (const testCase of cases) {
  const totalItems = testCase.remito.products.reduce((sum, product) => sum + product.cantidad, 0)
  const { workbook } = await buildRemitoWorkbook([{ ...testCase.remito, totalItems }])
  await workbook.xlsx.writeFile(`.tmp/remito-logo-check/${testCase.name}.xlsx`)
}
