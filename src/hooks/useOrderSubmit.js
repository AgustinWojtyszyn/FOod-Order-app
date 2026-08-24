import { useRef, useState } from 'react'
import { validateOrderSubmission } from '../utils/order/orderValidation'
import { submitOrders } from '../utils/order/orderSubmit'
import { triggerOrderSuccessConfetti } from '../utils/order/orderSuccessConfetti'

const useOrderSubmit = ({
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
  isGenneiaPostreOption,
  getSelectedItemsList,
  getSelectedItemsListDinner,
  getDinnerOverrideChoice,
  dinnerSpecialTitle,
  validateDinnerExclusivity,
  calculateTotal,
  calculateTotalDinner,
  companyConfig,
  isOutsideWindow,
  setSelectedTurns,
  setSuccess,
  navigate,
  rawCompanySlug,
  selectedDinnerDate,
  deliveryLocationsByLocation
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmData, setConfirmData] = useState(null)
  const [error, setError] = useState('')
  const submitLockRef = useRef(false)

  const closeConfirm = () => {
    setConfirmOpen(false)
    setConfirmData(null)
  }

  const handleSubmit = async (e, bypassConfirm = false) => {
    e?.preventDefault()
    if (submitting || submitLockRef.current) return
    setError('')
    const validation = validateOrderSubmission({
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
      isGenneiaPostreOption,
      getSelectedItemsList,
      getSelectedItemsListDinner,
      getDinnerOverrideChoice,
      dinnerSpecialTitle,
      validateDinnerExclusivity,
      calculateTotal,
      calculateTotalDinner,
      companyConfig,
      isOutsideWindow,
      selectedDinnerDate,
      deliveryLocationsByLocation
    })

    if (validation.error) {
      setError(validation.error)
      setSubmitting(false)
      submitLockRef.current = false
      return
    }

    const {
      selectedItemsList,
      selectedItemsListDinner,
      dinnerOverrideChoice,
      customResponsesArray,
      customResponsesDinnerArray,
      deliveryDate,
      deliveryDates,
      turnosSeleccionados,
      confirmationData
    } = validation.data

    if (!bypassConfirm) {
      setConfirmData(confirmationData)
      setConfirmOpen(true)
      return
    }

    submitLockRef.current = true
    setSubmitting(true)

    try {
      const submitResult = await submitOrders({
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
        calculateTotal,
        calculateTotalDinner,
        companySlug: rawCompanySlug
      })

      if (!submitResult.ok) {
        setError(submitResult.errorMessage || 'Error al crear el pedido')
        if (submitResult.forceLunchOnly) {
          setSelectedTurns({ lunch: true, dinner: false })
        }
        setSubmitting(false)
        submitLockRef.current = false
        return
      }

      triggerOrderSuccessConfetti()
      setSuccess(true)
      try {
        if (typeof window !== 'undefined' && rawCompanySlug) {
          window.localStorage.setItem('lastCompanyConfirmed', rawCompanySlug)
        }
      } catch (_err) {
        // no-op
      }
      const createdIds = submitResult?.createdOrderIds || []
      const latestCreatedId = createdIds.length ? createdIds[createdIds.length - 1] : null
      setTimeout(() => {
        navigate('/dashboard', {
          state: latestCreatedId ? { highlightOrderId: latestCreatedId } : null
        })
      }, 2000)
    } catch (_err) {
      setError('No pudimos crear el pedido. Intentá nuevamente.')
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  const handleConfirmSubmit = () => {
    closeConfirm()
    handleSubmit(null, true)
  }

  return {
    submitting,
    confirmOpen,
    confirmData,
    error,
    handleSubmit,
    handleConfirmSubmit,
    closeConfirm,
    setError
  }
}

export { useOrderSubmit }
