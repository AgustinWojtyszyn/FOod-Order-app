import { useEffect, useRef } from 'react'
import { buildDraftFromPayload } from '../../utils/order/orderApplyDraft'
import { clearDinnerOverrideResponses as clearDinnerOverrideResponsesPure } from '../../utils/order/orderDinnerOverride'
import { isDinnerOverrideValue } from '../../utils/order/orderBusinessRules'

export const useOrderRepeatPayload = ({
  locationState,
  menuItems,
  dinnerMenuItems,
  menuItemsLength,
  dinnerMenuItemsLength,
  locations,
  requireExplicitLocationSelection = false,
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
}) => {
  const repeatAppliedRef = useRef(false)

  useEffect(() => {
    if (repeatAppliedRef.current) return
    if (!menuItemsLength) return
    const payload = locationState?.state?.repeatPayload
    if (!payload) return
    const payloadService = (payload?.service || 'lunch').toLowerCase()
    if (payloadService === 'dinner' && !dinnerMenuItemsLength) return

    const draft = buildDraftFromPayload({
      payload,
      menuItems,
      dinnerMenuItems,
      locations,
      dinnerEnabled,
      dinnerMenuEnabled
    })

    setSelectedItems(draft.selectedItems)
    setSelectedItemsDinner(draft.selectedItemsDinner)
    if (draft.customResponses !== undefined) setCustomResponses(draft.customResponses)
    setCustomResponsesDinner(draft.customResponsesDinner)
    if (draft.dinnerSpecialChoice !== undefined) setDinnerSpecialChoice(draft.dinnerSpecialChoice)
    setSelectedTurns(draft.selectedTurns)
    setMode(draft.mode)
    setFormData(prev => ({
      ...prev,
      comments: draft.comments,
      location: draft.location || (requireExplicitLocationSelection ? '' : locations[0]) || prev.location
    }))

    if (draft.service === 'dinner' && Object.keys(draft.selectedItemsDinner || {}).length > 0) {
      setCustomResponsesDinner(prev => clearDinnerOverrideResponsesPure({ prevResponses: prev, isDinnerOverrideValue }))
    }

    repeatAppliedRef.current = true
  }, [
    locationState,
    menuItems,
    dinnerMenuItems,
    menuItemsLength,
    dinnerMenuItemsLength,
    dinnerEnabled,
    dinnerMenuEnabled,
    locations,
    requireExplicitLocationSelection,
    setSelectedItems,
    setSelectedItemsDinner,
    setCustomResponses,
    setCustomResponsesDinner,
    setDinnerSpecialChoice,
    setSelectedTurns,
    setMode,
    setFormData
  ])
}
