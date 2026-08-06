import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { db } from '../../supabaseClient'
import { ALL_COMPANY_LIST, COMPANY_CATALOG } from '../../constants/companyConfig'
import { ORDER_CUTOFF_HOUR, ORDER_START_HOUR, ORDER_TIMEZONE } from '../../constants/orderRules'
import { getTodayISOInTimeZone } from '../../utils/dateUtils'
import { mergeCompanyMenuItems } from '../../utils/order/companyMenuMerge'
import { filterOrderableMenuItems, getMenuDisplay, withMenuSlotIndex } from '../../utils/order/menuDisplay'
import { sortMenuItems } from '../../utils/order/orderMenuHelpers'
import { canChooseCustomSide } from '../../utils/order/orderCustomSideRules'
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
const isCustomSideOption = (option = {}) => getOptionTitle(option).toLowerCase().includes('guarn')

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
  if (message.includes('company_required')) return 'Seleccioná una empresa para el pedido extra.'
  if (message.includes('location_required')) return 'Seleccioná una sede válida para el pedido extra.'
  if (message.includes('items_required')) return 'Seleccioná al menos un menú con cantidad mayor a cero.'
  if (message.includes('invalid_service')) return 'Seleccioná un turno válido para el pedido extra.'
  if (message.includes('custom_responses_invalid')) return 'Las opciones del pedido tienen un formato inválido. Volvé a seleccionar las cantidades.'
  if (message.includes('location_not_allowed')) return 'La sede seleccionada no pertenece a la empresa autorizada.'
  if (message.includes('reason_required')) return 'Indicá el motivo del pedido extra.'
  if (message.includes('null value') && message.includes('user_id')) return 'La base todavía no permite pedidos extra sin cliente. Aplicá la migración SQL de pedidos extra.'
  return 'No pudimos crear el pedido extra. Revisá los datos e intentá nuevamente.'
}

const isCounterResponse = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)

const expandCounterResponse = (value = {}) =>
  Object.entries(value).flatMap(([label, quantity]) => {
    const count = Number(quantity) || 0
    return count > 0 ? Array.from({ length: count }, () => label) : []
  })

const buildResponsePayload = (options, responses, selectedItems = []) => (options || [])
  .flatMap((option) => {
    const rawValue = responses[option.id]
    const expandedValue = isCounterResponse(rawValue) ? expandCounterResponse(rawValue) : rawValue
    const value = expandedValue
    if (Array.isArray(value) && value.length === 0) return null
    if (typeof value === 'string' && value.trim() === '') return null
    if (!value) return null
    const quantityMap = isCounterResponse(rawValue)
      ? Object.fromEntries(Object.entries(rawValue).filter(([, quantity]) => Number(quantity) > 0))
      : null
    const baseResponse = {
      id: option.id,
      title: getOptionTitle(option),
      response: value,
      ...(quantityMap ? { quantities: quantityMap } : {})
    }
    if (isCustomSideOption(option) && selectedItems.length === 1) {
      const [item] = selectedItems
      return {
        ...baseResponse,
        item_id: item.id,
        itemId: item.id,
        itemName: item.name || item.description || '',
        slotIndex: item.slotIndex ?? 0
      }
    }
    return {
      ...baseResponse
    }
  })
  .filter(Boolean)

const hasOptionResponse = (value) => {
  if (Array.isArray(value)) return value.length > 0
  if (isCounterResponse(value)) return Object.values(value).some((quantity) => Number(quantity) > 0)
  if (typeof value === 'string') return value.trim() !== ''
  return Boolean(value)
}

const getCounterTotal = (counts = {}) =>
  Object.values(counts || {}).reduce((sum, quantity) => sum + Math.max(Number(quantity) || 0, 0), 0)

const CounterControl = ({ value = 0, onChange, min = 0, max = 99, ariaLabel }) => {
  const safeValue = Math.min(Math.max(Number(value) || 0, min), max)
  const setNext = (next) => onChange(Math.min(Math.max(next, min), max))
  const handleInputChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '')
    setNext(digits === '' ? 0 : Number(digits))
  }

  return (
    <div
      className="sf-admin-extra-counter grid h-11 min-w-[144px] shrink-0 grid-cols-[44px_56px_44px] rounded-lg border border-slate-300 bg-white shadow-sm"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => setNext(safeValue - 1)}
        disabled={safeValue <= min}
        className="sf-admin-extra-counter__button flex h-11 w-11 min-w-11 items-center justify-center rounded-l-lg bg-slate-50 p-0 text-xl font-black leading-none text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
        aria-label={`${ariaLabel || 'contador'}: restar`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={safeValue}
        onChange={handleInputChange}
        className="sf-admin-extra-counter__value h-11 w-14 min-w-14 border-x border-slate-200 bg-white p-0 text-center text-base font-black leading-none text-slate-950 focus:outline-none focus:ring-2 focus:ring-orange-400"
        aria-label={ariaLabel}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
      <button
        type="button"
        onClick={() => setNext(safeValue + 1)}
        disabled={safeValue >= max}
        className="sf-admin-extra-counter__button flex h-11 w-11 min-w-11 items-center justify-center rounded-r-lg bg-slate-50 p-0 text-xl font-black leading-none text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
        aria-label={`${ariaLabel || 'contador'}: sumar`}
      >
        +
      </button>
    </div>
  )
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

  const [deliveryDate, setDeliveryDate] = useState(operationalDate || today)
  const [companySlug, setCompanySlug] = useState('')
  const [location, setLocation] = useState('')
  const [service, setService] = useState('lunch')
  const [menuItems, setMenuItems] = useState([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [menuMessage, setMenuMessage] = useState('')
  const [menuCounts, setMenuCounts] = useState({})
  const [customOptions, setCustomOptions] = useState([])
  const [customResponses, setCustomResponses] = useState({})
  const [reason, setReason] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const [comment, setComment] = useState('')
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
      setMenuMessage('')
      setMenuCounts({})
      setCustomResponses({})
      try {
        const [globalResult, companyResult] = await Promise.all([
          db.getMenuItemsByDate(deliveryDate, 'global'),
          companySlug === 'global' ? { data: [], error: null } : db.getMenuItemsByDate(deliveryDate, companySlug)
        ])
        if (globalResult.error) throw globalResult.error
        if (companyResult.error) throw companyResult.error

        const merged = mergeCompanyMenuItems(globalResult.data || [], companyResult.data || [])
        const baseMenuItems = filterOrderableMenuItems(withMenuSlotIndex(sortMenuItems(merged)), companySlug)
        let nextMenuItems = baseMenuItems

        if (service === 'dinner') {
          const { data: dinnerData, error: dinnerError } = await db.getDinnerMenuByDate({ date: deliveryDate, company: companySlug })
          if (dinnerError) throw dinnerError
          const dinnerOptions = dinnerData?.active && Array.isArray(dinnerData?.options)
            ? dinnerData.options
                .map((option) => String(option || '').trim())
                .filter(Boolean)
                .map((option, index) => ({
                  id: `dinner-special-${deliveryDate}-${companySlug}-${index}`,
                  name: `Cena: ${option}`,
                  description: option,
                  slotIndex: baseMenuItems.length + index
                }))
            : []
          nextMenuItems = [...baseMenuItems, ...dinnerOptions]
        }

        const sourceSlug = selectedCompany?.optionsSourceSlug || companySlug
        const { data: optionsData, error: optionsError } = await db.getVisibleCustomOptions({
          company: sourceSlug,
          meal: service,
          date: deliveryDate
        })
        if (optionsError) throw optionsError
        if (!cancelled) {
          setMenuItems(nextMenuItems)
          setCustomOptions(Array.isArray(optionsData) ? optionsData : [])
          if (nextMenuItems.length === 0) {
            setMenuMessage('No hay menú cargado para esa fecha, empresa y turno.')
          }
        }
      } catch (_error) {
        if (!cancelled) {
          setMenuItems([])
          setCustomOptions([])
          setMenuMessage('No pudimos cargar el menú para esa fecha y empresa.')
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

  const selectedItems = useMemo(
    () => menuItems
      .map((item) => ({
        ...item,
        quantity: Math.max(Number(menuCounts[item.id]) || 0, 0)
      }))
      .filter((item) => item.quantity > 0),
    [menuCounts, menuItems]
  )
  const totalMenuCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0)

  const handleOptionChange = (option, value) => {
    setCustomResponses((prev) => ({ ...prev, [option.id]: value }))
  }

  const handleOptionCountChange = (option, label, nextQuantity) => {
    setCustomResponses((prev) => ({
      ...prev,
      [option.id]: {
        ...(isCounterResponse(prev[option.id]) ? prev[option.id] : {}),
        [label]: nextQuantity
      }
    }))
  }

  const handleMenuCountChange = (item, nextQuantity) => {
    setMenuCounts((prev) => ({
      ...prev,
      [item.id]: nextQuantity
    }))
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
    if (selectedItems.length === 0) {
      notifyError('Seleccioná al menos un menú del menú vigente.')
      return
    }
    if (!resolvedReason) {
      notifyError('Indicá el motivo del pedido extra.')
      return
    }
    const missingRequired = customOptions
      .filter((option) => {
        if (!option.required) return false
        if (isCustomSideOption(option) && !selectedItems.some(canChooseCustomSide)) return false
        return !hasOptionResponse(customResponses[option.id])
      })
      .map(getOptionTitle)
    if (missingRequired.length > 0) {
      notifyError(`Completá las opciones requeridas: ${missingRequired.join(', ')}.`)
      return
    }
    const blockedCustomSide = !selectedItems.some(canChooseCustomSide) && customOptions.some((option) =>
      isCustomSideOption(option) && hasOptionResponse(customResponses[option.id])
    )
    if (blockedCustomSide) {
      notifyError('La guarnición distinta no está disponible para esta opción.')
      return
    }
    setSubmitting(true)
    const payload = {
      client_user_id: null,
      customer_name: null,
      customer_email: null,
      customer_phone: null,
      delivery_date: deliveryDate,
      company_slug: companySlug,
      company_name: selectedCompany?.name || companySlug,
      location,
      service,
      items: selectedItems.map((item) => ({
        id: item.id,
        name: item.name || item.description || 'Menú',
        description: item.description || '',
        quantity: item.quantity,
        slotIndex: item.slotIndex ?? 0
      })),
      custom_responses: buildResponsePayload(customOptions, customResponses, selectedItems),
      quantity: totalMenuCount,
      reason: resolvedReason,
      comment,
      duplicate_confirmed: false
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900">Menús</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                Total: {totalMenuCount}
              </span>
            </div>
            {menuLoading && <p className="mt-2 text-sm font-semibold text-slate-500">Cargando menú...</p>}
            {!menuLoading && menuItems.length > 0 && (
              <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {menuItems.map((item, index) => {
                  const display = getMenuDisplay(item, index)
                  const text = [display.label, display.dish].filter(Boolean).join(' - ') || item.name || 'Menú'
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1 pr-1">
                        <p className="text-sm font-bold text-slate-900">{text}</p>
                      </div>
                      <CounterControl
                        value={menuCounts[item.id] || 0}
                        onChange={(next) => handleMenuCountChange(item, next)}
                        ariaLabel={`Cantidad de ${text}`}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {menuMessage && (
              <span className="mt-2 block text-xs font-semibold text-amber-700">{menuMessage}</span>
            )}
          </div>

          {customOptions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {customOptions.map((option) => {
                const values = safeOptions(option)
                const title = getOptionTitle(option)
                const optionCounts = isCounterResponse(customResponses[option.id]) ? customResponses[option.id] : {}
                const optionCountTotal = getCounterTotal(optionCounts)
                return (
                  <div key={option.id} className="text-sm font-bold text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span>{title}{option.required ? ' *' : ''}</span>
                      {values.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">
                          {optionCountTotal}
                        </span>
                      )}
                    </div>
                    {values.length > 0 ? (
                      <div className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {values.map((value) => (
                          <div key={value} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1 pr-1 text-sm font-semibold text-slate-800">{value}</span>
                            <CounterControl
                              value={optionCounts[value] || 0}
                              onChange={(next) => handleOptionCountChange(option, value, next)}
                              ariaLabel={`Cantidad de ${title}: ${value}`}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={customResponses[option.id] || ''}
                        onChange={(event) => handleOptionChange(option, event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                      />
                    )}
                  </div>
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
