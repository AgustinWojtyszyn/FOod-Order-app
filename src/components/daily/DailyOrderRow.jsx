import { User } from 'lucide-react'
import {
  buildOrderPreview,
  getBeverageLabel,
  getDessertLabel,
  getOperationalOrderUnits,
  summarizeOrderItems
} from '../../utils/daily/dailyOrderCalculations'
import { getSideSummaryForOrder } from '../../utils/daily/dailyOrderSideAssociations'
import {
  formatTime,
  getLocationBadgeColor,
  getStatusColor,
  getStatusText
} from '../../utils/daily/dailyOrderFormatters'
import { isAdminExtraOrder, resolveAdminExtraCreator } from '../../utils/daily/adminExtraOrders'

const DailyOrderRow = ({
  order,
  index,
  variant = 'table',
  onArchiveOrder,
  onDeleteExtraOrder,
  onViewOrder
}) => {
  const deliveryLocation = order.delivery_location || order.location
  const deliveryDiffers = deliveryLocation && deliveryLocation !== order.location
  const isExtra = isAdminExtraOrder(order)
  const adminCreator = resolveAdminExtraCreator(order)
  const displayName = isExtra ? adminCreator.label : order.user_name
  const displayEmail = isExtra ? adminCreator.email : order.user_email
  const menuTotal = getOperationalOrderUnits(order)

  if (variant === 'card') {
    const summary = summarizeOrderItems(order.items)
    const customSide = getSideSummaryForOrder(order).summaryText
    const preview = buildOrderPreview(order)

    return (
      <div
        className={`relative rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/40 flex flex-col gap-3 ${
          order.status === 'archived' ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-amber-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-900 truncate" title={isExtra ? adminCreator.label : undefined}>
              {displayName}
            </p>
            {displayEmail && (
              <p className="text-xs text-slate-500 truncate" title={displayEmail}>
                {displayEmail}
              </p>
            )}
          </div>
          {isExtra && (
            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-800">
              Extra
            </span>
          )}
          <p className="text-xs font-mono font-semibold text-slate-700 ml-2">
            {formatTime(order.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${getLocationBadgeColor(order.location)}`}
          >
            {order.location}
          </span>
          {deliveryDiffers && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
              Entrega: {deliveryLocation}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
              (order.service || 'lunch') === 'dinner'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-sky-100 text-sky-800 border-sky-200'
            }`}
          >
            {(order.service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo'}
          </span>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(order.status)}`}
          >
            {getStatusText(order.status)}
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-900 ml-auto">
            {menuTotal} menús
          </span>
          <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-100/70 px-3 py-1 text-xs font-bold text-blue-900">
            {getBeverageLabel(order)}
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100/70 px-3 py-1 text-xs font-bold text-emerald-900">
            {getDessertLabel(order)}
          </span>
        </div>

        <div className="text-sm text-slate-800 space-y-1" title={summary.title}>
          {summary.principalCount > 0 && (
            <div className="font-semibold text-slate-900">
              Plato Principal: {summary.principalCount}
            </div>
          )}
          {summary.others.map((o, idx) => (
            <div key={idx} className="wrap-break-word">
              {o.name} (x{o.qty})
            </div>
          ))}
          {summary.remaining > 0 && (
            <div className="text-xs font-semibold text-slate-500">
              +{summary.remaining} más...
            </div>
          )}
          {customSide && (
            <div className="text-xs italic font-semibold mt-1 text-slate-600">
              Guarnición: {customSide}
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-700 space-y-1">
            <div className="font-semibold text-slate-900">Vista previa (exportable):</div>
            <div><span className="font-semibold">Menú:</span> {preview.itemsText}</div>
            <div><span className="font-semibold">Opciones:</span> {preview.optionsText}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {order.status === 'pending' && onArchiveOrder ? (
            <button
              className="text-xs font-semibold text-primary-700 hover:text-primary-900"
              onClick={() => onArchiveOrder(order)}
            >
              Archivar pedido
            </button>
          ) : (
            <span className="text-xs text-slate-400">Archivado</span>
          )}
          <button
            className="text-sm font-semibold text-primary-700 hover:text-primary-900"
            onClick={() => onViewOrder(order.id)}
          >
            Ver pedido
          </button>
          {isExtra && onDeleteExtraOrder && (
            <button
              className="text-xs font-bold text-red-700 hover:text-red-900"
              onClick={() => onDeleteExtraOrder(order)}
            >
              Eliminar pedido extra
            </button>
          )}
        </div>
      </div>
    )
  }

  const summary = summarizeOrderItems(order.items)
  const customSide = getSideSummaryForOrder(order).summaryText

  return (
    <tr
      className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'} hover:bg-slate-100`}
    >
      <td className="border-b border-slate-200/70 px-4 py-5 xl:pl-11">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h5 className="text-base font-extrabold text-slate-900 tracking-wide" title={isExtra ? adminCreator.label : undefined}>
              {displayName}
            </h5>
            {displayEmail && (
              <p className="text-xs text-slate-500" title={displayEmail}>
                {displayEmail}
              </p>
            )}
            {isExtra && (
              <span className="mt-1 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-black text-violet-800">
                Extra
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold border ${getLocationBadgeColor(order.location)}`}
          title={`Ubicación: ${order.location}`}>
          {order.location}
        </span>
        {deliveryDiffers && (
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800"
            title={`Entrega en: ${deliveryLocation}`}>
            Entrega: {deliveryLocation}
          </span>
        )}
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-extrabold text-slate-900">
          {menuTotal}
        </span>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <div className="max-w-[360px]">
          <div className="space-y-1" title={summary.title}>
            {summary.principalCount > 0 && (
              <div className="text-sm font-bold text-slate-900">
                Plato Principal: {summary.principalCount}
              </div>
            )}
            {summary.others.map((o, idx) => (
              <div key={idx} className="text-sm text-slate-700 wrap-break-word">
                {o.name} (x{o.qty})
              </div>
            ))}
            {summary.remaining > 0 && (
              <div className="text-xs text-slate-500 font-semibold">
                +{summary.remaining} más...
              </div>
            )}
            {customSide && (
              <div className="text-xs italic text-slate-600 mt-2 font-semibold">
                Guarnición: {customSide}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-100/70 px-3 py-1 text-xs font-bold text-blue-900 max-w-[200px] truncate">
            {getBeverageLabel(order)}
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100/70 px-3 py-1 text-xs font-bold text-emerald-900 max-w-[200px] truncate">
            {getDessertLabel(order)}
          </span>
        </div>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
          (order.service || 'lunch') === 'dinner'
            ? 'bg-amber-100 text-amber-800 border-amber-200'
            : 'bg-sky-100 text-sky-800 border-sky-200'
        }`}>
          {(order.service || 'lunch') === 'dinner' ? 'Cena' : 'Almuerzo'}
        </span>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <p className="text-sm font-mono font-bold text-slate-900">
          {formatTime(order.created_at)}
        </p>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(order.status)}`}>
          {getStatusText(order.status)}
        </span>
      </td>
      <td className="border-b border-slate-200/70 px-4 py-5">
        <div className="flex flex-col gap-2">
          {order.status === 'pending' && onArchiveOrder ? (
            <button
              onClick={() => onArchiveOrder(order)}
              className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100"
            >
              Archivar
            </button>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
          {isExtra && onDeleteExtraOrder && (
            <button
              onClick={() => onDeleteExtraOrder(order)}
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
            >
              Eliminar pedido extra
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default DailyOrderRow
