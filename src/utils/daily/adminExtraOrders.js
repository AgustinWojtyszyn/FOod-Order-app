const isAdminExtraOrder = (order = {}) =>
  String(order?.order_origin || '').toLowerCase() === 'admin_extra' ||
  Boolean(order?.created_by_admin_id || order?.admin_extra_created_at)

const getAdminExtraOrderLabel = (order = {}) =>
  isAdminExtraOrder(order) ? 'Extra' : 'Normal'

export {
  getAdminExtraOrderLabel,
  isAdminExtraOrder
}
