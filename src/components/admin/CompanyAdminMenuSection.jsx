import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { db } from '../../supabaseClient'
import { getTodayISOInTimeZone, getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import { confirmAction } from '../../utils/confirm'
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notice'
import { mergeCompanyMenuItems } from '../../utils/order/companyMenuMerge'
import { getMenuSlotIndex, getSlotIndexFromTitle, getMenuLabelByIndex, withMenuSlotIndex } from '../../utils/order/menuDisplay'
import { sortMenuItems } from '../../utils/order/orderMenuHelpers'
import {
  createMenuPermissionError,
  createMenuStaleError,
  formatCompanyMenuSuccess,
  mapMenuError
} from '../../utils/menu/menuErrorMapper'

const SLOT_OPTIONS = [
  { value: 0, label: 'Menú principal' },
  { value: 1, label: 'Opción 1' },
  { value: 2, label: 'Opción 2' },
  { value: 3, label: 'Opción 3' },
  { value: 4, label: 'Opción 4' },
  { value: 5, label: 'Opción 5' },
  { value: 6, label: 'Opción 6' },
  { value: -1, label: 'Personalizado' }
]

const DATE_LABEL_FORMAT = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})

const normalizeText = (value = '') => String(value || '').trim()

const formatDateLabel = (dateISO = '') => {
  if (!dateISO) return ''
  try {
    return DATE_LABEL_FORMAT.format(new Date(`${dateISO}T00:00:00`))
  } catch {
    return dateISO
  }
}

const formatShortDate = (dateISO = '') => {
  if (!dateISO) return ''
  try {
    return SHORT_DATE_FORMAT.format(new Date(`${dateISO}T00:00:00`))
  } catch {
    return dateISO
  }
}

const getCompanyName = (companies = [], slug = '') =>
  companies.find((company) => company.slug === slug)?.name || slug

const getItemSlot = (item = {}, fallbackIndex = 0) => {
  const slot = getMenuSlotIndex(item, fallbackIndex)
  return Number.isFinite(slot) ? slot : -1
}

const stripSlotPrefix = (name = '') =>
  normalizeText(name)
    .replace(/^men[uú]\s+principal\s*[:-]?\s*/i, '')
    .replace(/^opci[oó]n\s*0?[1-6]\s*[:-]?\s*/i, '')

const buildNameFromSlot = ({ slot, title }) => {
  const cleanTitle = normalizeText(title)
  if (slot === -1) return cleanTitle
  const label = getMenuLabelByIndex(slot)
  return cleanTitle ? `${label}: ${cleanTitle}` : label
}

const mapMenuItemToDraft = (item = {}, fallbackIndex = 0) => {
  const slot = getItemSlot(item, fallbackIndex)
  return {
    id: item.id || null,
    slot,
    title: slot === -1 ? normalizeText(item.name) : stripSlotPrefix(item.name),
    description: item.description || ''
  }
}

const mapDraftToMenuItem = (draft = {}) => ({
  id: draft.id || undefined,
  name: buildNameFromSlot({ slot: Number(draft.slot), title: draft.title }),
  description: normalizeText(draft.description)
})

const normalizeForComparison = (items = []) =>
  items.map((item) => ({
    id: item.id || null,
    name: normalizeText(item.name),
    description: normalizeText(item.description)
  }))

const getMergeKey = (item = {}, fallbackIndex = 0) => {
  const slot = getMenuSlotIndex(item, fallbackIndex)
  if (Number.isFinite(slot)) return `slot:${slot}`
  const name = normalizeText(item.name).toLowerCase()
  return name ? `name:${name}` : null
}

const buildCompanyRowStatus = (draft = {}, globalItems = []) => {
  const item = mapDraftToMenuItem(draft)
  const key = getMergeKey(item)
  const replaces = key && globalItems.some((globalItem, index) => getMergeKey(globalItem, index) === key)
  return replaces ? 'Reemplaza una opción del menú general' : 'Opción adicional de la empresa'
}

const hasDifferentMenu = (nextItems, currentItems, deletedIds = []) =>
  deletedIds.length > 0 ||
  JSON.stringify(normalizeForComparison(nextItems)) !== JSON.stringify(normalizeForComparison(currentItems))

const getModifiedExistingItems = (nextItems = [], currentItems = []) => {
  const currentById = new Map(currentItems.filter((item) => item.id).map((item) => [item.id, item]))
  return nextItems.filter((item) => {
    if (!item.id || !currentById.has(item.id)) return false
    const current = currentById.get(item.id)
    return normalizeText(item.name) !== normalizeText(current.name) ||
      normalizeText(item.description) !== normalizeText(current.description)
  })
}

const logMenuError = (...args) => {
  if (import.meta.env.DEV) console.error(...args)
}

const getFieldKey = (field, index = null) => index === null ? field : `${field}-${index}`

const CompanyAdminMenuSection = ({ adminCompanies = [] }) => {
  const authorizedCompanies = useMemo(
    () => (Array.isArray(adminCompanies) ? adminCompanies : [])
      .filter((company) => company?.slug && company.slug !== 'global'),
    [adminCompanies]
  )
  const adminCompanySlugs = useMemo(
    () => new Set(authorizedCompanies.map((company) => company.slug)),
    [authorizedCompanies]
  )
  const [selectedCompanySlug, setSelectedCompanySlug] = useState(authorizedCompanies[0]?.slug || '')
  const [deliveryDate, setDeliveryDate] = useState(() => getTomorrowISOInTimeZone())
  const [globalItems, setGlobalItems] = useState([])
  const [companyItems, setCompanyItems] = useState([])
  const [draftItems, setDraftItems] = useState([])
  const [deletedItems, setDeletedItems] = useState([])
  const [dinnerMode, setDinnerMode] = useState('use_base')
  const [dinnerTitle, setDinnerTitle] = useState('Menú de cena')
  const [dinnerOptions, setDinnerOptions] = useState([''])
  const [initialDinnerState, setInitialDinnerState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [conflictPrompt, setConflictPrompt] = useState(null)
  const [mustReloadBeforeRetry, setMustReloadBeforeRetry] = useState(false)
  const fieldRefs = useRef({})
  const companyChangesRef = useRef(null)

  useEffect(() => {
    if (!authorizedCompanies.length) return
    if (!adminCompanySlugs.has(selectedCompanySlug)) {
      setSelectedCompanySlug(authorizedCompanies[0].slug)
    }
  }, [adminCompanySlugs, authorizedCompanies, selectedCompanySlug])

  const selectedCompanyName = getCompanyName(authorizedCompanies, selectedCompanySlug)
  const normalizedGlobalItems = useMemo(() => withMenuSlotIndex(sortMenuItems(globalItems)), [globalItems])
  const currentDraftMenuItems = useMemo(
    () => draftItems
      .map(mapDraftToMenuItem)
      .filter((item) => normalizeText(item.name)),
    [draftItems]
  )
  const normalizedDraftItems = useMemo(() => withMenuSlotIndex(sortMenuItems(currentDraftMenuItems)), [currentDraftMenuItems])
  const finalItems = useMemo(
    () => withMenuSlotIndex(sortMenuItems(mergeCompanyMenuItems(normalizedGlobalItems, normalizedDraftItems))),
    [normalizedGlobalItems, normalizedDraftItems]
  )
  const deletedIds = useMemo(() => deletedItems.map((item) => item.id).filter(Boolean), [deletedItems])
  const newMenuItems = useMemo(
    () => currentDraftMenuItems.filter((item) => !item.id),
    [currentDraftMenuItems]
  )
  const modifiedMenuItems = useMemo(
    () => getModifiedExistingItems(currentDraftMenuItems, companyItems),
    [companyItems, currentDraftMenuItems]
  )
  const hasNonAdditiveMenuChanges = modifiedMenuItems.length > 0 || deletedIds.length > 0
  const hasMenuChanges = useMemo(
    () => hasDifferentMenu(currentDraftMenuItems, companyItems, deletedIds),
    [currentDraftMenuItems, companyItems, deletedIds]
  )
  const nextDinnerState = useMemo(() => ({
    mode: dinnerMode,
    title: normalizeText(dinnerTitle),
    options: dinnerOptions.map(normalizeText).filter(Boolean)
  }), [dinnerMode, dinnerOptions, dinnerTitle])
  const hasDinnerChanges = useMemo(
    () => JSON.stringify(nextDinnerState) !== JSON.stringify(initialDinnerState),
    [initialDinnerState, nextDinnerState]
  )
  const hasPendingChanges = hasMenuChanges || hasDinnerChanges

  const loadMenu = useCallback(async () => {
    if (!selectedCompanySlug || !deliveryDate) return false
    if (!adminCompanySlugs.has(selectedCompanySlug) || selectedCompanySlug === 'global') {
      setError(createMenuPermissionError({ companyName: selectedCompanyName }).message)
      return false
    }

    setLoading(true)
    setError('')
    setFieldErrors({})
    setConflictPrompt(null)
    setMustReloadBeforeRetry(false)
    try {
      const [
        globalResult,
        companyResult,
        dinnerResult
      ] = await Promise.all([
        db.getMenuItemsByDate(deliveryDate, 'global'),
        db.getMenuItemsByDate(deliveryDate, selectedCompanySlug),
        db.getDinnerMenuByDate({ date: deliveryDate, company: selectedCompanySlug })
      ])

      if (globalResult.error) throw globalResult.error
      if (companyResult.error) throw companyResult.error
      if (dinnerResult.error) throw dinnerResult.error

      const nextGlobalItems = withMenuSlotIndex(sortMenuItems(globalResult.data || []))
      const nextCompanyItems = withMenuSlotIndex(sortMenuItems(companyResult.data || []))
      const dinnerData = dinnerResult.data || null
      const activeDinnerOptions = Array.isArray(dinnerData?.options)
        ? dinnerData.options.map(normalizeText).filter(Boolean)
        : []
      const inactiveDinnerMode = normalizeText(dinnerData?.title).toLowerCase() === 'sin cena especial' ? 'none' : 'use_base'
      const nextDinnerState = dinnerData?.active && activeDinnerOptions.length > 0
        ? {
            mode: 'different',
            title: dinnerData.title || 'Menú de cena',
            options: activeDinnerOptions
          }
        : {
            mode: inactiveDinnerMode,
            title: dinnerData?.title || 'Menú de cena',
            options: activeDinnerOptions.length ? activeDinnerOptions : ['']
          }

      setGlobalItems(nextGlobalItems)
      setCompanyItems(nextCompanyItems)
      setDraftItems(nextCompanyItems.map(mapMenuItemToDraft))
      setDeletedItems([])
      setDinnerMode(nextDinnerState.mode)
      setDinnerTitle(nextDinnerState.title)
      setDinnerOptions(nextDinnerState.options.length ? nextDinnerState.options : [''])
      setInitialDinnerState({
        mode: nextDinnerState.mode,
        title: normalizeText(nextDinnerState.title),
        options: nextDinnerState.options.map(normalizeText).filter(Boolean)
      })
      return true
    } catch (err) {
      logMenuError('Error loading company admin menu', err)
      setError(mapMenuError(err, {
        companyName: selectedCompanyName,
        dateISO: deliveryDate,
        action: 'cargar'
      }).message)
      return false
    } finally {
      setLoading(false)
    }
  }, [adminCompanySlugs, deliveryDate, selectedCompanyName, selectedCompanySlug])

  useEffect(() => {
    loadMenu()
  }, [loadMenu])

  const confirmDiscardPending = async () => {
    if (!hasPendingChanges) return true
    return confirmAction({
      title: 'Cambios sin guardar',
      message: `Tenés cambios sin guardar para ${selectedCompanyName} del ${formatShortDate(deliveryDate)}.\nSi continuás, se perderán.`,
      confirmText: 'Descartar cambios',
      cancelText: 'Seguir editando'
    })
  }

  const handleCompanyChange = async (value) => {
    if (value === selectedCompanySlug) return
    const allowed = await confirmDiscardPending()
    if (!allowed) return
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next.company
      return next
    })
    setSelectedCompanySlug(value)
  }

  const handleDateChange = async (value) => {
    if (!value || value === deliveryDate) return
    const allowed = await confirmDiscardPending()
    if (!allowed) return
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next.deliveryDate
      return next
    })
    setDeliveryDate(value)
  }

  const addDish = () => {
    const usedSlots = new Set(draftItems.map((item) => Number(item.slot)).filter((slot) => slot >= 0))
    const nextSlot = SLOT_OPTIONS.find((option) => option.value >= 0 && !usedSlots.has(option.value))?.value ?? -1
    setDraftItems((prev) => [...prev, { id: null, slot: nextSlot, title: '', description: '' }])
  }

  const updateDraft = (index, field, value) => {
    setFieldErrors((prev) => {
      const key = getFieldKey(field, index)
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDraftItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: field === 'slot' ? Number(value) : value } : item
    )))
  }

  const removeDraft = async (index) => {
    const item = draftItems[index]
    if (!item) return
    const confirmed = await confirmAction({
      title: 'Eliminar personalización',
      message: `Se eliminará "${mapDraftToMenuItem(item).name || 'este plato'}" sólo del menú de ${selectedCompanyName}.`,
      confirmText: 'Eliminar'
    })
    if (!confirmed) return
    if (item.id) {
      setDeletedItems((prev) => prev.some((deleted) => deleted.id === item.id) ? prev : [...prev, mapDraftToMenuItem(item)])
    }
    setDraftItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const restoreGlobal = async (index) => {
    const item = draftItems[index]
    if (!item) return
    const confirmed = await confirmAction({
      title: 'Restaurar valor general',
      message: 'Se quitará esta personalización de la empresa y volverá a verse la opción general para esta fecha.',
      confirmText: 'Restaurar'
    })
    if (!confirmed) return
    if (item.id) {
      setDeletedItems((prev) => prev.some((deleted) => deleted.id === item.id) ? prev : [...prev, mapDraftToMenuItem(item)])
    }
    setDraftItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const updateDinnerOption = (index, value) => {
    setFieldErrors((prev) => {
      const key = getFieldKey('dinnerOption', index)
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDinnerOptions((prev) => prev.map((option, optionIndex) => optionIndex === index ? value : option))
  }

  const addDinnerOption = () => setDinnerOptions((prev) => [...prev, ''])
  const removeDinnerOption = (index) => {
    setDinnerOptions((prev) => {
      const next = prev.filter((_, optionIndex) => optionIndex !== index)
      return next.length ? next : ['']
    })
  }

  const saveDinnerConfig = async () => {
    if (dinnerMode === 'different') {
      const options = dinnerOptions.map(normalizeText).filter(Boolean)
      if (!normalizeText(dinnerTitle) || options.length === 0) {
        throw new Error('Completá el título y al menos una opción de cena.')
      }
      return db.upsertDinnerMenuByDate({
        deliveryDate,
        company: selectedCompanySlug,
        title: normalizeText(dinnerTitle),
        options,
        active: true
      })
    }

    return db.upsertDinnerMenuByDate({
      deliveryDate,
      company: selectedCompanySlug,
      title: dinnerMode === 'none' ? 'Sin cena especial' : 'Menú de cena',
      options: [],
      active: false
    })
  }

  const focusFirstError = (nextErrors = {}) => {
    const firstKey = Object.keys(nextErrors)[0]
    if (!firstKey) return
    window.requestAnimationFrame(() => {
      fieldRefs.current[firstKey]?.focus?.()
    })
  }

  const validateBeforeSave = () => {
    const nextErrors = {}
    if (!deliveryDate) {
      nextErrors.deliveryDate = 'Seleccioná una fecha de entrega.'
    } else if (deliveryDate < getTodayISOInTimeZone()) {
      nextErrors.deliveryDate = 'La fecha seleccionada ya pasó.'
    }
    if (!adminCompanySlugs.has(selectedCompanySlug) || selectedCompanySlug === 'global') {
      nextErrors.company = 'No tenés permisos para modificar el menú de esta empresa.'
    }
    if (finalItems.length === 0 && draftItems.length === 0) {
      nextErrors.companyMenu = 'Agregá al menos un plato antes de guardar.'
    }

    const seenSlots = new Set()
    const seenNames = new Set()
    draftItems.forEach((item, index) => {
      const slot = Number(item.slot)
      const title = normalizeText(item.title)
      if (!title) {
        nextErrors[getFieldKey('title', index)] = 'Ingresá el nombre del plato.'
      }
      if (!Number.isFinite(slot)) {
        nextErrors[getFieldKey('slot', index)] = 'Seleccioná qué opción general querés reemplazar.'
      }
      const duplicateKey = slot >= 0 ? `slot:${slot}` : `name:${title.toLowerCase()}`
      if (title && seenNames.has(duplicateKey)) {
        nextErrors[getFieldKey('title', index)] = 'Esta opción está repetida en el menú.'
      }
      if (slot >= 0 && seenSlots.has(slot)) {
        nextErrors[getFieldKey('slot', index)] = 'Esta opción está repetida en el menú.'
      }
      if (slot >= 0) seenSlots.add(slot)
      if (title) seenNames.add(duplicateKey)
    })

    if (dinnerMode === 'different') {
      if (!normalizeText(dinnerTitle)) {
        nextErrors.dinnerTitle = 'Ingresá el nombre del plato.'
      }
      const dinnerSeen = new Set()
      dinnerOptions.forEach((option, index) => {
        const normalized = normalizeText(option).toLowerCase()
        if (!normalized) {
          nextErrors[getFieldKey('dinnerOption', index)] = 'Ingresá el nombre del plato.'
        } else if (dinnerSeen.has(normalized)) {
          nextErrors[getFieldKey('dinnerOption', index)] = 'Esta opción está repetida en el menú.'
        }
        dinnerSeen.add(normalized)
      })
    }

    setFieldErrors(nextErrors)
    focusFirstError(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const ensureCurrentVersion = async () => {
    const [currentCompanyResult, currentDinnerResult] = await Promise.all([
      db.getMenuItemsByDate(deliveryDate, selectedCompanySlug),
      db.getDinnerMenuByDate({ date: deliveryDate, company: selectedCompanySlug })
    ])
    if (currentCompanyResult.error) throw currentCompanyResult.error
    if (currentDinnerResult.error) throw currentDinnerResult.error

    const latestCompanyItems = withMenuSlotIndex(sortMenuItems(currentCompanyResult.data || []))
    const latestDinnerData = currentDinnerResult.data || null
    const latestDinnerOptions = Array.isArray(latestDinnerData?.options)
      ? latestDinnerData.options.map(normalizeText).filter(Boolean)
      : []
    const latestDinnerMode = latestDinnerData?.active && latestDinnerOptions.length > 0
      ? 'different'
      : normalizeText(latestDinnerData?.title).toLowerCase() === 'sin cena especial'
        ? 'none'
        : 'use_base'
    const latestDinnerState = {
      mode: latestDinnerMode,
      title: normalizeText(latestDinnerData?.title || 'Menú de cena'),
      options: latestDinnerOptions
    }

    const menuChanged = JSON.stringify(normalizeForComparison(latestCompanyItems)) !== JSON.stringify(normalizeForComparison(companyItems))
    const dinnerChanged = JSON.stringify(latestDinnerState) !== JSON.stringify(initialDinnerState)
    if (menuChanged || dinnerChanged) throw createMenuStaleError()
  }

  const handleSave = async ({ allowOverwrite = false, retryDinnerOnly = false } = {}) => {
    if (saving) return
    if (mustReloadBeforeRetry) {
      await loadMenu()
      return
    }
    setConflictPrompt(null)
    if (!validateBeforeSave()) return
    if (!adminCompanySlugs.has(selectedCompanySlug) || selectedCompanySlug === 'global') {
      const mapped = createMenuPermissionError({ companyName: selectedCompanyName })
      setError(mapped.message)
      notifyError(mapped.message)
      return
    }

    if (!retryDinnerOnly && !allowOverwrite && companyItems.length > 0 && hasNonAdditiveMenuChanges) {
      setConflictPrompt({
        message: `${selectedCompanyName} ya tiene un menú cargado para el ${formatShortDate(deliveryDate)}.\nRevisá los cambios antes de reemplazarlo.`
      })
      return
    }

    if (!hasPendingChanges) {
      notifyInfo('No hay cambios para guardar')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (!retryDinnerOnly && (hasNonAdditiveMenuChanges || hasDinnerChanges)) await ensureCurrentVersion()

      const savedParts = []
      if (!retryDinnerOnly && hasMenuChanges) {
        try {
          for (const deletedItem of deletedItems) {
            if (!deletedItem.id) continue
            const { error } = await db.deleteMenuItemById({
              menuDate: deliveryDate,
              itemId: deletedItem.id,
              companySlug: selectedCompanySlug
            })
            if (error) throw error
          }

          const requestId = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
          if (modifiedMenuItems.length > 0) {
            const { error } = await db.updateMenuItemsByDate(
              deliveryDate,
              modifiedMenuItems,
              requestId,
              selectedCompanySlug
            )
            if (error) throw error
          }
          if (newMenuItems.length > 0) {
            const { error } = await db.addMenuItemsByDate(
              deliveryDate,
              newMenuItems,
              requestId,
              selectedCompanySlug
            )
            if (error) throw error
          }
          savedParts.push('almuerzo')
          setCompanyItems(withMenuSlotIndex(sortMenuItems(currentDraftMenuItems)))
          setDeletedItems([])
        } catch (err) {
          throw mapMenuError(err, {
            companyName: selectedCompanyName,
            dateISO: deliveryDate,
            action: 'guardar'
          })
        }
      }

      if (hasDinnerChanges) {
        try {
          const { error } = await saveDinnerConfig()
          if (error) throw error
          savedParts.push('cena')
        } catch (err) {
          throw mapMenuError(err, {
            companyName: selectedCompanyName,
            dateISO: deliveryDate,
            action: 'guardar',
            savedParts,
            failedPart: 'cena'
          })
        }
      }

      const refreshed = await loadMenu()
      if (!refreshed) {
        throw { kind: 'unknown' }
      }
      notifySuccess(formatCompanyMenuSuccess({
        companyName: selectedCompanyName,
        dateISO: deliveryDate,
        savedDinner: savedParts.includes('cena')
      }))
    } catch (err) {
      logMenuError('Error saving company admin menu', err)
      const mapped = mapMenuError(err, {
        companyName: selectedCompanyName,
        dateISO: deliveryDate,
        action: 'guardar',
        resultUnknown: err?.kind === 'unknown'
      })
      setError(mapped.message)
      setMustReloadBeforeRetry(mapped.kind === 'unknown')
      notifyError(mapped.message)
    } finally {
      setSaving(false)
    }
  }

  const renderFieldError = (key) => fieldErrors[key] ? (
    <p className="mt-1 text-xs font-bold text-red-700" role="alert">{fieldErrors[key]}</p>
  ) : null

  if (authorizedCompanies.length === 0) {
    return (
      <div className="card bg-white/95 border-2 border-white/20 p-6">
        <h2 className="text-2xl font-black text-gray-900">Menú de mi empresa</h2>
        <p className="mt-2 text-sm text-red-700">No tenés empresas asignadas para gestionar menús.</p>
      </div>
    )
  }

  return (
    <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
      <div className="flex flex-col gap-5">
        <header>
          <p className="text-xs uppercase tracking-[0.18em] text-primary-600 font-bold">Panel Admin</p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900">Menú de mi empresa</h2>
          <p className="text-sm sm:text-base text-gray-600">
            Agregá o corregí el menú disponible para una fecha determinada.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="block text-xs font-bold uppercase tracking-wide text-gray-600">Empresa</p>
            {authorizedCompanies.length === 1 ? (
              <p className="mt-2 text-lg font-black text-gray-900">{selectedCompanyName}</p>
            ) : (
              <select
                ref={(node) => { fieldRefs.current.company = node }}
                value={selectedCompanySlug}
                onChange={(event) => handleCompanyChange(event.target.value)}
                className="mt-2 input-field w-full bg-white text-gray-900"
                disabled={saving}
                aria-invalid={Boolean(fieldErrors.company)}
                aria-describedby={fieldErrors.company ? 'company-admin-company-error' : undefined}
              >
                {authorizedCompanies.map((company) => (
                  <option key={company.slug} value={company.slug}>{company.name}</option>
                ))}
              </select>
            )}
            {fieldErrors.company && <p id="company-admin-company-error" className="mt-1 text-xs font-bold text-red-700" role="alert">{fieldErrors.company}</p>}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label htmlFor="company-admin-delivery-date" className="block text-xs font-bold uppercase tracking-wide text-gray-600">
              Fecha de entrega
            </label>
            <p className="mt-2 text-lg font-black capitalize text-gray-900">{formatDateLabel(deliveryDate)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleDateChange(getTomorrowISOInTimeZone())}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white"
                disabled={saving}
              >
                Mañana
              </button>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800">
                Elegir otra fecha
                <input
                  ref={(node) => { fieldRefs.current.deliveryDate = node }}
                  id="company-admin-delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => handleDateChange(event.target.value)}
                  className="sr-only"
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.deliveryDate)}
                  aria-describedby={fieldErrors.deliveryDate ? 'company-admin-delivery-date-error' : undefined}
                />
              </label>
            </div>
            {fieldErrors.deliveryDate && <p id="company-admin-delivery-date-error" className="mt-2 text-xs font-bold text-red-700" role="alert">{fieldErrors.deliveryDate}</p>}
          </div>
        </section>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Esta fecha puede tener pedidos registrados. Los pedidos existentes conservarán los platos seleccionados;
              el cambio se aplicará a nuevas selecciones.
            </p>
          </div>
        </div>

        {error && (
          <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">
            {error}
            {mustReloadBeforeRetry && (
              <button
                type="button"
                onClick={loadMenu}
                className="mt-3 block rounded-lg bg-red-700 px-3 py-2 text-sm font-black text-white"
              >
                Recargar versión actual
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm font-semibold text-gray-600">
            Cargando menú de la fecha...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-lg font-black text-gray-900">Menú general</h3>
              <p className="text-sm text-gray-600">Sólo lectura.</p>
              <div className="mt-4 space-y-3">
                {normalizedGlobalItems.length === 0 ? (
                  <p className="text-sm font-semibold text-gray-500">No hay menú general cargado.</p>
                ) : normalizedGlobalItems.map((item, index) => (
                  <div key={item.id || index} className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-sm font-black text-gray-900">{item.name}</p>
                    {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
                  </div>
                ))}
              </div>
            </section>

            <section ref={companyChangesRef} className="rounded-xl border border-primary-200 bg-primary-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Cambios de la empresa</h3>
                  <p className="text-sm text-gray-700">
                    Los cambios de la empresa reemplazan o complementan el menú general para esta fecha.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDish}
                  className="inline-flex shrink-0 items-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white"
                  disabled={saving}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Agregar plato
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {draftItems.length === 0 && (
                  <p className="rounded-lg border border-dashed border-primary-300 bg-white p-4 text-sm font-semibold text-gray-600">
                    No hay personalizaciones de la empresa para esta fecha.
                  </p>
                )}
                {renderFieldError('companyMenu')}
                {draftItems.map((item, index) => {
                  const status = buildCompanyRowStatus(item, normalizedGlobalItems)
                  const canRestore = status.startsWith('Reemplaza')
                  return (
                    <div key={item.id || index} className="rounded-xl border border-primary-200 bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${
                          canRestore ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {status}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDraft(index)}
                          className="ml-auto rounded-lg p-2 text-red-600 hover:bg-red-50"
                          disabled={saving}
                          title="Eliminar personalización"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-sm font-bold text-gray-800">
                          Slot
                          <select
                            ref={(node) => { fieldRefs.current[getFieldKey('slot', index)] = node }}
                            value={item.slot}
                            onChange={(event) => updateDraft(index, 'slot', event.target.value)}
                            className="mt-1 input-field w-full bg-white text-gray-900"
                            disabled={saving}
                            aria-invalid={Boolean(fieldErrors[getFieldKey('slot', index)])}
                          >
                            {SLOT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          {renderFieldError(getFieldKey('slot', index))}
                        </label>
                        <label className="text-sm font-bold text-gray-800">
                          Nombre
                          <input
                            ref={(node) => { fieldRefs.current[getFieldKey('title', index)] = node }}
                            type="text"
                            value={item.title}
                            onChange={(event) => updateDraft(index, 'title', event.target.value)}
                            className="mt-1 input-field w-full bg-white text-gray-900"
                            placeholder={Number(item.slot) === -1 ? 'Ej: Opción especial visita' : 'Ej: Pollo al horno'}
                            disabled={saving}
                            aria-invalid={Boolean(fieldErrors[getFieldKey('title', index)])}
                          />
                          {renderFieldError(getFieldKey('title', index))}
                        </label>
                      </div>
                      <label className="mt-3 block text-sm font-bold text-gray-800">
                        Descripción
                        <input
                          type="text"
                          value={item.description}
                          onChange={(event) => updateDraft(index, 'description', event.target.value)}
                          className="mt-1 input-field w-full bg-white text-gray-900"
                          placeholder="Descripción del plato"
                          disabled={saving}
                        />
                      </label>
                      {canRestore && (
                        <button
                          type="button"
                          onClick={() => restoreGlobal(index)}
                          className="mt-3 inline-flex items-center rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800"
                          disabled={saving}
                        >
                          <RotateCcw className="mr-1.5 h-4 w-4" />
                          Restaurar valor general
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-lg font-black text-gray-900">Vista final para los usuarios</h3>
              <p className="text-sm text-gray-600">Resultado combinado igual al formulario de pedidos.</p>
              <div className="mt-4 space-y-3">
                {finalItems.length === 0 ? (
                  <p className="text-sm font-semibold text-gray-500">No hay platos disponibles.</p>
                ) : finalItems.map((item, index) => {
                  const slot = getSlotIndexFromTitle(item.name)
                  return (
                    <div key={item.id || index} className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-sm font-black text-gray-900">
                        {Number.isFinite(slot) ? getMenuLabelByIndex(slot) : item.name}
                      </p>
                      {item.description && <p className="mt-1 text-sm text-gray-600">{item.description}</p>}
                      {!item.description && item.name && <p className="mt-1 text-sm text-gray-600">{stripSlotPrefix(item.name)}</p>}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-lg font-black text-gray-900">Cena para esta fecha</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {[
              ['none', 'Sin cena especial'],
              ['use_base', 'Usar también este menú para la cena'],
              ['different', 'Configurar una cena diferente']
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm font-bold text-gray-900">
                <input
                  type="radio"
                  name="company-admin-dinner-mode"
                  value={value}
                  checked={dinnerMode === value}
                  onChange={(event) => setDinnerMode(event.target.value)}
                  disabled={saving}
                />
                {label}
              </label>
            ))}
          </div>

          {dinnerMode === 'different' && (
            <div className="mt-4 space-y-3 rounded-xl border border-primary-200 bg-white p-4">
              <label className="block text-sm font-bold text-gray-800">
                Título de cena
                <input
                  ref={(node) => { fieldRefs.current.dinnerTitle = node }}
                  type="text"
                  value={dinnerTitle}
                  onChange={(event) => setDinnerTitle(event.target.value)}
                  className="mt-1 input-field w-full bg-white text-gray-900"
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.dinnerTitle)}
                />
                {renderFieldError('dinnerTitle')}
              </label>
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-800">Opciones de cena</p>
                {dinnerOptions.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      ref={(node) => { fieldRefs.current[getFieldKey('dinnerOption', index)] = node }}
                      type="text"
                      value={option}
                      onChange={(event) => updateDinnerOption(index, event.target.value)}
                      className="input-field flex-1 bg-white text-gray-900"
                      placeholder={`Opción ${index + 1}`}
                      disabled={saving}
                      aria-invalid={Boolean(fieldErrors[getFieldKey('dinnerOption', index)])}
                    />
                    {dinnerOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDinnerOption(index)}
                        className="rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                        disabled={saving}
                      >
                        Quitar
                      </button>
                    )}
                    {renderFieldError(getFieldKey('dinnerOption', index))}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDinnerOption}
                  className="w-full rounded-lg border-2 border-dashed border-gray-300 p-3 text-sm font-bold text-gray-700"
                  disabled={saving}
                >
                  Agregar opción de cena
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-base font-black text-gray-900">Resumen antes de guardar</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 text-sm font-semibold text-gray-700 sm:grid-cols-2">
            <p>Empresa: <span className="text-gray-950">{selectedCompanyName}</span></p>
            <p>Fecha de entrega: <span className="text-gray-950">{formatShortDate(deliveryDate)}</span></p>
            <p>Cambios de menú: <span className="text-gray-950">{hasMenuChanges ? currentDraftMenuItems.length + deletedItems.length : 0}</span></p>
            <p>Configuración de cena: <span className="text-gray-950">{
              dinnerMode === 'different' ? 'cena diferente' : dinnerMode === 'use_base' ? 'usar menú principal' : 'sin cena especial'
            }</span></p>
          </div>
          {conflictPrompt && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900" role="alert">
              <p className="whitespace-pre-line">{conflictPrompt.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => companyChangesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-black text-amber-900"
                >
                  Revisar menú actual
                </button>
                <button
                  type="button"
                  onClick={() => handleSave({ allowOverwrite: true })}
                  className="rounded-lg bg-amber-600 px-3 py-2 font-black text-white"
                >
                  Reemplazar
                </button>
                <button
                  type="button"
                  onClick={() => setConflictPrompt(null)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-black text-gray-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || loading}
            className="btn-primary mt-4 inline-flex w-full items-center justify-center px-4 py-3 text-sm font-black text-black sm:w-auto"
          >
            <Save className="mr-2 h-5 w-5" />
            {saving ? 'Guardando...' : `Guardar menú del ${formatDateLabel(deliveryDate).split(' de ')[0] || 'día seleccionado'}`}
          </button>
          {hasDinnerChanges && !hasMenuChanges && (
            <button
              type="button"
              onClick={() => handleSave({ retryDinnerOnly: true })}
              disabled={saving || loading}
              className="ml-0 mt-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 sm:ml-2 sm:mt-4"
            >
              Reintentar cena
            </button>
          )}
        </section>
      </div>
    </div>
  )
}

export default CompanyAdminMenuSection
