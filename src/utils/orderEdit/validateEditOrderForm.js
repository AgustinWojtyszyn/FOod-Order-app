import { hasHiddenOrderMenuSelection } from '../order/menuDisplay'

export const validateEditOrderForm = ({
  user,
  formData,
  selectedItemsList,
  service,
  customOptions,
  customResponses,
  originalOrder
}) => {
  if (!user?.id) {
    return { ok: false, error: 'No se pudo validar el usuario. Intenta nuevamente.' }
  }

  if (!formData?.location) {
    return { ok: false, error: 'Por favor selecciona un lugar de trabajo' }
  }

  const normalizedService = (service || 'lunch').toLowerCase()
  const dinnerOverrideChoice = customResponses?.['dinner-special']
  const hasDinnerOverrideChoice = dinnerOverrideChoice !== null
    && dinnerOverrideChoice !== undefined
    && (typeof dinnerOverrideChoice !== 'string' || dinnerOverrideChoice.trim() !== '')

  const originalItems = Array.isArray(originalOrder?.items) ? originalOrder.items : []
  const preservesHiddenHistoricalItem = selectedItemsList?.length === 0 && hasHiddenOrderMenuSelection(originalItems)

  if (!selectedItemsList || selectedItemsList.length === 0) {
    if (preservesHiddenHistoricalItem) return { ok: true, error: null }
    if (normalizedService === 'dinner') {
      if (hasDinnerOverrideChoice) return { ok: true, error: null }
      return { ok: false, error: 'Selecciona al menos un plato para cena o una opción de cena.' }
    }
    return { ok: false, error: 'Por favor selecciona al menos un plato del menú' }
  }

  if ((normalizedService === 'lunch' || normalizedService === 'dinner') && selectedItemsList.length > 1) {
    return { ok: false, error: 'Solo podés seleccionar 1 comida principal por persona para almuerzo o cena.' }
  }

  if (hasHiddenOrderMenuSelection(selectedItemsList)) {
    return { ok: false, error: 'Esa opción de menú no está disponible para pedidos.' }
  }

  // Validar opciones requeridas (solo las que están activas)
  if (normalizedService === 'dinner' && hasDinnerOverrideChoice) {
    return { ok: true, error: null }
  }

  const missingRequiredOptions = (customOptions || [])
    .filter(opt => opt?.active && opt?.required && !customResponses?.[opt.id])
    .map(opt => opt.title)

  if (missingRequiredOptions.length > 0) {
    return { ok: false, error: `Por favor completa: ${missingRequiredOptions.join(', ')}` }
  }

  return { ok: true, error: null }
}
