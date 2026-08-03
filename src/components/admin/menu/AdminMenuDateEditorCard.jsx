import { Edit3, Plus, Save, Trash2, X } from 'lucide-react'
import LoadingState from '../../ui/LoadingState'
import { formatDateLabel } from '../../../utils/admin/adminMenuSectionFormatters'

const AdminMenuDateEditorCard = ({
  menuDate,
  editingMenu,
  savingMenu,
  loadingMenu,
  menuItems,
  draftItems,
  dinnerMenuEnabled,
  onToggleDinnerMenu,
  onEditMenu,
  onSaveMenu,
  onCancelMenu,
  onMenuItemChange,
  onAddMenuItem,
  onRemoveMenuItem,
  changeSummary,
  onPrimeSuccess
}) => {
  const dateLabel = formatDateLabel(menuDate)
  const dinnerToggleId = `dinner-menu-enabled-${menuDate}`
  const newCount = changeSummary?.newItems?.length || 0
  const modifiedCount = changeSummary?.modifiedItems?.length || 0
  const deletedCount = changeSummary?.deletedItems?.length || 0
  const hasChanges = Boolean(changeSummary?.hasChanges)

  return (
    <div className="border-2 border-gray-200 rounded-2xl bg-white p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Día seleccionado</p>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">{dateLabel}</h3>
          <p className="text-xs text-gray-500">{menuDate}</p>
        </div>
        <div className="sm:ml-auto flex flex-col sm:flex-row gap-2">
          {!editingMenu ? (
            <>
              <button
                type="button"
                onClick={() => onEditMenu(menuDate)}
                className="btn-primary flex items-center justify-center text-sm sm:text-base px-4 py-2.5"
              >
                <Edit3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Editar Menú
              </button>
              <button
                type="button"
                onClick={() => {
                  onEditMenu(menuDate)
                  onAddMenuItem(menuDate)
                }}
                className="btn-secondary flex items-center justify-center text-sm sm:text-base px-4 py-2.5"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Agregar plato
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onPointerDown={() => {
                  if (!savingMenu) onPrimeSuccess()
                }}
                onClick={() => onSaveMenu(menuDate)}
                disabled={savingMenu}
                className="btn-primary text-black flex items-center justify-center text-sm sm:text-base px-4 py-2.5"
              >
                <Save className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Guardar
              </button>
              <button
                type="button"
                onClick={() => onCancelMenu(menuDate)}
                className="btn-secondary flex items-center justify-center text-sm sm:text-base px-4 py-2.5"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {loadingMenu && (
        <div className="mb-4">
          <LoadingState variant="inline" message="Cargando menú..." tone="slate" />
        </div>
      )}

      {!editingMenu ? (
        menuItems.length === 0 ? (
          <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
            No hay platos cargados para este día.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {menuItems.map((item, index) => (
              <div key={item.id || index} className="border-2 border-gray-200 rounded-lg p-4 bg-white hover:border-primary-300 transition-colors">
                <h4 className="font-bold text-gray-900 mb-2 text-base">{item.name}</h4>
                {item.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 mb-4">
            <p className="text-blue-800 font-semibold text-center text-sm leading-relaxed">
              Podés agregar, editar o eliminar opciones del menú. Debe haber al menos un plato.
            </p>
            <div className="mt-3 flex items-center gap-2 justify-center">
              <input
                type="checkbox"
                id={dinnerToggleId}
                name={dinnerToggleId}
                checked={dinnerMenuEnabled}
                onChange={(e) => onToggleDinnerMenu(e.target.checked)}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor={dinnerToggleId} className="text-sm font-bold text-gray-900 cursor-pointer select-none">
                Habilitar este menú también para <span className="font-extrabold">cena</span> (solo whitelist)
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Cambios de esta fecha</p>
            {hasChanges ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 font-semibold border border-gray-200">
                  {newCount} nuevo{newCount === 1 ? '' : 's'}
                </span>
                <span className="rounded-full bg-white px-3 py-1 font-semibold border border-gray-200">
                  {modifiedCount} modificado{modifiedCount === 1 ? '' : 's'}
                </span>
                <span className="rounded-full bg-white px-3 py-1 font-semibold border border-gray-200">
                  {deletedCount} eliminado{deletedCount === 1 ? '' : 's'} explícito{deletedCount === 1 ? '' : 's'}
                </span>
              </div>
            ) : (
              <p className="mt-1 font-semibold text-gray-600">Sin cambios</p>
            )}
          </div>

          {draftItems.map((item, index) => {
            const nameId = `menu-item-name-${menuDate}-${index}`
            const descId = `menu-item-description-${menuDate}-${index}`
            return (
              <div key={index} className="border-2 border-gray-200 rounded-xl bg-white p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveMenuItem(menuDate, index)}
                    className="ml-auto p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                    title="Eliminar plato"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <label htmlFor={nameId} className="text-sm font-semibold text-gray-700">Título del menú</label>
                  <input
                    id={nameId}
                    name={nameId}
                    type="text"
                    placeholder="Ej: Menú principal u Opción 1"
                    value={item.name}
                    onChange={(e) => onMenuItemChange(menuDate, index, 'name', e.target.value)}
                    className="input-field font-semibold text-base bg-white text-gray-900 w-full"
                    required
                  />
                  <label htmlFor={descId} className="text-sm font-semibold text-gray-700">Descripción del plato</label>
                  <input
                    id={descId}
                    name={descId}
                    type="text"
                    placeholder="Descripción (opcional)"
                    value={item.description}
                    onChange={(e) => onMenuItemChange(menuDate, index, 'description', e.target.value)}
                    className="input-field text-sm bg-white text-gray-900 w-full"
                  />
                </div>
              </div>
            )
          })}

          <button
            type="button"
            onClick={() => onAddMenuItem(menuDate)}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-all font-semibold text-sm shadow-sm"
          >
            <Plus className="h-5 w-5" />
            Agregar nuevo plato
          </button>
        </div>
      )}
    </div>
  )
}

export default AdminMenuDateEditorCard
