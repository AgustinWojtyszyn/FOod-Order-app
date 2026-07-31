import { useMemo } from 'react'
import { Calendar, Minus, Save } from 'lucide-react'
import AdminMenuWeekDateCard from './menu/AdminMenuWeekDateCard'
import AdminMenuDateEditorCard from './menu/AdminMenuDateEditorCard'
import {
  formatMonthFull,
  getWeekDays,
  normalizeDate,
  toISODate
} from '../../utils/admin/adminMenuSectionFormatters'

const AdminMenuSection = ({
  visibleDates = [],
  selectedDates = [],
  loadedDates = [],
  manualSelectedDatesCount = 0,
  weekBaseDate,
  onWeekBaseDateChange,
  menuItemsByDate,
  draftMenuItemsByDate,
  editingMenuByDate,
  savingMenuByDate,
  loadingMenuByDate,
  dinnerMenuEnabled,
  onToggleDinnerMenu,
  onToggleDate,
  onSaveAllMenus,
  onEditMenu,
  onSaveMenu,
  onCancelMenu,
  onMenuItemChange,
  onAddMenuItem,
  onRemoveMenuItem,
  onPrimeSuccess,
  companyOptions = [],
  selectedCompanySlug = 'global',
  onCompanyChange
}) => {
  const orderedDates = useMemo(() => {
    const list = Array.isArray(visibleDates) ? [...visibleDates] : []
    return list.sort()
  }, [visibleDates])
  const selectedSet = useMemo(() => new Set(selectedDates || []), [selectedDates])
  const loadedSet = useMemo(() => new Set(loadedDates || []), [loadedDates])

  const startOfWeek = useMemo(
    () => normalizeDate(weekBaseDate) || normalizeDate(new Date()),
    [weekBaseDate]
  )
  const weekDays = useMemo(() => getWeekDays(startOfWeek), [startOfWeek])

  const selectedCount = orderedDates.length
  const loadedCount = orderedDates.filter((date) => (menuItemsByDate?.[date] || []).length > 0).length
  const isSavingAny = orderedDates.some((date) => Boolean(savingMenuByDate?.[date]))

  return (
    <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
      <div className="flex flex-col gap-4 mb-5 sm:mb-7">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.18em] text-primary-600 font-bold">Panel Admin</p>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900">Planificación semanal del menú</h2>
          <p className="text-sm sm:text-base text-gray-600">
            Seleccioná uno o varios días de entrega para cargar el menú. Cada día se edita y se guarda por separado.
          </p>
        </div>

        <div className="bg-secondary-50 border-2 border-secondary-300 text-black rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-base sm:text-lg font-black uppercase tracking-wide text-black">
            Los usuarios realizan su pedido el día anterior, por lo que este menú corresponde al día de entrega
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <label htmlFor="menu-company" className="block text-xs font-bold uppercase tracking-wide text-gray-600">
              Empresa del menú
            </label>
            <select
              id="menu-company"
              value={selectedCompanySlug}
              onChange={(event) => onCompanyChange?.(event.target.value)}
              className="mt-2 input-field w-full bg-white text-gray-900 sm:max-w-sm"
            >
              {companyOptions.map((company) => (
                <option key={company.slug} value={company.slug}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 bg-gray-900 text-white rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">Resumen de selección</p>
              <p className="text-lg sm:text-xl font-bold">
                {selectedCount} día{selectedCount === 1 ? '' : 's'} seleccionado{selectedCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="sm:ml-auto flex items-center gap-3 text-xs sm:text-sm">
              <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20">
                {loadedCount} con menú cargado
              </span>
              <span className="px-3 py-1 rounded-full bg-white/15 border border-white/20">
                {formatMonthFull(startOfWeek)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <label htmlFor="week-picker" className="sr-only">Cambiar inicio de entregas</label>
              <span className="uppercase tracking-wide">Inicio</span>
              <input
                id="week-picker"
                type="date"
                value={toISODate(weekBaseDate)}
                onChange={(e) => onWeekBaseDateChange?.(normalizeDate(e.target.value))}
                className="input-field text-[11px] bg-gray-50 text-gray-600 border border-gray-200/60 w-32 sm:w-36"
              />
            </div>
            {manualSelectedDatesCount === 0 ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                Mostrando menús cargados automáticamente
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Modo edición activa
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {weekDays.map((date) => {
            const dateISO = toISODate(date)
            return (
              <AdminMenuWeekDateCard
                key={dateISO}
                date={date}
                isSelected={selectedSet.has(dateISO)}
                hasMenu={loadedSet.has(dateISO)}
                onToggleDate={onToggleDate}
              />
            )
          })}
        </div>

        {orderedDates.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {orderedDates.map((date) => (
                <div key={date} className="flex items-center gap-2 bg-gray-100 text-gray-900 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <span>{date}</span>
                  <button
                    onClick={() => onToggleDate?.(date)}
                    className="p-1 rounded-full hover:bg-gray-200"
                    title="Quitar día"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onPointerDown={() => {
                  if (!isSavingAny && manualSelectedDatesCount > 0) onPrimeSuccess()
                }}
                onClick={onSaveAllMenus}
                disabled={manualSelectedDatesCount === 0 || isSavingAny}
                className="btn-primary text-black flex items-center justify-center text-sm sm:text-base px-4 py-2.5"
                type="button"
              >
                <Save className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Guardar todos
              </button>
            </div>
          </div>
        )}
      </div>

      {orderedDates.length === 0 && (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
          Seleccioná al menos un día para editar su menú.
        </div>
      )}

      <div className="space-y-6">
        {orderedDates.map((menuDate) => (
          <AdminMenuDateEditorCard
            key={menuDate}
            menuDate={menuDate}
            editingMenu={!!editingMenuByDate?.[menuDate]}
            savingMenu={!!savingMenuByDate?.[menuDate]}
            loadingMenu={!!loadingMenuByDate?.[menuDate]}
            menuItems={menuItemsByDate?.[menuDate] || []}
            draftItems={draftMenuItemsByDate?.[menuDate] || []}
            dinnerMenuEnabled={dinnerMenuEnabled}
            onToggleDinnerMenu={onToggleDinnerMenu}
            onEditMenu={onEditMenu}
            onSaveMenu={onSaveMenu}
            onCancelMenu={onCancelMenu}
            onMenuItemChange={onMenuItemChange}
            onAddMenuItem={onAddMenuItem}
            onRemoveMenuItem={onRemoveMenuItem}
            onPrimeSuccess={onPrimeSuccess}
          />
        ))}
      </div>
    </div>
  )
}

export default AdminMenuSection
