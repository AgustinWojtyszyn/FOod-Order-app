import { ordersService } from '../../services/orders'
import { buildIdempotencyStorageKey, generateIdempotencyKey } from './orderIdempotency'
import { buildOrderPayload } from './orderPayload'
import { hasDinnerOverrideInResponses } from './orderBusinessRules'
import { normalizeOrderItemsForService } from './orderItemNormalization'
import { hasHiddenOrderMenuSelection, hasSyntheticFallbackMenuSelection } from './menuDisplay'

const ACTIVE_ORDER_STATUSES = new Set(['pending'])
const DUPLICATE_ORDER_MESSAGE = 'Ya tenés un pedido registrado para esta fecha y servicio.'
const INVALID_MENU_MESSAGE = 'El menú quedó desactualizado o no está disponible. Recargá la página e intentá nuevamente.'

const hasActiveOrderForDelivery = (orders = [], deliveryDate, service) =>
  orders.some(order => {
    const orderService = (order?.service || 'lunch').toLowerCase()
    const orderStatus = (order?.status || '').toLowerCase()
    return order?.delivery_date === deliveryDate &&
      orderService === service &&
      ACTIVE_ORDER_STATUSES.has(orderStatus)
  })

const submitOrders = async ({
  turnosSeleccionados,
  selectedItemsList,
  selectedItemsListDinner,
  customResponsesArray,
  customResponsesDinnerArray,
  dinnerOverrideChoice,
  user,
  formData,
  deliveryDate,
  deliveryDates,
  companySlug = ''
}) => {
  const createdOrderIds = []
  const { data: existingOrders, error: existingOrdersError } = await ordersService.getOrders(user.id, {
    force: true,
    limit: 200,
    status: 'pending'
  })

  if (existingOrdersError) {
    return {
      ok: false,
      errorMessage: 'No pudimos validar si ya tenés un pedido para esta fecha. Intentá nuevamente.',
      forceLunchOnly: false
    }
  }

  for (const service of turnosSeleccionados) {
    const isDinner = service === 'dinner'
    const serviceDeliveryDate = deliveryDates?.[service] || deliveryDate

    if (hasActiveOrderForDelivery(existingOrders || [], serviceDeliveryDate, service)) {
      return {
        ok: false,
        errorMessage: DUPLICATE_ORDER_MESSAGE,
        forceLunchOnly: false
      }
    }

    const overrideChoice = isDinner ? dinnerOverrideChoice : null
    const rawItemsForService = isDinner ? selectedItemsListDinner : selectedItemsList
    const itemsForService = normalizeOrderItemsForService(service, rawItemsForService)
    const responsesForService = isDinner ? customResponsesDinnerArray : customResponsesArray

    if (hasSyntheticFallbackMenuSelection(rawItemsForService)) {
      return {
        ok: false,
        errorMessage: INVALID_MENU_MESSAGE,
        forceLunchOnly: false
      }
    }

    if (hasHiddenOrderMenuSelection(itemsForService, companySlug)) {
      return {
        ok: false,
        errorMessage: 'Esa opción de menú no está disponible para pedidos.',
        forceLunchOnly: false
      }
    }

    if ((rawItemsForService || []).length > 1) {
      return {
        ok: false,
        errorMessage: 'Solo podés seleccionar 1 comida principal por persona para almuerzo o cena.',
        forceLunchOnly: false
      }
    }

    if (isDinner) {
      const hasOverride = hasDinnerOverrideInResponses(responsesForService)
      if (itemsForService.length > 0 && hasOverride) {
        return {
          ok: false,
          errorMessage: 'Para cena elegí menú o la opción de cena, no ambas.',
          forceLunchOnly: false
        }
      }
    }

    const totalItems = itemsForService.length
    const { orderData, idempotencySignature } = buildOrderPayload({
      service,
      user,
      formData,
      deliveryDate: serviceDeliveryDate,
      itemsForService,
      responsesForService,
      dinnerOverrideChoice: overrideChoice,
      totalItems,
      idempotencyKey: null,
      companySlug
    })

    const idempotencyStorageKey = buildIdempotencyStorageKey(
      itemsForService,
      formData.location,
      idempotencySignature,
      service,
      user?.id || 'anon'
    )

    let idempotencyKey = null
    if (typeof window !== 'undefined') {
      const existingKey = sessionStorage.getItem(idempotencyStorageKey)
      idempotencyKey = existingKey || generateIdempotencyKey()
      sessionStorage.setItem(idempotencyStorageKey, idempotencyKey)
    } else {
      idempotencyKey = generateIdempotencyKey()
    }

    orderData.idempotency_key = idempotencyKey

    const { data, error } = await ordersService.createOrder(orderData)

    if (error) {
      const msg = typeof error === 'string' ? error : (error.message || JSON.stringify(error))
      if (msg.includes('duplicate_active_order') || msg.includes('orders_active_user_delivery_service_uniq')) {
        return {
          ok: false,
          errorMessage: DUPLICATE_ORDER_MESSAGE,
          forceLunchOnly: false
        }
      }
      if (msg.includes('location_not_allowed') || msg.includes('location_required')) {
        return {
          ok: false,
          errorMessage: 'No tenés autorización para pedir en esa locación.',
          forceLunchOnly: false
        }
      }
      if (msg.toLowerCase().includes('order_window_closed')) {
        return {
          ok: false,
          errorMessage: 'Pedidos cerrados para tu sede. Revisá el horario indicado e intentá dentro de la ventana habilitada.',
          forceLunchOnly: false
        }
      }
      if (msg.includes('dinner') || msg.toLowerCase().includes('service') || msg.includes('feature')) {
        return {
          ok: false,
          errorMessage: 'No tenés habilitada la cena. Deja solo almuerzo o pedí alta a un admin.',
          forceLunchOnly: true
        }
      }
      if (msg.includes('violates row-level security policy') || msg.includes('new row violates row-level security')) {
        return {
          ok: false,
          errorMessage: 'Ya tienes un pedido pendiente. Espera hasta que se archive para crear uno nuevo.',
          forceLunchOnly: false
        }
      }
      return {
        ok: false,
        errorMessage: 'No pudimos crear el pedido. Intentá nuevamente.',
        forceLunchOnly: false
      }
    }

    const createdId = (() => {
      if (!data) return null
      if (Array.isArray(data)) {
        const first = data[0]
        return first?.id || first?.order_id || null
      }
      if (typeof data === 'object') {
        return data.id || data.order_id || data?.order?.id || null
      }
      return null
    })()
    if (createdId) {
      createdOrderIds.push(createdId)
    }
  }

  return { ok: true, createdOrderIds }
}

export { submitOrders }
