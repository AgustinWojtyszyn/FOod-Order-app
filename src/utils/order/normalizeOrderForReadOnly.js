// Read-only helper.
// Do not use in submit, update, edit payload builders, or idempotency logic.
// Keeps raw order.items and order.custom_responses untouched.
// normalizedItems / normalizedCustomResponses must not be mutated in place.
import { normalizeOrderItemsForService } from './orderItemNormalization'

const safeParseArray = (value) => {
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

const normalizeOrderForReadOnly = (order = {}) => {
  const parsedItems = safeParseArray(order?.items)
  const isAdminExtra = String(order?.order_origin || '').toLowerCase() === 'admin_extra' ||
    Boolean(order?.created_by_admin_id || order?.admin_extra_created_at)
  const normalizedItems = isAdminExtra
    ? parsedItems
    : normalizeOrderItemsForService(order?.service || 'lunch', parsedItems)
  const normalizedCustomResponses = safeParseArray(order?.custom_responses)
  return {
    ...order,
    normalizedItems,
    normalizedCustomResponses
  }
}

export { normalizeOrderForReadOnly }
