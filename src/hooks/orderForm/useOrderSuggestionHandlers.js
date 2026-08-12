import { useCallback } from 'react'
import { buildDraftFromSuggestion } from '../../utils/order/orderApplyDraft'

export const useOrderSuggestionHandlers = ({
  suggestion,
  setSuggestionVisible,
  setSuggestion,
  setSuggestionSummary,
  setSuggestionMode,
  menuItems,
  dinnerMenuItems,
  locations,
  isGenneia,
  requireExplicitLocationSelection = false,
  setSelectedItems,
  setSelectedItemsDinner,
  setCustomResponses,
  setCustomResponsesDinner,
  setDinnerSpecialChoice,
  setSelectedTurns,
  setMode,
  setFormData,
  clearDinnerOverrideResponses
}) => {
  const handleRepeatSuggestion = useCallback(() => {
    if (!suggestion) return

    const draft = buildDraftFromSuggestion({
      suggestion,
      menuItems,
      dinnerMenuItems,
      locations,
      isGenneia
    })

    setSelectedItems(draft.selectedItems)
    setSelectedItemsDinner(draft.selectedItemsDinner)
    setCustomResponses(draft.customResponses)
    setCustomResponsesDinner(draft.customResponsesDinner)
    setDinnerSpecialChoice(draft.dinnerSpecialChoice)
    if (draft.selectedTurns !== undefined) setSelectedTurns(draft.selectedTurns)
    if (draft.mode !== undefined) setMode(draft.mode)
    setFormData(prev => ({
      ...prev,
      comments: draft.comments,
      location: draft.location || (requireExplicitLocationSelection ? '' : locations[0]) || prev.location
    }))

    if (draft.service === 'dinner' && !draft.hasDinnerOverride) {
      clearDinnerOverrideResponses()
    }

    setSuggestionVisible(false)
  }, [
    suggestion,
    menuItems,
    dinnerMenuItems,
    locations,
    isGenneia,
    requireExplicitLocationSelection,
    setSelectedItems,
    setSelectedItemsDinner,
    setCustomResponses,
    setCustomResponsesDinner,
    setDinnerSpecialChoice,
    setSelectedTurns,
    setMode,
    setFormData,
    clearDinnerOverrideResponses,
    setSuggestionVisible
  ])

  const handleDismissSuggestion = useCallback(() => {
    setSuggestionVisible(false)
    setSuggestion(null)
    setSuggestionSummary('')
    setSuggestionMode('last')
  }, [setSuggestionVisible, setSuggestion, setSuggestionSummary, setSuggestionMode])

  return { handleRepeatSuggestion, handleDismissSuggestion }
}
