import { buildOrderItemLabel } from './orderFormatters'
import { resolveCustomerName } from './orderCustomerName'
import { computePayloadSignature } from './orderIdempotency'
import { normalizeOrderItemsForService, normalizeOrderPayloadForService } from './orderItemNormalization'
import { withGreifDefaultSnackResponse } from './greifDefaultSnack'

const buildOrderPayload = ({
  service,
  user,
  formData,
  deliveryDate,
  itemsForService,
  responsesForService,
  dinnerOverrideChoice,
  totalItems: _totalItems,
  idempotencyKey,
  companySlug = ''
}) => {
  const isDinner = service === 'dinner'

  const serviceItems = normalizeOrderItemsForService(service, itemsForService)
  const itemsToSend = (isDinner && dinnerOverrideChoice && serviceItems.length === 0)
    ? [{ id: 'dinner-override', name: `Cena: ${dinnerOverrideChoice}`, quantity: 1, isDinnerOverride: true }]
    : serviceItems

  const normalizedItemsToSend = itemsToSend.map(item => ({
    ...item,
    name: buildOrderItemLabel(item),
    quantity: 1
  }))
  const responsesToSend = withGreifDefaultSnackResponse({
    companySlug,
    service,
    responses: responsesForService,
    menuQuantity: normalizedItemsToSend.length
  })

  const idempotencySignature = computePayloadSignature(
    normalizedItemsToSend,
    responsesToSend,
    formData.comments,
    deliveryDate,
    formData.location,
    service
  )

  const orderData = normalizeOrderPayloadForService({
    user_id: user.id,
    location: formData.location,
    customer_name: resolveCustomerName({ formData, user }),
    customer_email: formData.email || user?.email,
    customer_phone: formData.phone,
    items: normalizedItemsToSend.map(item => ({
      id: item.id,
      name: item.name,
      quantity: 1,
      slotIndex: Number.isFinite(item?.slotIndex) ? item.slotIndex : undefined
    })),
    comments: formData.comments,
    delivery_date: deliveryDate,
    status: 'pending',
    total_items: normalizedItemsToSend.length,
    custom_responses: responsesToSend,
    idempotency_key: idempotencyKey,
    service
  })

  return {
    orderData,
    normalizedItemsToSend,
    idempotencySignature
  }
}

export { buildOrderPayload }
