import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, db } from '../supabaseClient'
import { useAuthContext } from '../contexts/authContextValue'
import { COMPANY_LIST } from '../constants/companyConfig'
import RequireUser from './RequireUser'
import { getUserFriendlyErrorMessage, isOrderEditable, formatDate } from '../utils'
import { EDIT_WINDOW_MINUTES } from '../constants/orderRules'
import { confirmAction } from '../utils/confirm'
import { notifyError, notifyInfo, notifySuccess } from '../utils/notice'
import { isAdminExtraOrder, resolveAdminExtraCreator } from '../utils/daily/adminExtraOrders'
import {
  ArrowLeft,
  Building2,
  Calendar,
  ChefHat,
  Clock,
  Edit,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Package,
  Phone,
  RefreshCw,
  Sun,
  Trash2,
  User
} from 'lucide-react'

const normalizeList = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const formatDateOnly = (value) => {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const statusMeta = {
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  archived: { label: 'Archivado', className: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800 border-red-200' },
  unknown: { label: 'Estado desconocido', className: 'bg-slate-100 text-slate-700 border-slate-300' }
}


const OrderDetails = ({ user, loading }) => {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuthContext()
  const [order, setOrder] = useState(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const companyByLocation = useMemo(() => {
    const map = new Map()
    COMPANY_LIST.forEach((company) => {
      ;(company.locations || []).forEach((location) => {
        map.set(String(location || '').toLowerCase(), company)
      })
    })
    return map
  }, [])

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId || !user?.id) return
      setLocalLoading(true)
      setError('')
      try {
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single()

        if (fetchError) {
          setError('No se pudo cargar el pedido. Puede que no exista o no tengas permisos.')
          setOrder(null)
          return
        }

        setOrder(data)
      } catch (_err) {
        setError('No se pudo cargar el pedido. Intenta nuevamente.')
        setOrder(null)
      } finally {
        setLocalLoading(false)
      }
    }

    fetchOrder()
  }, [orderId, user?.id])

  const items = normalizeList(order?.items)
  const rawCustomResponses = normalizeList(order?.custom_responses)
  const customResponses = rawCustomResponses.filter((resp) => {
    const value = resp?.response ?? resp?.answer ?? resp?.options ?? resp?.value
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim().length > 0
    return Boolean(value)
  })

  const service = (order?.service || 'lunch').toLowerCase()
  const serviceLabel = service === 'dinner' ? 'Cena' : 'Almuerzo'
  const serviceIcon = service === 'dinner' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />

  const status = String(order?.displayStatus || order?.status || '').toLowerCase()
  const statusInfo = statusMeta[status] || statusMeta.unknown

  const company = companyByLocation.get(String(order?.location || '').toLowerCase())
  const isExtra = isAdminExtraOrder(order)
  const adminCreator = resolveAdminExtraCreator(order)
  const canEditOrder = order?.created_at
    ? isOrderEditable(order.created_at, EDIT_WINDOW_MINUTES)
    : false
  const canModifyPendingOrder = canEditOrder && status === 'pending'

  const handleRepeatOrder = () => {
    if (!order) return

    const payload = {
      order_id: order.id,
      location: order.location || '',
      service: order.service || 'lunch',
      items: items,
      custom_responses: rawCustomResponses,
      comments: order.comments || ''
    }

    const target = company?.slug ? `/order/${company.slug}` : '/order'
    navigate(target, { state: { repeatPayload: payload } })
  }

  const handleEditOrder = () => {
    if (!order) return
    if (!canEditOrder) {
      notifyInfo(`Solo puedes editar tu pedido dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos.`)
      return
    }
    navigate('/edit-order', { state: { order } })
  }

  const handleDeleteOrder = async () => {
    if (!order || deleteSubmitting) return
    if (!canModifyPendingOrder) {
      notifyInfo(`Solo puedes cancelar tu pedido pendiente dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos.`)
      return
    }
    const confirmed = await confirmAction({
      title: isAdmin ? 'Eliminar pedido' : 'Cancelar pedido',
      message: isAdmin
        ? 'Esta acción elimina el pedido por completo.'
        : 'El pedido quedará archivado para conservar el historial.',
      confirmText: isAdmin ? 'Eliminar' : 'Cancelar pedido'
    })
    if (!confirmed) return
    setDeleteSubmitting(true)
    try {
      const editableSince = new Date(Date.now() - EDIT_WINDOW_MINUTES * 60 * 1000).toISOString()
      const result = isAdmin
        ? await db.deleteOrder(order.id)
        : await db.cancelOwnPendingOrder({
            orderId: order.id,
            userId: user.id,
            editableSince
          })
      const { data, error: deleteError } = result
      if (deleteError) {
        notifyError(getUserFriendlyErrorMessage(deleteError))
        return
      }
      if (!isAdmin && (!Array.isArray(data) || data.length === 0)) {
        notifyError(`No se pudo cancelar el pedido. Verificá que siga pendiente y dentro de los primeros ${EDIT_WINDOW_MINUTES} minutos.`)
        return
      }
      notifySuccess(isAdmin ? 'Pedido eliminado.' : 'Pedido cancelado.')
      if (isAdmin) {
        navigate('/dashboard', { replace: true })
      } else {
        setOrder((prev) => prev ? { ...prev, status: 'archived' } : prev)
      }
    } catch (error) {
      notifyError(getUserFriendlyErrorMessage(error))
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <RequireUser user={user} loading={loading}>
      <div className="max-w-5xl mx-auto space-y-6 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg hover:shadow-xl transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="text-white">
            <p className="text-sm font-semibold text-white/80">Detalle del pedido</p>
          <h1 className="text-3xl sm:text-4xl font-black drop-shadow">
              Pedido #{orderId ? String(orderId).slice(-8) : '-'}
            </h1>
          </div>
        </div>

        {localLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}

        {!localLoading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 sm:px-5 text-red-800">
            <div className="space-y-2">
              <p className="text-lg font-bold">No se pudo cargar el pedido</p>
              <p className="text-sm font-semibold">{error}</p>
            </div>
          </div>
        )}

        {!localLoading && !error && order && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-gray-900">Resumen del pedido</h2>
                  <p className="text-sm text-gray-600 font-semibold">Empresa</p>
                  <p className="text-base sm:text-lg text-gray-900 font-bold">
                    {company?.name || 'No definida'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {serviceIcon}
                    {serviceLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    <Package className="h-4 w-4" />
                    {order.total_items || items.length || 0} item(s)
                  </span>
                  {isExtra && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-800">
                      Extra
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600 font-semibold">Fecha del pedido</p>
                    <p className="text-gray-900 font-bold">{formatDate(order.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-semibold">Estado</p>
                    <p className="text-gray-900 font-bold">{statusInfo.label}</p>
                  </div>
                  {isExtra && (
                    <div title={adminCreator.email || undefined}>
                      <p className="text-gray-600 font-semibold">Solicitado por</p>
                      <p className="text-gray-900 font-bold">{adminCreator.name}</p>
                      {adminCreator.email && (
                        <p className="text-xs text-gray-500 font-semibold truncate">{adminCreator.email}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Edición del pedido</h3>
                  <p className="text-sm text-gray-600 font-semibold">Edita o cancela dentro del tiempo permitido.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleEditOrder}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                      canModifyPendingOrder
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-300 border-emerald-100 cursor-not-allowed'
                    }`}
                    disabled={!canModifyPendingOrder}
                  >
                    <Edit className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteOrder}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                      canModifyPendingOrder && !deleteSubmitting
                        ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                        : 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed'
                    }`}
                    disabled={!canModifyPendingOrder || deleteSubmitting}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteSubmitting ? (isAdmin ? 'Eliminando...' : 'Cancelando...') : (isAdmin ? 'Eliminar' : 'Cancelar pedido')}
                  </button>
                  <button
                    type="button"
                    onClick={handleRepeatOrder}
                    className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Repetir pedido
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary-600" />
                  <h3 className="text-xl font-black text-gray-900">Destino y fechas</h3>
                </div>
                <div className="space-y-3 text-sm sm:text-base">
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-gray-600 font-semibold">Locación solicitante</p>
                      <p className="text-gray-900 font-bold">{order.location || company?.name || 'No definida'}</p>
                      {order.delivery_location && (
                        <>
                          <p className="text-gray-600 font-semibold mt-2">Lugar de entrega</p>
                          <p className="text-gray-900 font-bold">{order.delivery_location}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-gray-600 font-semibold">Fecha del pedido</p>
                      <p className="text-gray-900 font-bold">{formatDate(order.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-gray-600 font-semibold">Fecha de entrega</p>
                      <p className="text-gray-900 font-bold">{formatDateOnly(order.delivery_date)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5 space-y-4">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary-600" />
                  <h3 className="text-xl font-black text-gray-900">Datos del cliente</h3>
                </div>
                <div className="space-y-3 text-sm sm:text-base">
                  <div className="flex items-start gap-3">
                    <User className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-gray-600 font-semibold">Nombre</p>
                      <p className="text-gray-900 font-bold">{order.customer_name || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-gray-600 font-semibold">Email</p>
                      <p className="text-gray-900 font-bold">{order.customer_email || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-gray-600 font-semibold">Telefono</p>
                      <p className="text-gray-900 font-bold">{order.customer_phone || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5 space-y-4">
              <div className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-primary-600" />
                <h3 className="text-xl font-black text-gray-900">Platos del pedido</h3>
              </div>
              <div className="space-y-3">
                {items.length === 0 && (
                    <p className="text-sm text-gray-600">No hay platos registrados.</p>
                )}
                {items.map((item, index) => (
                  <div key={`${item.id || index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="text-sm sm:text-base font-semibold text-gray-900">
                      {item.name || 'Plato sin nombre'}
                    </div>
                    <div className="text-xs font-semibold text-gray-600 bg-slate-100 px-2.5 py-1 rounded-full">
                      x{item.quantity || 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary-600" />
                <h3 className="text-xl font-black text-gray-900">Extras y notas</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-2">Opciones adicionales</p>
                  {customResponses.length === 0 ? (
                    <p className="text-sm text-gray-600">Sin opciones adicionales.</p>
                  ) : (
                    <div className="space-y-3">
                      {customResponses.map((resp, index) => {
                        const rawValue = resp?.response ?? resp?.answer ?? resp?.options ?? resp?.value
                        const value = Array.isArray(rawValue)
                          ? rawValue.join(', ')
                          : typeof rawValue === 'string'
                            ? rawValue
                            : JSON.stringify(rawValue)
                        return (
                          <div key={`${resp?.id || index}`} className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                            <p className="text-sm font-bold text-gray-900">{resp?.title || 'Opcion'}</p>
                            <p className="text-sm text-gray-700 mt-1">{value || '-'}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-2">Notas del pedido</p>
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-gray-800">
                    {order.comments && order.comments.trim().length > 0 ? order.comments : 'Sin notas adicionales.'}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </RequireUser>
  )
}

export default OrderDetails
