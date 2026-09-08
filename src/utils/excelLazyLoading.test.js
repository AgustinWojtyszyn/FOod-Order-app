import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const frontendExcelFiles = [
  './auditLogUtils.js',
  './daily/exportDailyOrdersExcel.js',
  './daily/exportDailyOrderNotesExcel.js',
  './daily/exportLateAdminExtraHistoryExcel.js',
  './cafeteria/exportCafeteriaOrdersExcel.js',
  '../services/totalizerService.js',
  '../hooks/monthly/useMonthlyExport.js',
  '../pages/TendenciasPage.jsx',
  '../pages/ConsumptionReportPage.jsx'
]

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const hasStaticExcelJsImport = (source) => (
  /\bfrom\s+['"]exceljs['"]/.test(source)
  || /^\s*import\s+['"]exceljs['"]/m.test(source)
)

describe('ExcelJS browser loading', () => {
  it('keeps ExcelJS out of frontend modules until an export is requested', () => {
    frontendExcelFiles.forEach((relativePath) => {
      expect(hasStaticExcelJsImport(readSource(relativePath)), relativePath).toBe(false)
    })
  })

  it('loads ExcelJS through the shared dynamic loader', () => {
    const loaderSource = readSource('./loadExcelJS.js')
    expect(loaderSource).toContain("import('exceljs')")
    expect(loaderSource).toContain('excelJsPromise')
  })
})
