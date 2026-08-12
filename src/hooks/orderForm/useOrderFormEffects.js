import { useEffect } from 'react'

export const useOrderFormEffects = ({
  companySlugParam,
  rawCompanySlug,
  companyCatalog,
  navigate,
  dinnerMenuSpecial,
  setDinnerSpecialChoice,
  locations,
  requireExplicitLocationSelection = false,
  setFormData,
  setCustomResponses,
  success,
  playSuccess
} = {}) => {
  useEffect(() => {
    // Redirigir a la selección si llega un slug desconocido
    if (companySlugParam && companyCatalog && !companyCatalog[rawCompanySlug]) {
      navigate('/order', { replace: true })
    }
  }, [companySlugParam, companyCatalog, navigate, rawCompanySlug])

  useEffect(() => {
    if (!dinnerMenuSpecial) {
      setDinnerSpecialChoice(null)
    }
  }, [dinnerMenuSpecial, setDinnerSpecialChoice])

  useEffect(() => {
    const defaultLocation = !requireExplicitLocationSelection && (locations || []).length === 1 ? locations[0] : ''
    setFormData(prev => {
      if (!prev.location || !(locations || []).includes(prev.location)) {
        return { ...prev, location: defaultLocation }
      }
      return prev
    })
  }, [locations, requireExplicitLocationSelection, setFormData])

  useEffect(() => {
    setCustomResponses({})
  }, [rawCompanySlug, setCustomResponses])

  useEffect(() => {
    if (success) {
      playSuccess?.()
    }
  }, [playSuccess, success])
}
