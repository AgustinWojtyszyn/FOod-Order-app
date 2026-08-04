import { resolveCustomerName } from '../order/orderCustomerName'
import { normalizeOrderItemsForService, normalizeOrderPayloadForService } from '../order/orderItemNormalization'
import { hasHiddenOrderMenuSelection } from '../order/menuDisplay'
import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'
import { isBeverageOption } from '../order/orderBusinessRules'

const GENNEIA_BEVERAGE_TITLE = 'Bebidas (solo Genneia)'

export const buildEditOrderPayload = ({
  formData,
  user,
  service,
  selectedItemsList,
  customOptions,
  customResponses,
  originalOrder
}) => {
  const isEmptyResponse = (value) => {
    if (value === null || value === undefined) return true
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === 'string') return value.trim() === ''
    return false
  }

  const normalizedService = (service || 'lunch').toLowerCase()
  const dinnerOverrideChoice = customResponses?.['dinner-special']
  const hasDinnerOverrideChoice = !isEmptyResponse(dinnerOverrideChoice)
  const company = getCompanyByLocationOrSlug(originalOrder?.company_slug || originalOrder?.company || originalOrder?.location || formData?.location)
    || getCompanyByLocationOrSlug(formData?.location)
  const isGenneia = (company?.slug || '').toLowerCase() === 'genneia'

  const customResponsesArray = (customOptions || [])
    .filter(opt => {
      if (!opt?.active) return false
      const response = customResponses?.[opt.id]
      return !isEmptyResponse(response)
    })
    .map(option => ({
      id: option.id,
      title: isGenneia && isBeverageOption(option) ? GENNEIA_BEVERAGE_TITLE : option.title,
      response: customResponses?.[option.id]
    }))

  const userName = resolveCustomerName({ formData, user })

  const originalItems = Array.isArray(originalOrder?.items) ? originalOrder.items : []
  const itemsForPayload = (selectedItemsList || []).length === 0 && hasHiddenOrderMenuSelection(originalItems)
    ? originalItems
    : (selectedItemsList || [])

  const itemsPayload = (normalizedService === 'dinner' && hasDinnerOverrideChoice && itemsForPayload.length === 0)
    ? [{ id: 'dinner-override', name: `Cena: ${dinnerOverrideChoice}`, quantity: 1, isDinnerOverride: true }]
    : normalizeOrderItemsForService(normalizedService, itemsForPayload).map(item => ({
        id: item.id,
        name: item.name,
        quantity: 1,
        slotIndex: Number.isFinite(item?.slotIndex) ? item.slotIndex : undefined
      }))

  const customResponsesPayload = (normalizedService === 'dinner' && hasDinnerOverrideChoice && itemsForPayload.length === 0)
    ? [
        {
          id: 'dinner-special',
          title: (customOptions || []).find(opt => opt?.id === 'dinner-special')?.title || 'Opción de cena',
          response: dinnerOverrideChoice
        },
        ...customResponsesArray.filter((response) => response.id !== 'dinner-special')
      ]
    : customResponsesArray

  return normalizeOrderPayloadForService({
    service: normalizedService,
    location: formData?.location,
    customer_name: userName,
    customer_email: formData?.email || user?.email,
    customer_phone: formData?.phone,
    items: itemsPayload,
    comments: formData?.comments,
    custom_responses: customResponsesPayload
  })
}
