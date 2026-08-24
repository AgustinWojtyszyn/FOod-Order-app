export const GREIF_DEFAULT_SNACK_RESPONSE_ID = 'greif-default-refrigerio'
export const GREIF_DEFAULT_SNACK_LABEL = 'Refrigerio'

const normalizeSlug = (value = '') => String(value || '').trim().toLowerCase()

const isGreifCompany = (companySlug = '') => normalizeSlug(companySlug) === 'greif'

const isGreifDefaultSnackResponse = (response = {}) =>
  String(response?.id || '').trim() === GREIF_DEFAULT_SNACK_RESPONSE_ID ||
  response?.auto_applied === true && String(response?.source || '') === GREIF_DEFAULT_SNACK_RESPONSE_ID

export const withGreifDefaultSnackResponse = ({
  companySlug = '',
  service = 'lunch',
  responses = [],
  menuQuantity = 0
} = {}) => {
  const sourceResponses = Array.isArray(responses) ? responses.filter(Boolean) : []
  const quantity = Number(menuQuantity || 0)

  if (!isGreifCompany(companySlug) || service === 'dinner' || !Number.isFinite(quantity) || quantity <= 0) {
    return sourceResponses
  }

  const snackResponse = {
    id: GREIF_DEFAULT_SNACK_RESPONSE_ID,
    title: GREIF_DEFAULT_SNACK_LABEL,
    response: GREIF_DEFAULT_SNACK_LABEL,
    quantity,
    quantities: {
      [GREIF_DEFAULT_SNACK_LABEL]: quantity
    },
    auto_applied: true,
    source: GREIF_DEFAULT_SNACK_RESPONSE_ID
  }

  return [
    ...sourceResponses.filter(response => !isGreifDefaultSnackResponse(response)),
    snackResponse
  ]
}
