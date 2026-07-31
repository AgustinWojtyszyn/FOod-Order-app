import { Building2, Trash2, UserPlus } from 'lucide-react'

const AdminCompaniesSection = ({
  companies,
  adminEmailDrafts,
  companiesLoading,
  onAdminEmailChange,
  onAssignCompanyAdmin,
  onRemoveCompanyAdmin
}) => (
  <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
    <div className="mb-4 sm:mb-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Empresas y notas de pedido</h2>
      <p className="mt-1 text-sm text-gray-600">
        La numeración arranca siempre en 0 y aumenta con los pedidos acumulados de cada empresa.
      </p>
    </div>

    {companiesLoading ? (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-700">
        Cargando empresas...
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-[900px] divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Empresa</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Inicio fijo</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Acumulado actual</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Notas generadas</th>
              <th className="px-3 py-3 text-left font-bold text-gray-700">Administradores de la empresa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {(companies || []).map((company) => {
              const issuedCount = Number(company.issued_count || 0)

              return (
                <tr key={company.slug}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-500" />
                      <span className="font-bold text-gray-900">{company.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{company.slug}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-700">
                    0
                  </td>
                  <td className="px-3 py-3 font-semibold text-gray-700">
                    {company.next_remito_number ?? 0}
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
