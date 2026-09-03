import { useMemo, useCallback } from 'react'
import { Sound } from '../../utils/Sound'
import { notifyInfo } from '../../utils/notice'
import { useOrderSubmit } from '../useOrderSubmit'
import { useOrderBootstrap } from '../useOrderBootstrap'
import { useOrderRepeatPayload } from './useOrderRepeatPayload'
import { useOrderSuggestionHandlers } from './useOrderSuggestionHandlers'
import { useOrderCompany } from './useOrderCompany'
import { useGenneiaPostreDay } from './useGenneiaPostreDay'
import { useGenneiaPostreRules } from './useGenneiaPostreRules'
import { useCustomSideGuards } from './useCustomSideGuards'
import { useLunchOptionsUI } from './useLunchOptionsUI'
import { useDinnerMenuItemsUI } from './useDinnerMenuItemsUI'
import { useOrderLunchSelection } from './useOrderLunchSelection'
import { useOrderDinnerSelection } from './useOrderDinnerSelection'
import { useOrderCustomResponses } from './useOrderCustomResponses'
import { useOrderTotals } from './useOrderTotals'
import { useOrderFormEffects } from './useOrderFormEffects'
import { useOrderFormState } from './useOrderFormState'
import { useOrderSelectionsState } from './useOrderSelectionsState'
import { useOrderSchedule } from './useOrderSchedule'
import { normalizeGenneiaOptionSections } from '../../utils/order/genneiaOptionSections'
import { getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import {
  isBeverageOrDessertOption,
  isDinnerOverrideValue
} from '../../utils/order/orderBusinessRules'
import { clearDinnerOverrideResponses as clearDinnerOverrideResponsesPure } from '../../utils/order/orderDinnerOverride'

export const useOrderFlowController = ({ user, locationState, navigate } = {}) => {
  const {
    formData, setFormData,
    setMode,
    dinnerEnabled, setDinnerEnabled,
    selectedTurns, setSelectedTurns,
    success, setSuccess,
    hasOrderToday, setHasOrderToday,
    pendingLunch, setPendingLunch,
    pendingDinner, setPendingDinner,
    suggestion, setSuggestion,
    suggestionVisible, setSuggestionVisible,
    suggestionLoading, setSuggestionLoading,
    suggestionSummary, setSuggestionSummary,
    suggestionMode, setSuggestionMode,
    dinnerMenuEnabled
  } = useOrderFormState()

  const {
    menuItems, setMenuItems,
    dinnerMenuItems, setDinnerMenuItems,
    selectedDinnerDate, setSelectedDinnerDate,
    customOptionsLunch, setCustomOptionsLunch,
    customOptionsDinner, setCustomOptionsDinner,
    customResponses, setCustomResponses,
    customResponsesDinner, setCustomResponsesDinner,
    dinnerMenuSpecial, setDinnerMenuSpecial,
    dinnerSpecialChoice, setDinnerSpecialChoice,
    selectedItems, setSelectedItems,
    selectedItemsDinner, setSelectedItemsDinner
  } = useOrderSelectionsState()

  const {
    companySlugParam,
    rawCompanySlug,
    companyConfig,
    companyOptionsSlug,
    companyCatalog,
    isGenneia,
    hasGenneiaRules,
    hasFruitDessertRules,
    locations,
    authorizedLocationsLoading,
    authorizedLocationsError,
    requiresAuthorizedLocations,
    deliveryLocationsByLocation
  } = useOrderCompany()

  const selectedLocationRow = useMemo(
    () => (authorizedLocationRows || []).find((row) => row?.name === formData.location),
    [authorizedLocationRows, formData.location]
  )
  const scheduleLocation = selectedLocationRow?.code || selectedLocationRow?.slug || formData.location
  const schedule = useOrderSchedule({ location: scheduleLocation })

  const { isGenneiaPostreDay } = useGenneiaPostreDay({
    isGenneia: hasFruitDessertRules,
    deliveryDate: getTomorrowISOInTimeZone()
  })

  const isGenneiaPostreOptionLocal = useCallback((option = {}) => {
    if (!hasFruitDessertRules) return false
    const title = (option.title || '').toLowerCase()
    const values = Array.isArray(option.options) ? option.options : []
    const hasFrutaChoice = values.some((value) => (value || '').toLowerCase().includes('fruta'))
    if (title.includes('postre') && hasFrutaChoice) return title.includes('postre')
    if (isGenneiaPostreDay) return title.includes('postre')
    return title.includes('fruta')
  }, [hasFruitDessertRules, isGenneiaPostreDay])

  const activeOptions = useMemo(
    () => (customOptionsLunch || []).filter(opt => opt.active),
    [customOptionsLunch]
  )

  const visibleLunchOptions = useMemo(
    () => normalizeGenneiaOptionSections(activeOptions.filter(Boolean), hasFruitDessertRules),
    [activeOptions, hasFruitDessertRules]
  )

  const visibleDinnerOptions = useMemo(() => {
    if (!dinnerEnabled) return []
    return normalizeGenneiaOptionSections((customOptionsDinner || []).filter(opt => opt.active), hasFruitDessertRules)
  }, [customOptionsDinner, dinnerEnabled, hasFruitDessertRules])

  const {
    canChooseCustomSideForSelection,
    canChooseCustomSideForDinner
  } = useCustomSideGuards({
    isGenneia: hasGenneiaRules,
    selectedTurns,
    menuItems,
    dinnerMenuItems,
    selectedItems,
    selectedItemsDinner,
    visibleLunchOptions,
    visibleDinnerOptions,
    setCustomResponses,
    setCustomResponsesDinner
  })

  const lunchOptionsUI = useLunchOptionsUI({
    visibleLunchOptions,
    customResponses,
    isGenneia: hasFruitDessertRules,
    isGenneiaPostreDay,
    canChooseCustomSideForSelection
  })

  const dinnerMenuItemsUI = useDinnerMenuItemsUI({ menuItems: dinnerMenuItems, selectedItemsDinner })

  const allCustomOptions = useMemo(() => {
    const seen = new Set()
    return [...(customOptionsLunch || []), ...(customOptionsDinner || [])].filter(opt => {
      if (!opt?.id) return false
      if (seen.has(opt.id)) return false
      seen.add(opt.id)
      return true
    })
  }, [customOptionsLunch, customOptionsDinner])

  useGenneiaPostreRules({
    isGenneia: hasFruitDessertRules,
    isGenneiaPostreDay,
    allCustomOptions,
    visibleDinnerOptions,
    isGenneiaPostreOption: isGenneiaPostreOptionLocal,
    setCustomResponses,
    setCustomResponsesDinner
  })

  useOrderBootstrap({
    user,
    rawCompanySlug,
    companyOptionsSlug,
    companyConfig,
    setDinnerEnabled,
    setSelectedTurns,
    setMode,
    setFormData,
    setMenuItems,
    setDinnerMenuItems,
    setCustomOptionsLunch,
    setCustomOptionsDinner,
    selectedDinnerDate,
    setSelectedDinnerDate,
    setDinnerMenuSpecial,
    setPendingLunch,
    setPendingDinner,
    setHasOrderToday,
    setSuggestion,
    setSuggestionMode,
    setSuggestionVisible,
    setSuggestionSummary,
    setSuggestionLoading
  })

  useOrderFormEffects({
    companySlugParam,
    rawCompanySlug,
    companyCatalog,
    navigate,
    dinnerMenuSpecial,
    setDinnerSpecialChoice,
    locations,
    requireExplicitLocationSelection: requiresAuthorizedLocations,
    setFormData,
    setCustomResponses,
    success,
    playSuccess: Sound.playSuccess
  })

  useOrderRepeatPayload({
    locationState,
    menuItems,
    dinnerMenuItems,
    menuItemsLength: menuItems.length,
    dinnerMenuItemsLength: dinnerMenuItems.length,
    locations,
    requireExplicitLocationSelection: requiresAuthorizedLocations,
    dinnerEnabled,
    dinnerMenuEnabled,
    setSelectedItems,
    setSelectedItemsDinner,
    setCustomResponses,
    setCustomResponsesDinner,
    setDinnerSpecialChoice,
    setSelectedTurns,
    setMode,
    setFormData
  })

  const { handleItemSelect } = useOrderLunchSelection({
    menuItems,
    selectedItems,
    setSelectedItems,
    notifyInfo
  })

  const handleFormChange = useCallback((e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }, [formData, setFormData])

  const { handleCustomResponse, setCustomResponsesDinnerSafe } = useOrderCustomResponses({
    visibleLunchOptions,
    setCustomResponses,
    notifyInfo,
    canChooseCustomSideForSelection,
    dinnerSpecialChoice,
    setCustomResponsesDinner,
    isBeverageOrDessertOption,
    canChooseCustomSideForDinner
  })

  const clearDinnerOverrideResponses = useCallback(() => {
    setCustomResponsesDinner(prev => clearDinnerOverrideResponsesPure({ prevResponses: prev, isDinnerOverrideValue }))
  }, [setCustomResponsesDinner])

  const {
    getSelectedItemsList,
    getSelectedItemsListDinner,
    calculateTotal,
    calculateTotalDinner,
    getDinnerOverrideChoice,
    validateDinnerExclusivity,
    hasAnySelectedItems
  } = useOrderTotals({
    menuItems,
    dinnerMenuItems,
    selectedItems,
    selectedItemsDinner,
    dinnerSpecialChoice,
    customResponsesDinner,
    visibleDinnerOptions,
    selectedTurns,
    dinnerEnabled,
    dinnerMenuEnabled
  })

  const {
    handleItemSelectDinner,
    clearDinnerMenuSelections,
    handleDinnerSpecialSelect
  } = useOrderDinnerSelection({
    dinnerMenuItems,
    selectedItemsDinner,
    setSelectedItemsDinner,
    dinnerSpecialChoice,
    setDinnerSpecialChoice,
    setCustomResponsesDinner,
    clearDinnerOverrideResponses,
    notifyInfo
  })

  const { handleRepeatSuggestion, handleDismissSuggestion } = useOrderSuggestionHandlers({
    suggestion,
    setSuggestionVisible,
    setSuggestion,
    setSuggestionSummary,
    setSuggestionMode,
    menuItems,
    dinnerMenuItems,
    locations,
    isGenneia: hasGenneiaRules,
    requireExplicitLocationSelection: requiresAuthorizedLocations,
    setSelectedItems,
    setSelectedItemsDinner,
    setCustomResponses,
    setCustomResponsesDinner,
    setDinnerSpecialChoice,
    setSelectedTurns,
    setMode,
    setFormData,
    clearDinnerOverrideResponses
  })

  const submit = useOrderSubmit({
    user,
    formData,
    locations,
    selectedTurns,
    dinnerEnabled,
    dinnerMenuEnabled,
    pendingLunch,
    pendingDinner,
    visibleLunchOptions,
    visibleDinnerOptions,
    customResponses,
    customResponsesDinner,
    isGenneiaPostreOption: isGenneiaPostreOptionLocal,
    getSelectedItemsList,
    getSelectedItemsListDinner,
    getDinnerOverrideChoice,
    dinnerSpecialTitle: dinnerMenuSpecial?.title,
    validateDinnerExclusivity,
    calculateTotal,
    calculateTotalDinner,
    companyConfig,
    orderSchedule: schedule,
    setSelectedTurns,
    setSuccess,
    navigate,
    rawCompanySlug,
    selectedDinnerDate,
    deliveryLocationsByLocation
  })

  const toggleLunchTurn = useCallback(() => {
    setSelectedTurns(prev => ({ ...prev, lunch: !prev.lunch }))
  }, [setSelectedTurns])

  const toggleDinnerTurn = useCallback(() => {
    setSelectedTurns(prev => ({ ...prev, dinner: !prev.dinner }))
  }, [setSelectedTurns])

  const removeLunchItem = useCallback((itemId) => {
    handleItemSelect(itemId, false)
  }, [handleItemSelect])

  return {
    success,
    company: {
      companyConfig,
      isGenneia,
      hasGenneiaRules,
      locations,
      rawCompanySlug,
      companySlugParam,
      companyOptionsSlug,
      authorizedLocationsLoading,
      authorizedLocationsError,
      requiresAuthorizedLocations,
      deliveryLocationsByLocation
    },
    form: { formData, handleFormChange, hasOrderToday },
    turns: { selectedTurns, toggleLunchTurn, toggleDinnerTurn, dinnerEnabled, dinnerMenuEnabled },
    lunch: {
      menuItems,
      selectedItems,
      handleItemSelect,
      getSelectedItemsList,
      calculateTotal,
      lunchOptionsUI,
      handleCustomResponse,
      removeLunchItem
    },
    dinner: {
      selectedDinnerDate,
      dinnerMenuItemsUI,
      selectedItemsDinner,
      getSelectedItemsListDinner,
      visibleDinnerOptions,
      customResponsesDinner,
      setCustomResponsesDinnerSafe,
      canChooseCustomSideForDinner,
      calculateTotalDinner,
      handleItemSelectDinner,
      clearDinnerMenuSelections,
      dinnerMenuSpecial,
      dinnerSpecialChoice,
      handleDinnerSpecialSelect,
      isGenneiaPostreDay,
      isDinnerOverrideValue
    },
    suggestions: {
      suggestionVisible,
      suggestion,
      suggestionMode,
      suggestionSummary,
      suggestionLoading,
      handleRepeatSuggestion,
      handleDismissSuggestion
    },
    submit: {
      ...submit,
      hasAnySelectedItems
    },
    schedule
  }
}
