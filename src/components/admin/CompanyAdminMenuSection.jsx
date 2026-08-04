import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { db } from '../../supabaseClient'
import { getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import { confirmAction } from '../../utils/confirm'
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notice'
import { mergeCompanyMenuItems } from '../../utils/order/companyMenuMerge'
import { getMenuSlotIndex, getSlotIndexFromTitle, getMenuLabelByIndex, withMenuSlotIndex } from '../../utils/order/menuDisplay'
import { sortMenuItems } from '../../utils/order/orderMenuHelpers'

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
    if (!selectedCompanySlug || !deliveryDate) return
    if (!adminCompanySlugs.has(selectedCompanySlug) || selectedCompanySlug === 'global') {
      setError('La empresa seleccionada no está autorizada para tu usuario.')
      return
    }

    setLoading(true)
    setError('')
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
    } catch (err) {
      console.error('Error loading company admin menu', err)
      setError('No pudimos cargar el menú de esta fecha. Intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }, [adminCompanySlugs, deliveryDate, selectedCompanySlug])

  useEffect(() => {
    loadMenu()
  }, [loadMenu])

  const confirmDiscardPending = async () => {
    if (!hasPendingChanges) return true
    return confirmAction({
      title: 'Cambios sin guardar',
      message: 'Tenés cambios sin guardar. Si continuás, se descartarán.',
      confirmText: 'Descartar cambios'
    })
  }

  const handleCompanyChange = async (value) => {
    if (value === selectedCompanySlug) return
    const allowed = await confirmDiscardPending()
    if (!allowed) return
    setSelectedCompanySlug(value)
  }

  const handleDateChange = async (value) => {
    if (!value || value === deliveryDate) return
    const allowed = await confirmDiscardPending()
    if (!allowed) return
    setDeliveryDate(value)
  }

  const addDish = () => {
    const usedSlots = new Set(draftItems.map((item) => Number(item.slot)).filter((slot) => slot >= 0))
    const nextSlot = SLOT_OPTIONS.find((option) => option.value >= 0 && !usedSlots.has(option.value))?.value ?? -1
    setDraftItems((prev) => [...prev, { id: null, slot: nextSlot, title: '', description: '' }])
  }

  const updateDraft = (index, field, value) => {
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

  const handleSave = async () => {
    if (saving) return
    if (!adminCompanySlugs.has(selectedCompanySlug) || selectedCompanySlug === 'global') {
      notifyError('La empresa seleccionada no está autorizada para tu usuario.')
      return
    }

    const validItems = currentDraftMenuItems
    const changedExisting = validItems.filter((item) => item.id)
    if (changedExisting.length > 0 && hasMenuChanges) {
      const confirmed = await confirmAction({
        title: 'Sobrescribir personalizaciones',
        message: `Se guardarán cambios sobre ${changedExisting.length} personalización${changedExisting.length === 1 ? '' : 'es'} existente${changedExisting.length === 1 ? '' : 's'} de ${selectedCompanyName}.`,
        confirmText: 'Guardar cambios'
      })
      if (!confirmed) return
    }

    if (!hasPendingChanges) {
      notifyInfo('No hay cambios para guardar')
      return
    }

    setSaving(true)
    setError('')
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

      if (hasMenuChanges) {
        const { error } = await db.updateMenuItemsByDate(
          deliveryDate,
          validItems,
          crypto.randomUUID?.() || Math.random().toString(36).slice(2),
          selectedCompanySlug
        )
        if (error) throw error
      }

      if (hasDinnerChanges) {
        const { error } = await saveDinnerConfig()
        if (error) throw error
      }

      await loadMenu()
      notifySuccess(`El menú de ${selectedCompanyName} para el ${formatShortDate(deliveryDate)} se guardó correctamente`)
    } catch (err) {
      console.error('Error saving company admin menu', err)
      const message = err?.message || 'No pudimos guardar el menú. Revisá los datos e intentá nuevamente.'
      setError(message)
      notifyError(message)
    } finally {
      setSaving(false)
    }
  }

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
                value={selectedCompanySlug}
                onChange={(event) => handleCompanyChange(event.target.value)}
                className="mt-2 input-field w-full bg-white text-gray-900"
                disabled={saving}
              >
                {authorizedCompanies.map((company) => (
                  <option key={company.slug} value={company.slug}>{company.name}</option>
                ))}
              </select>
            )}
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
                  id="company-admin-delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => handleDateChange(event.target.value)}
                  className="sr-only"
                  disabled={saving}
                />
              </label>
            </div>
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
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {error}
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

            <section className="rounded-xl border border-primary-200 bg-primary-50 p-4">
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
                            value={item.slot}
                            onChange={(event) => updateDraft(index, 'slot', event.target.value)}
                            className="mt-1 input-field w-full bg-white text-gray-900"
                            disabled={saving}
                          >
                            {SLOT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-bold text-gray-800">
                          Nombre
                          <input
                            type="text"
                            value={item.title}
                            onChange={(event) => updateDraft(index, 'title', event.target.value)}
                            className="mt-1 input-field w-full bg-white text-gray-900"
                            placeholder={Number(item.slot) === -1 ? 'Ej: Opción especial visita' : 'Ej: Pollo al horno'}
                            disabled={saving}
                          />
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
                  type="text"
                  value={dinnerTitle}
                  onChange={(event) => setDinnerTitle(event.target.value)}
                  className="mt-1 input-field w-full bg-white text-gray-900"
                  disabled={saving}
                />
              </label>
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-800">Opciones de cena</p>
                {dinnerOptions.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(event) => updateDinnerOption(index, event.target.value)}
                      className="input-field flex-1 bg-white text-gray-900"
                      placeholder={`Opción ${index + 1}`}
                      disabled={saving}
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
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-primary mt-4 inline-flex w-full items-center justify-center px-4 py-3 text-sm font-black text-black sm:w-auto"
          >
            <Save className="mr-2 h-5 w-5" />
            {saving ? 'Guardando...' : `Guardar menú del ${formatDateLabel(deliveryDate).split(' de ')[0] || 'día seleccionado'}`}
          </button>
        </section>
      </div>
    </div>
  )
}

export default CompanyAdminMenuSection
