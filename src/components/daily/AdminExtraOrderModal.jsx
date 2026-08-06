import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Search, X } from 'lucide-react'
import { db } from '../../supabaseClient'
import { ALL_COMPANY_LIST, COMPANY_CATALOG } from '../../constants/companyConfig'
import { ORDER_CUTOFF_HOUR, ORDER_START_HOUR, ORDER_TIMEZONE } from '../../constants/orderRules'
import { getTodayISOInTimeZone } from '../../utils/dateUtils'
import { mergeCompanyMenuItems } from '../../utils/order/companyMenuMerge'
import { filterOrderableMenuItems, getMenuDisplay, withMenuSlotIndex } from '../../utils/order/menuDisplay'
import { sortMenuItems } from '../../utils/order/orderMenuHelpers'
import { notifyError, notifySuccess } from '../../utils/notice'

const REASONS = [
  { value: 'olvido', label: 'Olvido' },
  { value: 'visita', label: 'Visita' },
  { value: 'contingencia', label: 'Contingencia' },
  { value: 'pedido_adicional', label: 'Pedido adicional' },
  { value: 'otro', label: 'Otro' }
]

const getArgentinaHour = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ORDER_TIMEZONE,
    hour: '2-digit',
    hour12: false
  }).formatToParts(new Date())
  return Number(parts.find((part) => part.type === 'hour')?.value || 0)
}

const isOutsideOrderWindow = () => {
  const hour = getArgentinaHour()
  return hour < ORDER_START_HOUR || hour >= ORDER_CUTOFF_HOUR
}

const normalizeText = (value = '') => String(value || '').trim()

const getOptionTitle = (option = {}) => option.title || option.label || option.name || 'Opción'

const safeOptions = (option = {}) => {
  if (Array.isArray(option.options)) return option.options
  if (typeof option.options === 'string') {
    try {
      const parsed = JSON.parse(option.options)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const mapErrorMessage = (error) => {
  const message = String(error?.message || error || '').toLowerCase()
  if (message.includes('not_authorized')) return 'No tenés autorización para cargar pedidos extra en esa empresa.'
  if (message.includes('invalid_delivery_date')) return 'No se pueden cargar pedidos extra para fechas pasadas.'
  if (message.includes('menu_required')) return 'No existe un menú válido para esa fecha, empresa y turno.'
  if (message.includes('location_not_allowed')) return 'La sede seleccionada no pertenece a la empresa autorizada.'
  if (message.includes('duplicate_active_order')) return 'La persona ya tiene un pedido para esa fecha y turno. Confirmá que es adicional.'
  if (message.includes('reason_required')) return 'Indicá el motivo del pedido extra.'
  if (message.includes('customer_reference_required')) return 'Indicá un nombre o referencia para la visita/extra.'
  return 'No pudimos crear el pedido extra. Revisá los datos e intentá nuevamente.'
}

const buildResponsePayload = (options, responses) => (options || [])
  .map((option) => {
    const value = responses[option.id]
    if (Array.isArray(value) && value.length === 0) return null
    if (typeof value === 'string' && value.trim() === '') return null
    if (!value) return null
    return {
      id: option.id,
      title: getOptionTitle(option),
      response: value
    }
  })
  .filter(Boolean)

const hasOptionResponse = (value) => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim() !== ''
  return Boolean(value)
}

const AdminExtraOrderModal = ({
  open,
  onClose,
  onCreated,
  operationalDate,
  isGlobalAdmin,
  adminCompanies = []
}) => {
  const today = getTodayISOInTimeZone()
  const companyOptions = useMemo(() => {
    const scoped = isGlobalAdmin ? ALL_COMPANY_LIST : adminCompanies
    return (scoped || [])
      .map((company) => COMPANY_CATALOG[company.slug] || company)
      .filter((company) => company?.slug && company.slug !== 'global')
  }, [adminCompanies, isGlobalAdmin])

  const [mode, setMode] = useState('registered')
  const [deliveryDate, setDeliveryDate] = useState(operationalDate || today)
  const [companySlug, setCompanySlug] = useState('')
  const [location, setLocation] = useState('')
  const [service, setService] = useState('lunch')
  const [menuItems, setMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [customOptions, setCustomOptions] = useState([])
  const [customResponses, setCustomResponses] = useState({})
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [comment, setComment] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [duplicateOrder, setDuplicateOrder] = useState(null)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const selectedCompany = useMemo(
    () => companyOptions.find((company) => company.slug === companySlug) || null,
    [companyOptions, companySlug]
  )
  const locations = selectedCompany?.locations?.length ? selectedCompany.locations : [selectedCompany?.name].filter(Boolean)
  const outsideWindow = isOutsideOrderWindow()
  const resolvedReason = reason === 'otro' ? normalizeText(otherReason) : reason

  useEffect(() => {
    if (!open) return
    setDeliveryDate(operationalDate || today)
    setCompanySlug(companyOptions[0]?.slug || '')
  }, [companyOptions, open, operationalDate, today])

  useEffect(() => {
    if (!selectedCompany) {
      setLocation('')
      return
    }
    setLocation((current) => (locations.includes(current) ? current : locations[0] || ''))
  }, [locations, selectedCompany])

  useEffect(() => {
    if (!open || !companySlug || !deliveryDate) return
    let cancelled = false
    const loadMenu = async () => {
      setMenuLoading(true)
      setSelectedItemId('')
      setCustomResponses({})
      try {
        if (service === 'dinner') {
          const { data, error } = await db.getDinnerMenuByDate({ date: deliveryDate, company: companySlug })
          if (error) throw error
          const options = data?.active && Array.isArray(data?.options)
            ? data.options.map((option, index) => ({
                id: `dinner-${index}`,
                name: `Cena: ${option}`,
                description: option,
                slotIndex: index
              }))
            : []
          if (!cancelled) setMenuItems(options)
        } else {
          const [globalResult, companyResult] = await Promise.all([
            db.getMenuItemsByDate(deliveryDate, 'global'),
            companySlug === 'global' ? { data: [], error: null } : db.getMenuItemsByDate(deliveryDate, companySlug)
          ])
          if (globalResult.error) throw globalResult.error
          if (companyResult.error) throw companyResult.error
          const merged = mergeCompanyMenuItems(globalResult.data || [], companyResult.data || [])
          const orderable = filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(merged)), companySlug)
          if (!cancelled) setMenuItems(orderable)
        }

        const sourceSlug = selectedCompany?.optionsSourceSlug || companySlug
        const { data: optionsData, error: optionsError } = await db.getVisibleCustomOptions({
          company: sourceSlug,
          meal: service,
          date: deliveryDate
        })
        if (optionsError) throw optionsError
        if (!cancelled) setCustomOptions(Array.isArray(optionsData) ? optionsData : [])
      } catch (_error) {
        if (!cancelled) {
          setMenuItems([])
          setCustomOptions([])
          notifyError('No pudimos cargar el menú y las opciones para el pedido extra.')
        }
      } finally {
        if (!cancelled) setMenuLoading(false)
      }
    }
    loadMenu()
    return () => {
      cancelled = true
    }
  }, [companySlug, deliveryDate, open, selectedCompany, service])

  useEffect(() => {
    if (!open || mode !== 'registered' || search.trim().length < 2) {
      setSearchResults([])
      return undefined
    }
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true)
      const { data, error } = await db.searchAdminExtraOrderPeople({
        search,
        companySlug,
        limit: 8
      })
      if (error) {
        notifyError('No pudimos buscar personas.')
        setSearchResults([])
      } else {
        setSearchResults(Array.isArray(data) ? data : [])
      }
      setSearchLoading(false)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [companySlug, mode, open, search])

  const checkDuplicate = useCallback(async () => {
    if (mode !== 'registered' || !selectedPerson?.id || !deliveryDate || !service || !companySlug) {
      setDuplicateOrder(null)
      setDuplicateConfirmed(false)
      return
    }
    const { data, error } = await db.getAdminExtraOrderDuplicate({
      clientUserId: selectedPerson.id,
      deliveryDate,
      service,
      companySlug
    })
    if (error) {
      setDuplicateOrder(null)
      return
    }
    setDuplicateOrder(data || null)
    setDuplicateConfirmed(false)
  }, [companySlug, deliveryDate, mode, selectedPerson, service])

  useEffect(() => {
    checkDuplicate()
  }, [checkDuplicate])

  const selectedItem = menuItems.find((item) => String(item.id) === String(selectedItemId))

  const handleOptionChange = (option, value) => {
    setCustomResponses((prev) => ({ ...prev, [option.id]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (deliveryDate < today) {
      notifyError('No se pueden cargar pedidos extra para fechas pasadas.')
      return
    }
    if (!companySlug || !location) {
      notifyError('Seleccioná empresa y sede.')
      return
    }
    if (!selectedItem) {
      notifyError('Seleccioná un plato del menú vigente.')
      return
    }
    if (!resolvedReason) {
      notifyError('Indicá el motivo del pedido extra.')
      return
    }
    const missingRequired = customOptions
      .filter((option) => option.required && !hasOptionResponse(customResponses[option.id]))
      .map(getOptionTitle)
    if (missingRequired.length > 0) {
      notifyError(`Completá las opciones requeridas: ${missingRequired.join(', ')}.`)
      return
    }
    if (mode === 'registered' && !selectedPerson?.id) {
      notifyError('Seleccioná una persona registrada.')
      return
    }
    if (mode === 'guest' && !normalizeText(guestName)) {
      notifyError('Indicá nombre o referencia para la visita/extra.')
      return
    }
    if (duplicateOrder && !duplicateConfirmed) {
      notifyError('Confirmá explícitamente que se trata de un pedido adicional.')
      return
    }

    setSubmitting(true)
    const payload = {
      client_user_id: mode === 'registered' ? selectedPerson.id : null,
      customer_name: mode === 'registered'
        ? (selectedPerson.full_name || selectedPerson.email)
        : guestName,
      customer_email: mode === 'registered' ? selectedPerson.email : guestEmail,
      customer_phone: mode === 'registered' ? null : guestPhone,
      delivery_date: deliveryDate,
      company_slug: companySlug,
      company_name: selectedCompany?.name || companySlug,
      location,
      service,
      items: [{
        id: selectedItem.id,
        name: selectedItem.name || selectedItem.description || 'Menú',
        description: selectedItem.description || '',
        quantity: Number(quantity) || 1,
        slotIndex: selectedItem.slotIndex ?? 0
      }],
      custom_responses: buildResponsePayload(customOptions, customResponses),
      quantity: Number(quantity) || 1,
      reason: resolvedReason,
      comment,
      duplicate_confirmed: Boolean(duplicateOrder && duplicateConfirmed)
    }

    const { error } = await db.createAdminExtraOrder(payload)
    setSubmitting(false)
    if (error) {
      notifyError(mapErrorMessage(error))
      return
    }
    notifySuccess('Pedido extra cargado correctamente.')
    onCreated?.()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4 print:hidden">
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-black text-slate-900">Pedido extra</h2>
            <p className="text-xs font-semibold text-slate-500">Carga administrativa para Pedidos Diarios</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-5">
          {outsideWindow && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Estás cargando fuera del horario normal ({String(ORDER_START_HOUR).padStart(2, '0')}:00 a {String(ORDER_CUTOFF_HOUR).padStart(2, '0')}:00, Argentina). Se registrará como excepción horaria.
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              Fecha de entrega
              <input
                type="date"
                min={today}
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              />
            </label>

            <label className="text-sm font-bold text-slate-700">
              Empresa
              <select
                value={companySlug}
                onChange={(event) => setCompanySlug(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                {companyOptions.map((company) => (
                  <option key={company.slug} value={company.slug}>{company.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Ubicación o sede
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                {locations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Turno
              <select
                value={service}
                onChange={(event) => setService(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                <option value="lunch">Almuerzo</option>
                <option value="dinner">Cena</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode('registered')}
                className={`rounded-md px-3 py-2 text-sm font-bold ${mode === 'registered' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Persona registrada
              </button>
              <button
                type="button"
                onClick={() => setMode('guest')}
                className={`rounded-md px-3 py-2 text-sm font-bold ${mode === 'guest' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Visita o extra
              </button>
            </div>

            {mode === 'registered' ? (
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700">
                  Buscar persona
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value)
                        setSelectedPerson(null)
                      }}
                      placeholder="Nombre o correo"
                      className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-semibold"
                    />
                  </div>
                </label>
                {searchLoading && <p className="text-xs font-semibold text-slate-500">Buscando...</p>}
                {searchResults.length > 0 && !selectedPerson && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {searchResults.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          setSelectedPerson(person)
                          setSearch(person.full_name || person.email || '')
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="block font-bold text-slate-900">{person.full_name || 'Sin nombre'}</span>
                        <span className="block text-xs font-semibold text-slate-500">{person.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPerson && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                    <span className="font-bold text-emerald-950">{selectedPerson.full_name || selectedPerson.email}</span>
                    <span className="ml-2 text-emerald-800">{selectedPerson.email}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="sm:col-span-3 text-sm font-bold text-slate-700">
                  Nombre o referencia
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="Visita Gerencia"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                  />
                </label>
                <input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="Correo opcional" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" />
                <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="Teléfono opcional" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold sm:col-span-2" />
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <label className="text-sm font-bold text-slate-700">
              Plato
              <select
                value={selectedItemId}
                onChange={(event) => setSelectedItemId(event.target.value)}
                disabled={menuLoading || menuItems.length === 0}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:bg-slate-100"
              >
                <option value="">{menuLoading ? 'Cargando menú...' : 'Seleccionar plato'}</option>
                {menuItems.map((item, index) => {
                  const display = getMenuDisplay(item, index)
                  const text = [display.label, display.dish].filter(Boolean).join(' - ')
                  return <option key={item.id} value={item.id}>{text}</option>
                })}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Cantidad
              <input
                type="number"
                min="1"
                max="99"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              />
            </label>
          </div>

          {customOptions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {customOptions.map((option) => {
                const values = safeOptions(option)
                const title = getOptionTitle(option)
                return (
                  <label key={option.id} className="text-sm font-bold text-slate-700">
                    {title}{option.required ? ' *' : ''}
                    {values.length > 0 ? (
                      <select
                        value={customResponses[option.id] || ''}
                        onChange={(event) => handleOptionChange(option, event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      >
                        <option value="">Sin seleccionar</option>
                        {values.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    ) : (
                      <input
                        value={customResponses[option.id] || ''}
                        onChange={(event) => handleOptionChange(option, event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      />
                    )}
                  </label>
                )
              })}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              Motivo
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              >
                <option value="">Seleccionar motivo</option>
                {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            {reason === 'otro' && (
              <label className="text-sm font-bold text-slate-700">
                Detalle del motivo
                <input
                  value={otherReason}
                  onChange={(event) => setOtherReason(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                />
              </label>
            )}
          </div>

          <label className="block text-sm font-bold text-slate-700">
            Comentario opcional
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            />
          </label>

          {duplicateOrder && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-black">La persona ya tiene un pedido pendiente para esta fecha y turno.</p>
              <p className="mt-1 font-semibold">
                Pedido existente: {(duplicateOrder.items || []).map((item) => item.name).join(', ') || 'Sin detalle'}.
              </p>
              <label className="mt-3 flex items-start gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={duplicateConfirmed}
                  onChange={(event) => setDuplicateConfirmed(event.target.checked)}
                  className="mt-1"
                />
                Confirmo que este pedido es adicional y debe auditarse como duplicado confirmado.
              </label>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || menuLoading}
              className="inline-flex justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cargar pedido extra
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminExtraOrderModal
