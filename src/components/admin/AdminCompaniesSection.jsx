import { AlertTriangle, Building2, Save, Trash2, UserPlus } from 'lucide-react'

const AdminCompaniesSection = ({
  companies,
  draftStartNumbers,
  adminEmailDrafts,
  companiesLoading,
  savingCompanySlug,
  onCompanyStartNumberChange,
  onSaveCompanyStartNumber,
  onAdminEmailChange,
  onAssignCompanyAdmin,
  onRemoveCompanyAdmin
}) => (
  <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
    <div className="mb-4 sm:mb-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Empresas y remitos</h2>
      <p className="mt-1 text-sm text-gray-600">
        Configurá el número inicial de remito antes de emitir el primero para cada empresa.
      </p>
    </div>

    {companiesLoading ? (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-700">
        Cargando empresas...
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-[980px] divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Empresa</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Número inicial de remito</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Próximo número</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Emitidos</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Administradores de la empresa</th>
              <th className="px-3 py-3 text-right font-bold text-gray-700">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {(companies || []).map((company) => {
              const issuedCount = Number(company.issued_count || 0)
              const saving = savingCompanySlug === company.slug
              const currentValue = company.remito_start_number == null ? '' : String(company.remito_start_number)
              const draftValue = draftStartNumbers?.[company.slug] ?? currentValue
              const changed = draftValue !== currentValue
              const blockedChange = issuedCount > 0 && changed

              return (
                <tr key={company.slug}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-500" />
                      <span className="font-bold text-gray-900">{company.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{company.slug}</p>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draftValue}
                      onChange={(event) => onCompanyStartNumberChange(company.slug, event.target.value)}
                      className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                      placeholder="Ej: 10000"
                    />
                    {blockedChange && (
                      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Ya existen remitos emitidos. No se puede modificar libremente.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-700">
                    {company.next_remito_number ?? '-'}
                  </td>
                  <td className="px-3 py-3 text-gray-700">
                    <span className="font-semibold">{issuedCount}</span>
                    {company.last_remito_number != null && (
                      <span className="ml-2 text-xs text-gray-500">Último: {company.last_remito_number}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-2">
                      {(company.admins || []).length === 0 ? (
                        <p className="text-xs font-semibold text-gray-500">Sin administradores asignados</p>
                      ) : (
                        <div className="space-y-1">
                          {company.admins.map((admin) => (
                            <div key={admin.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-gray-900">{admin.email}</p>
                                {admin.full_name && (
                                  <p className="truncate text-[11px] text-gray-500">{admin.full_name}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onRemoveCompanyAdmin({ companySlug: company.slug, userId: admin.user_id, email: admin.email })}
                                className="rounded-md p-1.5 text-red-600 hover:bg-red-100"
                                title="Quitar administrador"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={adminEmailDrafts?.[company.slug] || ''}
                          onChange={(event) => onAdminEmailChange(company.slug, event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                          placeholder="correo@empresa.com"
                        />
                        <button
                          type="button"
                          onClick={() => onAssignCompanyAdmin(company.slug)}
                          className="inline-flex items-center justify-center rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100"
                          title="Agregar administrador"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSaveCompanyStartNumber(company.slug)}
                      disabled={saving || !changed || blockedChange}
                      className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
)

export default AdminCompaniesSection
