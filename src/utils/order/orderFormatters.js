import { getMenuDisplay } from './menuDisplay'

export const buildOrderItemLabel = (item = {}) => {
  if (item?.isDinnerOverride) {
    return (item?.name || '').toString().trim() || 'Cena'
  }
  const persistedItem = { ...item }
  delete persistedItem.displayName
  delete persistedItem.displaySlotIndex
  const { label, dish } = getMenuDisplay(persistedItem, item?.slotIndex ?? 0)
  if (!label && !dish) return 'Item'
  if (!dish) return label
  return `${label} - ${dish}`
}

export const formatResponseValue = (value) => {
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined) return ''
  return String(value)
}

export const buildOptionsSummary = (responses = []) => {
  const list = Array.isArray(responses) ? responses : []
  for (const resp of list) {
    if (!resp) continue
    const value = resp.response ?? resp.answer ?? resp.value ?? resp.options
    const hasValue = Array.isArray(value)
      ? value.length > 0
      : (typeof value === 'string' ? value.trim() !== '' : value !== null && value !== undefined)
    if (!hasValue) continue
    return (resp.title || 'Opcion').toString().trim()
  }
  return ''
}

export const buildSuggestionSummary = (
  order,
  hasMainMenuSelected,
  buildOptionsSummaryFn
) => {
  if (!order) return ''
  const items = Array.isArray(order.items) ? order.items : []
  if (hasMainMenuSelected(items)) {
    return 'Menú principal'
  }
  const optionTitle = buildOptionsSummaryFn(order.custom_responses)
  if (optionTitle) return optionTitle
  return 'Pedido anterior'
}

export const buildRepeatSummary = (
  order,
  hasMainMenuSelected,
  buildOptionsSummaryFn
) => buildSuggestionSummary(order, hasMainMenuSelected, buildOptionsSummaryFn)
