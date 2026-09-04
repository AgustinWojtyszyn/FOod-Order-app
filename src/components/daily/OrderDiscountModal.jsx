import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Minus, X } from 'lucide-react'
import { getCompanyByLocationOrSlug } from '../../constants/companyConfig'

const getItemQuantity = (item = {}) => Math.max(0, Number(item?.quantity) || 1)

const getOrderCompanyLabel = (order = {}) => {
  const company = getCompanyByLocationOrSlug(
    order.company_slug || order.organization || order.company_name || order.location
  )
  return company?.name || order.company_name || order.organization || order.location || 'Sin empresa'
}

const buildOrderLabel = (order = {}) => {
  const client = order.user_name || order.customer_name || order.customer_email || 'Pedido sin cliente'
  const origin = order.order_origin === 'admin_extra' ? 'extra' : 'normal'
  return `${client} · ${getOrderCompanyLabel(order)} · ${origin}`
}

const OrderDiscountModal = ({
  open,
  orders = [],
  operationalDate,
  submitting = false,
  onClose,
  onSubmit
}) => {
  const [orderId, setOrderId] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [contextFilter, setContextFilter] = useState('all')
  const [itemIndex, setItemIndex] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const baseOrders = useMemo(() => (
    (Array.isArray(orders) ? orders : [])
      .filter((order) =>
        order?.id &&
        String(order.delivery_date || '') === String(operationalDate || '') &&
        Array.isArray(order.items) &&
        order.items.some((item) => getItemQuantity(item) > 0)
      )
      .sort((a, b) => buildOrderLabel(a).localeCompare(buildOrderLabel(b), 'es'))
  ), [orders, operationalDate])

  const companyOptions = useMemo(() => {
    const labels = new Set(baseOrders.map(getOrderCompanyLabel).filter(Boolean))
    return [...labels].sort((a, b) => a.localeCompare(b, 'es'))
  }, [baseOrders])

  const selectableOrders = useMemo(() => (
    baseOrders.filter((order) => {
      const orderContext = order.order_origin === 'admin_extra'
        ? 'admin_extra'
        : order.status === 'post_report_extra'
          ? 'post_report_extra'
          : 'normal'
      return (companyFilter === 'all' || getOrderCompanyLabel(order) === companyFilter) &&
        (contextFilter === 'all' || orderContext === contextFilter)
    })
  ), [baseOrders, companyFilter, contextFilter])

  const selectedOrder = selectableOrders.find((order) => String(order.id) === String(orderId)) || null
  const selectableItems = Array.isArray(selectedOrder?.items)
    ? selectedOrder.items
        .map((item, index) => ({ item, index, quantity: getItemQuantity(item) }))
        .filter(({ quantity }) => quantity > 0)
    : []
  const selectedItem = selectableItems.find((entry) => String(entry.index) === String(itemIndex)) || null
  const maxQuantity = selectedItem?.quantity || 0

  useEffect(() => {
    if (!open) return
    setOrderId('')
    setCompanyFilter('all')
    setContextFilter('all')
    setItemIndex('')
    setQuantity(1)
    setReason('')
    setError('')
  }, [open])

  useEffect(() => {
    setOrderId('')
    setItemIndex('')
    setQuantity(1)
  }, [companyFilter, contextFilter])

  useEffect(() => {
    setItemIndex('')
    setQuantity(1)
  }, [orderId])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const normalizedQuantity = Number(quantity)
    const normalizedReason = String(reason || '').trim()

    if (!selectedOrder) {
      setError('Seleccioná un pedido.')
      return
    }
    if (!selectedItem) {
      setError('Seleccioná un ítem del pedido.')
      return
    }
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      setError('La cantidad debe ser mayor a cero.')
      return
    }
    if (normalizedQuantity > maxQuantity) {
      setError(`La cantidad disponible para ese ítem es ${maxQuantity}.`)
      return
    }
    if (!normalizedReason) {
      setError('Indicá el motivo del descuento.')
      return
    }

    const result = await onSubmit?.({
      order_id: selectedOrder.id,
      item_index: selectedItem.index,
      item_id: selectedItem.item?.id || null,
      item_name: selectedItem.item?.name || '',
      quantity: normalizedQuantity,
      reason: normalizedReason
    })

    if (!result?.error) onClose?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 print-hide">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">Descontar pedidos</h2>
            <p className="text-sm font-semibold text-slate-500">Fecha operativa: {operationalDate}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            disabled={submitting}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Empresa</span>
              <select
                value={companyFilter}
                onChange={(event) => setCompanyFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                disabled={submitting}
              >
                <option value="all">Todas las empresas</option>
                {companyOptions.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Contexto</span>
              <select
                value={contextFilter}
                onChange={(event) => setContextFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                disabled={submitting}
              >
                <option value="all">Todos los contextos</option>
                <option value="normal">Pedido normal</option>
                <option value="admin_extra">Pedido extra admin</option>
                <option value="post_report_extra">Extra post reporte</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Pedido</span>
            <select
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              disabled={submitting}
            >
              <option value="">Seleccionar pedido</option>
              {selectableOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {buildOrderLabel(order)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Ítem</span>
            <select
              value={itemIndex}
              onChange={(event) => {
                setItemIndex(event.target.value)
                setQuantity(1)
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              disabled={submitting || !selectedOrder}
            >
              <option value="">Seleccionar ítem</option>
              {selectableItems.map(({ item, index, quantity: itemQuantity }) => (
                <option key={`${index}-${item?.name || 'item'}`} value={index}>
                  {item?.name || 'Ítem sin nombre'} · disponible {itemQuantity}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Cantidad</span>
              <input
                type="number"
                min="1"
                max={maxQuantity || 1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                disabled={submitting || !selectedItem}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Motivo</span>
              <input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                disabled={submitting}
                placeholder="Motivo obligatorio"
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
            >
              <Minus className="mr-2 h-4 w-4" />
              {submitting ? 'Registrando...' : 'Registrar descuento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default OrderDiscountModal
