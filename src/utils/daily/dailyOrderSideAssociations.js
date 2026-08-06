import { normalizeOrderForReadOnly } from '../order/normalizeOrderForReadOnly'

const normalizeText = (value) => String(value ?? '').trim()

const normalizeKey = (value) =>
  normalizeText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const toArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const valueToText = (value) => {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(', ')
  return normalizeText(value)
}

const unique = (values = []) => [...new Set(values.map(normalizeText).filter(Boolean))]

const getItemQuantity = (item = {}) => {
  const quantity = Number(item.quantity ?? item.qty ?? 1)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

const getItemLabel = (item = {}) => {
  const name = normalizeText(item.name || item.title || item.menu || item.label)
  const option = normalizeText(item.option || item.selected_option || item.choice)
  return [name, option].filter(Boolean).join(' - ') || 'Sin menú / opción'
}

const getNormalizedItems = (order = {}) => {
  const { normalizedItems } = normalizeOrderForReadOnly(order)
  return toArray(normalizedItems).map((item, index) => ({
    raw: item,
    index,
    label: getItemLabel(item),
    quantity: getItemQuantity(item)
  }))
}

const getNormalizedResponses = (order = {}) => {
  const { normalizedCustomResponses } = normalizeOrderForReadOnly(order)
  return toArray(normalizedCustomResponses)
}

const isSideResponse = (response = {}) =>
  normalizeKey(response.title || response.label || '').includes('guarn')

const getSideLabels = (response = {}) => {
  if (response?.quantities && typeof response.quantities === 'object') {
    return Object.entries(response.quantities).flatMap(([label, quantity]) => {
      const count = Number(quantity) || 0
      return count > 0 ? Array.from({ length: count }, () => normalizeText(label)).filter(Boolean) : []
    })
  }
  const answer = valueToText(response.answer ?? response.response ?? response.value)
  const optionText = valueToText(response.options)
  const combined = [answer, optionText].filter(Boolean).join(', ')
  return combined.split(',').map(normalizeText).filter(Boolean)
}

const getItemIdentityValues = (item = {}) => {
  const raw = item.raw || item
  return unique([
    raw?.id,
    raw?.item_id,
    raw?.itemId,
    raw?.menu_item_id,
    raw?.menuItemId,
    raw?.menu_id,
    raw?.menuId,
    raw?.selectedItemId,
    raw?.slotIndex,
    raw?.item_slot_index,
    item.index
  ])
}

const getResponseIdentityValues = (response = {}) => unique([
  response.item_id,
  response.itemId,
  response.menu_item_id,
  response.menuItemId,
  response.menu_id,
  response.menuId,
  response.selectedItemId,
  response.slotIndex,
  response.item_slot_index
])

const getItemNameValues = (item = {}) => {
  const raw = item.raw || item
  return unique([
    item.label,
    raw?.name,
    raw?.title,
    raw?.menu,
    raw?.label,
    raw?.option,
    raw?.selected_option,
    raw?.choice
  ])
}

const getResponseNameValues = (response = {}) => unique([
  response.item_name,
  response.itemName,
  response.menu,
  response.menu_name,
  response.menuName,
  response.name,
  response.item
])

const findUniqueMatch = (items = [], predicate) => {
  const matches = items.filter(predicate)
  return matches.length === 1 ? matches[0] : null
}

export const findItemForSideResponse = (order = {}, response = {}) => {
  const items = getNormalizedItems(order)
  if (!items.length) return { item: null, reason: 'no-items' }

  const identityValues = getResponseIdentityValues(response)
  if (identityValues.length) {
    const normalizedIds = identityValues.map(normalizeKey)
    const item = findUniqueMatch(items, (candidate) => {
      const candidateIds = getItemIdentityValues(candidate).map(normalizeKey)
      return candidateIds.some((value) => normalizedIds.includes(value))
    })
    return item ? { item, reason: 'metadata' } : { item: null, reason: 'ambiguous-metadata' }
  }

  const nameValues = getResponseNameValues(response)
  if (nameValues.length) {
    const normalizedNames = nameValues.map(normalizeKey)
    const item = findUniqueMatch(items, (candidate) => {
      const candidateNames = getItemNameValues(candidate).map(normalizeKey)
      return candidateNames.some((value) => normalizedNames.includes(value))
    })
    return item ? { item, reason: 'metadata' } : { item: null, reason: 'ambiguous-metadata' }
  }

  if (items.length === 1) return { item: items[0], reason: 'single-item' }
  return { item: null, reason: 'unassigned' }
}

export const getSideAssociationsForOrder = (order = {}) =>
  getNormalizedResponses(order).flatMap((response) => {
    if (!isSideResponse(response)) return []
    const labels = getSideLabels(response)
    if (!labels.length) return []

    const match = findItemForSideResponse(order, response)
    return labels.map((label) => ({
      label,
      response,
      item: match.item,
      itemLabel: match.item?.label || '',
      assigned: Boolean(match.item),
      reason: match.reason,
      displayLabel: match.item ? label : `${label} (sin menú asociado)`
    }))
  })

export const getSideSummaryForOrder = (order = {}) => {
  const associations = getSideAssociationsForOrder(order)
  const displayLabels = unique(associations.map((association) => association.displayLabel))

  return {
    associations,
    assigned: associations.filter((association) => association.assigned),
    unassigned: associations.filter((association) => !association.assigned),
    summaryText: displayLabels.join(', '),
    plainText: unique(associations.map((association) => association.label)).join(', '),
    hasUnassigned: associations.some((association) => !association.assigned)
  }
}
