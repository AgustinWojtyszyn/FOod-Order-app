import { Package } from 'lucide-react'
import DailyOrderRow from './DailyOrderRow'
import { getStatusText } from '../../utils/daily/dailyOrderFormatters'

const DailyOrdersTable = ({
  sortedOrders,
  sortBy,
  selectedLocation,
  selectedStatus,
  onArchiveOrder,
  onViewOrder
}) => (
  <div className="rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 print-hide">
    <div className="border-b border-slate-200 px-6 py-4 sm:px-8 xl:px-9">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            Pedidos del día ({sortedOrders.length})
          </h3>
          <p className="text-sm font-semibold text-slate-600">
            Orden: {
              sortBy === 'recent' ? 'Más recientes' :
              sortBy === 'location' ? 'Empresa' :
              sortBy === 'hour' ? 'Hora ascendente' :
              'Estado'
            }
          </p>
        </div>
      </div>
    </div>

    {sortedOrders.length === 0 ? (
      <div className="px-4 py-12 text-center sm:px-6 xl:px-7.5">
        <Package className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          No hay pedidos que coincidan con los filtros
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {selectedLocation !== 'all' && `Ubicación: ${selectedLocation}`}
          {selectedLocation !== 'all' && selectedStatus !== 'all' && ' | '}
          {selectedStatus !== 'all' && `Estado: ${getStatusText(selectedStatus)}`}
        </p>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Intenta cambiar los filtros para ver más resultados
        </p>
      </div>
    ) : (
      <>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-slate-900 text-left border-b border-slate-800">
                <th className="min-w-[220px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100 xl:pl-11">
                  Cliente
                </th>
                <th className="min-w-40 px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Ubicación / entrega
                </th>
                <th className="min-w-[100px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Items
                </th>
                <th className="min-w-[220px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Platillos
                </th>
                <th className="min-w-[140px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Bebida
                </th>
                <th className="min-w-[110px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Turno
                </th>
                <th className="min-w-[110px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Hora
                </th>
                <th className="min-w-[120px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Estado
                </th>
                <th className="min-w-[120px] px-6 py-4 text-xs font-bold uppercase tracking-wide text-slate-100">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map((order, index) => (
                <DailyOrderRow
                  key={order.id}
                  order={order}
                  index={index}
                  onArchiveOrder={onArchiveOrder}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden px-4 pb-6 space-y-4">
          {sortedOrders.map(order => (
            <DailyOrderRow
              key={order.id}
              order={order}
              variant="card"
              onArchiveOrder={onArchiveOrder}
              onViewOrder={onViewOrder}
            />
          ))}
        </div>
      </>
    )}
  </div>
)

export default DailyOrdersTable
