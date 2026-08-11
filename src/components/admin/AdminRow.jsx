import { Fragment } from 'react'
import { Trash2, X } from 'lucide-react'
import { ROLE_OPTIONS, getRoleDisplay } from '../../utils/admin/adminConstants'
import { formatShortDate } from '../../utils/admin/adminFormatters'

const AdminRow = ({
  user,
  variant,
  isExpanded,
  onTogglePerson,
  onRoleChange,
  onDeleteUser,
  isRoleUpdating,
  isDeleting,
  roleUpdatingById,
  deletingById
}) => {
  const personKey = user.person_id || user.id
  const accounts = Array.isArray(user.accounts) ? user.accounts : []
  const hasMultipleAccounts = (user.members_count || 0) > 1 || user.is_grouped || accounts.length > 1
  const isBusy = !!isRoleUpdating || !!isDeleting
  const userRoleDisplay = getRoleDisplay(user.role || 'user')

  if (variant === 'mobile') {
    return (
      <div key={personKey} className="border-2 border-gray-200 rounded-xl p-3 bg-white hover:border-primary-300 transition-all">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base text-gray-900 truncate">
              {user.full_name || user.email || 'Sin nombre'}
            </h3>
            <p className="text-sm text-gray-600 truncate mt-1">
              {user.email}
              {Array.isArray(user.emails) && user.emails.length > 1 ? ` (+${user.emails.length - 1})` : ''}
            </p>
          </div>
          <span className={`ml-2 shrink-0 inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${userRoleDisplay.className}`}>
            {userRoleDisplay.label}
          </span>
        </div>
        {user.is_grouped && user.members_count > 1 && (
          <div className="mb-3">
            <span className="inline-flex px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
              {user.members_count} cuentas vinculadas
            </span>
          </div>
        )}

        <div className="text-xs text-gray-500 mb-3">
          Registrado: {formatShortDate(user.created_at)}
        </div>

        <div className="flex gap-2 pt-3 border-t border-gray-200">
          <div className="flex-1">
            <label htmlFor={`mobile-role-${user.person_id || user.id}`} className="block text-xs font-bold text-gray-700 mb-1">Cambiar Rol</label>
            <select
              id={`mobile-role-${user.person_id || user.id}`}
              name={`mobile-role-${user.person_id || user.id}`}
              value={user.role || 'user'}
              onChange={(e) => onRoleChange(user.primary_user_id, e.target.value)}
              disabled={user.is_grouped || !user.primary_user_id || isBusy}
              className="w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900 font-medium"
            >
              {ROLE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => onDeleteUser(user.primary_user_id, user.full_name || user.email)}
              disabled={user.is_grouped || !user.primary_user_id || isBusy}
              className="px-4 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors font-semibold text-sm flex items-center gap-1"
              title="Eliminar usuario"
            >
              <Trash2 className="h-4 w-4" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>

        {hasMultipleAccounts && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onTogglePerson(personKey)}
              className="w-full py-2 px-3 rounded-lg border-2 border-blue-600 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              {isExpanded ? (
                <>
                  <X className="h-4 w-4" />
                  Cerrar
                </>
              ) : (
                'Ver detalle'
              )}
            </button>
          </div>
        )}

        {isExpanded && (
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="text-xs font-bold text-gray-700 mb-2">Cuentas asociadas</div>
            {accounts.length === 0 ? (
              <div className="text-xs text-gray-500">
                No se encontraron cuentas vinculadas. Intenta recargar el panel.
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div key={account.id || account.email} className="border border-gray-200 rounded-lg p-2 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">
                          {account.full_name || account.email || 'Sin nombre'}
                        </div>
                        <div className="text-xs text-gray-600 truncate">{account.email || '—'}</div>
                        <div className="text-xs text-gray-500">
                          Registrado: {formatShortDate(account.created_at)}
                        </div>
                      </div>
                    {(() => {
                      const accountRoleDisplay = getRoleDisplay(account.role || 'user')
                      return (
                      <span className={`shrink-0 inline-flex px-2 py-1 text-[11px] font-bold rounded-full ${
                        accountRoleDisplay.className
                      }`}>
                        {accountRoleDisplay.label}
                      </span>
                      )
                    })()}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <select
                        value={account.role || 'user'}
                        onChange={(e) => onRoleChange(account.id, e.target.value)}
                        disabled={!account.id || roleUpdatingById?.[account.id] || deletingById?.[account.id]}
                        className="flex-1 text-xs border-2 border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900 font-medium"
                      >
                        {ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onDeleteUser(account.id, account.full_name || account.email)}
                        disabled={!account.id || roleUpdatingById?.[account.id] || deletingById?.[account.id]}
                        className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors font-semibold text-xs"
                        title="Eliminar cuenta"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="text-base font-bold text-gray-900">
            {user.full_name || user.email || 'Sin nombre'}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="text-base text-gray-900">
            {user.email}
            {Array.isArray(user.emails) && user.emails.length > 1 ? ` (+${user.emails.length - 1})` : ''}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-3 py-1 text-sm font-bold rounded-full ${userRoleDisplay.className}`}>
              {userRoleDisplay.label}
            </span>
            {user.is_grouped && user.members_count > 1 && (
              <span className="inline-flex px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
                {user.members_count} cuentas
              </span>
            )}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {formatShortDate(user.created_at)}
        </td>
        <td className="px-6 py-4 text-sm font-medium align-top">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`table-role-${user.person_id || user.id}`} className="sr-only">Cambiar rol para {user.full_name || user.email || 'usuario'}</label>
            <select
              id={`table-role-${user.person_id || user.id}`}
              name={`table-role-${user.person_id || user.id}`}
              value={user.role || 'user'}
              onChange={(e) => onRoleChange(user.primary_user_id, e.target.value)}
              disabled={user.is_grouped || !user.primary_user_id || isBusy}
              className="text-base border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900 font-medium min-w-[120px] shrink-0"
            >
              {ROLE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => onDeleteUser(user.primary_user_id, user.full_name || user.email)}
              disabled={user.is_grouped || !user.primary_user_id || isBusy}
              className="p-2.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors shrink-0"
              title="Eliminar usuario"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {hasMultipleAccounts && (
              <button
                type="button"
                onClick={() => onTogglePerson(personKey)}
                className="px-3 py-2 rounded-lg border-2 border-blue-600 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0"
              >
                {isExpanded ? (
                  <>
                    <X className="h-4 w-4" />
                    Cerrar
                  </>
                ) : (
                  'Ver detalle'
                )}
              </button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-6 py-4">
            <div className="text-sm font-bold text-gray-700 mb-3">Cuentas asociadas</div>
            {accounts.length === 0 ? (
              <div className="text-sm text-gray-500">
                No se encontraron cuentas vinculadas. Intenta recargar el panel.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {accounts.map((account) => (
                  <div key={account.id || account.email} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">
                          {account.full_name || account.email || 'Sin nombre'}
                        </div>
                        <div className="text-xs text-gray-600 truncate">{account.email || '—'}</div>
                        <div className="text-xs text-gray-500">
                          Registrado: {formatShortDate(account.created_at)}
                        </div>
                      </div>
                      {(() => {
                        const accountRoleDisplay = getRoleDisplay(account.role || 'user')
                        return (
                      <span className={`shrink-0 inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${
                        accountRoleDisplay.className
                      }`}>
                        {accountRoleDisplay.label}
                      </span>
                        )
                      })()}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={account.role || 'user'}
                        onChange={(e) => onRoleChange(account.id, e.target.value)}
                        disabled={!account.id || roleUpdatingById?.[account.id] || deletingById?.[account.id]}
                        className="text-sm border-2 border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900 font-medium min-w-[120px]"
                      >
                        {ROLE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onDeleteUser(account.id, account.full_name || account.email)}
                        disabled={!account.id || roleUpdatingById?.[account.id] || deletingById?.[account.id]}
                        className="px-3 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition-colors font-semibold text-sm"
                        title="Eliminar cuenta"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

export default AdminRow
