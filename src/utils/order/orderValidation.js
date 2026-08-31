import { getTomorrowISOInTimeZone } from '../dateUtils'
import { resolveCustomerName } from './orderCustomerName'
import { canChooseCustomSide } from './orderCustomSideRules'
import { getMenuBeverageTitle, hasFruitDessertChoiceRules, hasGenneiaOptionRules, requiresMenuBeverageChoice } from './companySpecialRules'
import { hasHiddenOrderMenuSelection } from './menuDisplay'
import { isBeverageOption, isBeverageOrDessertOption } from './orderBusinessRules'
import { isGreifCompany, isGreifRefrigerioMenuItem } from './greifDefaultSnack'
import { formatScheduleRange } from './orderSchedule'

const isCustomSideOption = (opt) => (opt?.title || '').toLowerCase().includes('guarn')
const SINGLE_MENU_MESSAGE = 'Solo podés seleccionar 1 comida principal por persona para almuerzo o cena.'
const GENNEIA_BEVERAGE_TITLE = 'Bebidas (solo Genneia)'

const hasValidResponse = (response) => {
  if (!response) return false
  if (Array.isArray(response) && response.length === 0) return false
  if (typeof response === 'string' && response.trim() === '') return false
  if (typeof response === 'object' && !Array.isArray(response)) {
    return Object.values(response).some(hasValidResponse)
  }
  return true
}

const normalizeOptionText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const optionHasKeyword = (option = {}, keyword) => {
  const title = normalizeOptionText(option.title)
  const values = Array.isArray(option.options) ? option.options : []
  return title.includes(keyword) || values.some((value) => normalizeOptionText(value).includes(keyword))
}

const getGenneiaDessertChoiceRequirement = ({ options = [], responses = {}, isGenneiaPostreOption }) => {
  const fruitOptions = options.filter((opt) => optionHasKeyword(opt, 'fruta'))
  const dessertOptions = options.filter((opt) => optionHasKeyword(opt, 'postre'))
  const hasDessertDayRequirement = dessertOptions.some((opt) => isGenneiaPostreOption(opt))

  if (!hasDessertDayRequirement || fruitOptions.length === 0 || dessertOptions.length === 0) {
    return null
  }

  const choiceOptions = [...fruitOptions, ...dessertOptions]
  const optionIds = new Set(choiceOptions.map((opt) => opt.id))
  const hasSelection = choiceOptions.some((opt) => hasValidResponse(responses?.[opt.id]))

  return {
    optionIds,
    hasSelection,
    missingTitle: dessertOptions[0]?.title || 'Postre'
  }
}

const getMissingRequiredOptionTitles = ({
  options = [],
  responses = {},
  isRequiredOption,
  isSkippedOption = () => false,
  enableDessertChoiceRule = false
}) => {
  const availableOptions = (options || []).filter((opt) => !isSkippedOption(opt))
  const dessertChoiceRequirement = enableDessertChoiceRule
    ? getGenneiaDessertChoiceRequirement({
      options: availableOptions,
      responses,
      isGenneiaPostreOption: isRequiredOption
    })
    : null

  const missing = availableOptions
    .filter((opt) => {
      if (dessertChoiceRequirement?.optionIds.has(opt.id)) return false
      return isRequiredOption(opt) && !hasValidResponse(responses?.[opt.id])
    })
    .map((opt) => opt.title)

  if (dessertChoiceRequirement && !dessertChoiceRequirement.hasSelection) {
    missing.push(dessertChoiceRequirement.missingTitle)
  }

  return missing
}

const getSelectedItemName = (item = {}) =>
  item.name || item.title || item.menu || item.label || item.option || item.selected_option || ''

const buildCustomResponseForOption = ({ option, response, selectedItems, service, forceTitle = null }) =>
  withSideAssociationMetadata({
    option,
    selectedItems,
    service,
    response: {
      id: option.id,
      title: forceTitle || option.title,
      response
    }
  })

const buildResponsesForOptions = ({ options = [], responses = {}, selectedItems = [], service, isSkippedOption = () => false, getTitle = null }) =>
  (options || [])
    .filter(opt => {
      if (isSkippedOption(opt)) return false
      const response = responses[opt.id]
      if (!response) return false
      if (Array.isArray(response) && response.length === 0) return false
      if (typeof response === 'string' && response.trim() === '') return false
      return true
    })
    .map(opt => buildCustomResponseForOption({
      option: opt,
      selectedItems,
      service,
      response: responses[opt.id],
      forceTitle: typeof getTitle === 'function' ? getTitle(opt) : null
    }))

const withSideAssociationMetadata = ({ response, option, selectedItems, service }) => {
  if (!isCustomSideOption(option)) return response
  if (!Array.isArray(selectedItems) || selectedItems.length !== 1) return response

  const [item] = selectedItems
  const itemId = item?.id ?? item?.item_id ?? item?.itemId ?? item?.menu_item_id ?? item?.menuItemId
  const itemName = getSelectedItemName(item)

  return {
    ...response,
    item_id: itemId,
    itemId,
    slotIndex: item?.slotIndex ?? item?.item_slot_index ?? 0,
    itemName,
    service
  }
}

const validateOrderSubmission = ({
  user,
  formData,
  _locations,
  selectedTurns,
  dinnerEnabled,
  dinnerMenuEnabled,
  pendingLunch,
  pendingDinner,
  visibleLunchOptions,
  visibleDinnerOptions,
  customResponses,
  customResponsesDinner,
  isGenneiaPostreOption,
  getSelectedItemsList,
  getSelectedItemsListDinner,
  getDinnerOverrideChoice,
  dinnerSpecialTitle,
  validateDinnerExclusivity,
  calculateTotal,
  _calculateTotalDinner,
  companyConfig,
  orderSchedule,
  selectedDinnerDate,
  deliveryLocationsByLocation
}) => {
  if (!user?.id) {
    return { error: 'No se pudo validar el usuario. Intenta nuevamente.' }
  }

  if (orderSchedule?.loading) {
    return { error: 'Estamos validando el horario de pedidos. Intentá nuevamente en unos segundos.' }
  }

  if (orderSchedule?.error || orderSchedule?.state === 'error') {
    return { error: 'No pudimos validar el horario de tu sede. Intentá nuevamente en unos segundos.' }
  }

  if (orderSchedule && !orderSchedule.isOpen) {
    const scheduleRange = formatScheduleRange(orderSchedule)
    if (!scheduleRange) {
      return { error: 'Estamos validando el horario de pedidos. Intentá nuevamente en unos segundos.' }
    }
    return {
      error: `Pedidos cerrados. Horario de tu sede: ${scheduleRange} (${orderSchedule.timezone || 'America/Argentina/San_Juan'}).`
    }
  }

  if (pendingLunch && (!dinnerEnabled || !dinnerMenuEnabled || !selectedTurns.dinner)) {
    return { error: 'Ya tenés un pedido registrado para esta fecha y servicio.' }
  }
  if (selectedTurns.dinner && pendingDinner) {
    return { error: 'Ya tenés un pedido registrado para esta fecha y servicio.' }
  }

  if (!formData.location) {
    return { error: 'Por favor selecciona un lugar de trabajo' }
  }

  if (companyConfig?.requiresAuthorizedLocations && !deliveryLocationsByLocation?.has?.(formData.location)) {
    return { error: 'No tenés una locación autorizada para pedir en esta empresa.' }
  }

  const customerName = resolveCustomerName({ formData, user })
  if (!customerName) {
    return { error: 'No pudimos validar tu nombre. Completá tu nombre real en el perfil antes de enviar el pedido.' }
  }

  const lunchSelected = selectedTurns.lunch
  const dinnerSelected = selectedTurns.dinner && dinnerEnabled && dinnerMenuEnabled

  if (!lunchSelected && !dinnerSelected) {
    return { error: 'Selecciona al menos almuerzo o cena.' }
  }

  const selectedItemsList = getSelectedItemsList()
  const selectedItemsListDinner = getSelectedItemsListDinner()
  const isGenneiaCompany = hasGenneiaOptionRules(companyConfig)
  const hasFruitDessertRules = hasFruitDessertChoiceRules(companyConfig)
  const companySlug = (companyConfig?.slug || '').toString().trim().toLowerCase()
  const isGenneiaSlug = companySlug === 'genneia'
  const needsMenuBeverage = requiresMenuBeverageChoice(companyConfig)
  const menuBeverageTitle = getMenuBeverageTitle(companyConfig)

  if (lunchSelected && selectedItemsList.length === 0) {
    return { error: 'Selecciona al menos un plato para almuerzo.' }
  }

  if (lunchSelected && hasHiddenOrderMenuSelection(selectedItemsList, companySlug)) {
    return { error: 'Esa opción de menú no está disponible para pedidos.' }
  }

  if (
    lunchSelected &&
    isGreifCompany(companySlug) &&
    selectedItemsList.some(isGreifRefrigerioMenuItem) &&
    selectedItemsList.some((item) => !isGreifRefrigerioMenuItem(item))
  ) {
    return { error: 'Para Greif elegí Refrigerio o menú, no ambos.' }
  }

  if (lunchSelected && selectedItemsList.length > 1) {
    return { error: SINGLE_MENU_MESSAGE }
  }

  const dinnerOverrideChoice = getDinnerOverrideChoice()

  if (dinnerSelected && selectedItemsListDinner.length === 0 && !dinnerOverrideChoice) {
    return { error: 'Selecciona al menos un plato para cena o una opción de cena.' }
  }

  if (dinnerSelected && hasHiddenOrderMenuSelection(selectedItemsListDinner, companySlug)) {
    return { error: 'Esa opción de menú no está disponible para pedidos.' }
  }

  if (dinnerSelected && selectedItemsListDinner.length > 1) {
    return { error: SINGLE_MENU_MESSAGE }
  }

  let customResponsesArray = []
  if (lunchSelected) {
    const canChooseCustomSideForSelection = selectedItemsList.length > 0
      ? selectedItemsList.every(item => canChooseCustomSide(item))
      : false

    if (!canChooseCustomSideForSelection) {
      const blockedCustomSide = (visibleLunchOptions || []).some(opt => {
        if (!isCustomSideOption(opt)) return false
        return hasValidResponse(customResponses[opt.id])
      })
      if (blockedCustomSide) {
        return { error: 'La guarnición distinta no está disponible para esta opción.' }
      }
    }

    const lunchBeverageOptions = needsMenuBeverage
      ? (visibleLunchOptions || []).filter(isBeverageOption)
      : []
    if (needsMenuBeverage && lunchBeverageOptions.length === 0) {
      return { error: `No pudimos cargar las bebidas para ${companyConfig?.name || 'esta empresa'}. Intentá nuevamente.` }
    }
    if (needsMenuBeverage && !lunchBeverageOptions.some(opt => hasValidResponse(customResponses[opt.id]))) {
      return { error: `Por favor completa (almuerzo): ${menuBeverageTitle}` }
    }

    const missingRequiredOptions = getMissingRequiredOptionTitles({
      options: visibleLunchOptions,
      responses: customResponses,
      isRequiredOption: (opt) => opt.required || isGenneiaPostreOption(opt),
      isSkippedOption: (opt) => isCustomSideOption(opt) && !canChooseCustomSideForSelection,
      enableDessertChoiceRule: hasFruitDessertRules
    })

    if (missingRequiredOptions.length > 0) {
      return { error: `Por favor completa (almuerzo): ${missingRequiredOptions.join(', ')}` }
    }

    customResponsesArray = buildResponsesForOptions({
      options: visibleLunchOptions,
      responses: customResponses,
      selectedItems: selectedItemsList,
      service: 'lunch',
      getTitle: (opt) => {
        if ((isGenneiaSlug || needsMenuBeverage) && isBeverageOption(opt)) return menuBeverageTitle
        return opt.title
      }
    })
  }

  let customResponsesDinnerArray = []
  if (dinnerSelected) {
    const isGenneia = isGenneiaCompany
    const canChooseCustomSideForDinner = selectedItemsListDinner.length > 0
      ? selectedItemsListDinner.every(item => canChooseCustomSide(item))
      : false

    if (isGenneia && !canChooseCustomSideForDinner) {
      const blockedCustomSide = (visibleDinnerOptions || []).some(opt => {
        if (!isCustomSideOption(opt)) return false
        return hasValidResponse(customResponsesDinner[opt.id])
      })
      if (blockedCustomSide) {
        return { error: 'La guarnición distinta no está disponible para esta opción.' }
      }
    }

    const genneiaDinnerBeverageOptions = isGenneiaSlug
      ? (visibleDinnerOptions || []).filter(isBeverageOption)
      : []
    if (isGenneiaSlug && genneiaDinnerBeverageOptions.length === 0) {
      return { error: 'No pudimos cargar las bebidas de cena para Genneia. Intentá nuevamente.' }
    }
    if (isGenneiaSlug && !genneiaDinnerBeverageOptions.some(opt => hasValidResponse(customResponsesDinner[opt.id]))) {
      return { error: 'Para cena completa: Bebidas (solo Genneia)' }
    }
    const dinnerBeverageOptions = needsMenuBeverage
      ? (visibleDinnerOptions || []).filter(isBeverageOption)
      : []
    if (needsMenuBeverage && dinnerBeverageOptions.length === 0) {
      return { error: `No pudimos cargar las bebidas para ${companyConfig?.name || 'esta empresa'}. Intentá nuevamente.` }
    }
    if (needsMenuBeverage && !dinnerBeverageOptions.some(opt => hasValidResponse(customResponsesDinner[opt.id]))) {
      return { error: `Para cena completa: ${menuBeverageTitle}` }
    }

    const missingRequiredOptionsDinner = getMissingRequiredOptionTitles({
      options: visibleDinnerOptions,
      responses: customResponsesDinner,
      isRequiredOption: (opt) => opt.required || isGenneiaPostreOption(opt),
      isSkippedOption: (opt) => {
        if (dinnerOverrideChoice && !isBeverageOrDessertOption(opt)) return true
        return isGenneia && isCustomSideOption(opt) && !canChooseCustomSideForDinner
      },
      enableDessertChoiceRule: hasFruitDessertRules
    })
    if (missingRequiredOptionsDinner.length > 0) {
      return { error: `Para cena completa: ${missingRequiredOptionsDinner.join(', ')}` }
    }

    if (dinnerOverrideChoice) {
      customResponsesDinnerArray = [{
        id: 'dinner-special',
        title: dinnerSpecialTitle || 'Opción de cena',
        response: dinnerOverrideChoice
      }]
    }

    customResponsesDinnerArray = [
      ...customResponsesDinnerArray,
      ...buildResponsesForOptions({
        options: visibleDinnerOptions,
        responses: customResponsesDinner,
        selectedItems: selectedItemsListDinner,
        service: 'dinner',
        isSkippedOption: (opt) => {
          if (dinnerOverrideChoice && !isBeverageOrDessertOption(opt)) return true
          return isGenneia && isCustomSideOption(opt) && !canChooseCustomSideForDinner
        },
        getTitle: (opt) => {
          if ((isGenneiaSlug || needsMenuBeverage) && isBeverageOption(opt)) return menuBeverageTitle
          return opt.title
        }
      })
    ]

  }

  const deliveryDate = getTomorrowISOInTimeZone()
  const deliveryDates = {
    lunch: deliveryDate,
    dinner: selectedDinnerDate || deliveryDate
  }

  const turnosSeleccionados = Object.entries(selectedTurns)
    .filter(([, val]) => val)
    .map(([k]) => k)
    .filter(t => t === 'lunch' || (t === 'dinner' && dinnerEnabled && dinnerMenuEnabled))

  if (dinnerEnabled && dinnerMenuEnabled && turnosSeleccionados.length === 0) {
    return { error: 'Elegí al menos almuerzo o cena.' }
  }

  if (dinnerSelected) {
    const exclusivityError = validateDinnerExclusivity()
    if (exclusivityError) {
      return { error: exclusivityError }
    }
  }

  const dinnerItemsForSummary = (dinnerSelected && selectedItemsListDinner.length === 0 && dinnerOverrideChoice)
    ? [{ id: 'dinner-override', name: `Cena: ${dinnerOverrideChoice}`, quantity: 1, isDinnerOverride: true }]
    : selectedItemsListDinner

  const confirmationData = {
    company: companyConfig?.name || '',
    location: formData.location,
    deliveryLocation: deliveryLocationsByLocation?.get?.(formData.location) || formData.location,
    name: customerName,
    email: formData.email || user?.email || '',
    phone: formData.phone || '',
    deliveryDate,
    deliveryDates,
    turnos: turnosSeleccionados,
    lunchSelected,
    dinnerSelected,
    lunchItems: selectedItemsList,
    dinnerItems: dinnerItemsForSummary,
    lunchOptions: customResponsesArray,
    dinnerOptions: customResponsesDinnerArray,
    comments: formData.comments || '',
    totals: {
      lunch: lunchSelected ? calculateTotal() : 0,
      dinner: dinnerSelected ? (dinnerItemsForSummary?.length || 0) : 0
    }
  }

  return {
    error: '',
    data: {
      selectedItemsList,
      selectedItemsListDinner,
      dinnerOverrideChoice,
      customResponsesArray,
      customResponsesDinnerArray,
      deliveryDate,
      deliveryDates,
      turnosSeleccionados,
      lunchSelected,
      dinnerSelected,
      dinnerItemsForSummary,
      confirmationData
    }
  }
}

export { validateOrderSubmission }
