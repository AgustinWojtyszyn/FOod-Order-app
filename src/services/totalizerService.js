import ExcelJS from 'exceljs'
import { supabase } from './supabase'

const normalizeService = (service = 'all') => {
  const value = String(service || 'all').toLowerCase()
  return ['almuerzo', 'cena'].includes(value) ? value : 'all'
}

const unwrapRpc = async (promise) => {
  const { data, error } = await promise
  return { data, error }
}

export const totalizerService = {
  getDailyPayload: ({ deliveryDate, service = 'all' }) =>
    unwrapRpc(supabase.rpc('totalizer_get_daily_payload', {
      p_delivery_date: deliveryDate,
      p_service: normalizeService(service)
    })),

  saveKitchenValue: ({ deliveryDate, accountId, service, conceptId, quantity }) =>
    unwrapRpc(supabase.rpc('totalizer_upsert_value', {
      p_delivery_date: deliveryDate,
      p_account_id: accountId,
      p_service: normalizeService(service),
      p_concept_id: conceptId,
      p_value_type: 'kitchen',
      p_quantity: quantity
    })),

  saveManualTotalizerValue: ({ deliveryDate, accountId, service, conceptId, quantity }) =>
    unwrapRpc(supabase.rpc('totalizer_upsert_value', {
      p_delivery_date: deliveryDate,
      p_account_id: accountId,
      p_service: normalizeService(service),
      p_concept_id: conceptId,
      p_value_type: 'totalizer',
      p_quantity: quantity
    })),

  saveAdjustment: ({ deliveryDate, accountId, service, conceptId, quantity }) =>
    unwrapRpc(supabase.rpc('totalizer_upsert_value', {
      p_delivery_date: deliveryDate,
      p_account_id: accountId,
      p_service: normalizeService(service),
      p_concept_id: conceptId,
      p_value_type: 'adjustment',
      p_quantity: quantity
    })),

  saveOrderNote: ({ remitoId, orderNoteNumber }) =>
    unwrapRpc(supabase.rpc('totalizer_save_order_note', {
      p_remito_id: remitoId,
      p_order_note_number: orderNoteNumber
    })),

  createConcept: ({ name, code, category, countsAsMenu, sortOrder, active }) =>
    unwrapRpc(supabase.rpc('totalizer_create_concept', {
      p_name: name,
      p_code: code,
      p_category: category,
      p_counts_as_menu: !!countsAsMenu,
      p_sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 999,
      p_active: active !== false
    })),

  createMapping: ({ conceptId, sourceKind, sourceTitle, sourceValue, companySlug, matchMode, priority }) =>
    unwrapRpc(supabase.rpc('totalizer_create_mapping', {
      p_concept_id: conceptId,
      p_source_kind: sourceKind,
      p_source_title: sourceTitle,
      p_source_value: sourceValue,
      p_company_slug: companySlug || null,
      p_match_mode: matchMode || 'exact',
      p_priority: Number.isFinite(Number(priority)) ? Number(priority) : 100
    })),

  createManualAccount: ({ name, sortOrder, active }) =>
    unwrapRpc(supabase.rpc('totalizer_create_manual_account', {
      p_name: name,
      p_sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 999,
      p_active: active !== false
    }))
}

const autoFitColumns = (worksheet) => {
  worksheet.columns.forEach((column) => {
    let maxLength = 10
    column.eachCell({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value ?? '').length)
    })
    column.width = Math.min(Math.max(maxLength + 2, 12), 42)
  })
}

const downloadWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const exportTotalizerWorkbook = async ({
  deliveryDate,
  service,
  accounts,
  concepts,
  totalizerRows,
  kitchenRows,
  reconciliationRows,
  remitoRows
}) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ServiFood'
  workbook.created = new Date()

  const totalizerSheet = workbook.addWorksheet('TOTALIZADORA')
  totalizerSheet.addRow(['Concepto', ...accounts.map((account) => account.name || account.account_name || account.slug), 'Total'])
  for (const concept of concepts) {
    const rowValues = accounts.map((account) => {
      const row = totalizerRows.find((item) => item.account_id === account.id && item.concept_id === concept.id)
      return Number(row?.total_quantity ?? row?.quantity ?? row?.total ?? 0)
    })
    totalizerSheet.addRow([concept.name, ...rowValues, rowValues.reduce((sum, value) => sum + Number(value || 0), 0)])
  }

  const kitchenSheet = workbook.addWorksheet('COCINA')
  kitchenSheet.addRow(['Empresa', 'Concepto', 'Cantidad Totalizadora', 'Cantidad Cocina'])
  kitchenRows.forEach((row) => {
    kitchenSheet.addRow([
      row.account_name || row.company_name || row.company_slug || '',
      row.concept_name || '',
      row.totalizer_quantity ?? row.totalizer_total ?? row.total_quantity ?? '',
      row.kitchen_quantity ?? row.quantity ?? ''
    ])
  })

  const reconciliationSheet = workbook.addWorksheet('CONCILIACION')
  reconciliationSheet.addRow(['Empresa', 'Concepto', 'Totalizadora', 'Cocina', 'Diferencia', 'Estado'])
  reconciliationRows.forEach((row) => {
    reconciliationSheet.addRow([
      row.account_name || row.company_name || row.company_slug || '',
      row.concept_name || '',
      row.totalizer_quantity ?? row.totalizer_total ?? '',
      row.kitchen_quantity ?? '',
      row.difference ?? '',
      row.status || ''
    ])
  })

  const remitoSheet = workbook.addWorksheet('REMITOS')
  remitoSheet.addRow(['Empresa', 'Sede', 'Remito', 'Nota de pedido', 'Total remito', 'Total calculado', 'Diferencia'])
  remitoRows.forEach((row) => {
    remitoSheet.addRow([
      row.account_name || row.company_name || row.company_slug || '',
      row.location_key || row.location_name || '',
      row.remito_number || '',
      row.order_note_number || '',
      row.remito_total ?? '',
      row.calculated_menu_total ?? row.menu_total ?? '',
      row.difference ?? ''
    ])
  })

  workbook.eachSheet((sheet) => {
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    autoFitColumns(sheet)
  })

  await downloadWorkbook(workbook, `totalizadora-${deliveryDate}-${normalizeService(service)}.xlsx`)
}
