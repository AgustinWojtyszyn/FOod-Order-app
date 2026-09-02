import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, ShieldCheck } from 'lucide-react'
import RequireUser from './RequireUser'
import { getVisibleCompanyList } from '../constants/companyConfig'
import { useAuthContext } from '../contexts/authContextValue'
import { db } from '../supabaseClient'
import { normalizeCompanyAdminConfig } from '../services/companies/companyAdminService'

const OrderCompanySelector = ({ user, loading }) => {
  const navigate = useNavigate()
  const { isAdmin } = useAuthContext()
  const [activeCompanySlug, setActiveCompanySlug] = useState('')
  const [managedCompanies, setManagedCompanies] = useState([])

  const lastCompanySelected = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('lastCompanySelected') || ''
  }, [])

  const lastCompanyConfirmed = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem('lastCompanyConfirmed') || ''
  }, [])
  const recommendedCompany = activeCompanySlug || lastCompanySelected || lastCompanyConfirmed

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { data, error } = await db.getUserCompanySwitchContext()
      if (!mounted || error) return
      const slug = (data?.current_company_slug || '').toString().trim()
      if (slug) setActiveCompanySlug(slug)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadCatalog = async () => {
      const loader = isAdmin ? db.getCompanyAdminCatalog : db.getPublicCompanyCatalog
      if (!loader) return
      const { data, error } = await loader()
      if (!mounted || error || !Array.isArray(data) || data.length === 0) return
      setManagedCompanies(data.map(normalizeCompanyAdminConfig))
    }
    loadCatalog()
    return () => {
      mounted = false
    }
  }, [isAdmin])

  const orderedCompanies = useMemo(() => {
    const source = managedCompanies.length > 0
      ? managedCompanies.map((company) => ({
        ...company,
        adminOnly: company.visibility === 'admins',
        accent: company.active ? 'from-orange-500 to-orange-700' : 'from-gray-400 to-gray-600',
        badgeClass: company.visibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
        customHint: company.description || 'Flujo configurado desde Administración.',
        locations: company.locations.length > 0 ? company.locations.map((location) => location.name) : [company.name],
        requiresAuthorizedLocations: Boolean(company.settings?.requiresAuthorizedLocations)
      }))
      : getVisibleCompanyList({ includeAdminOnly: isAdmin })
    return source.filter((company) => company.active !== false && (isAdmin || !company.adminOnly)).sort((a, b) => {
      if (a.slug === recommendedCompany) return -1
      if (b.slug === recommendedCompany) return 1
      return 0
    })
  }, [isAdmin, managedCompanies, recommendedCompany])

  const handleSelect = (slug) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('lastCompanySelected', slug)
      }
    } catch (_err) {
      // no-op: fallback sin persistencia
    }
    navigate(`/order/${slug}`)
  }

  return (
    <RequireUser user={user} loading={loading}>
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 border-2 border-white/40 text-white font-semibold shadow-lg">
            <ShieldCheck className="h-5 w-5" />
            Elige tu empresa antes de crear el pedido
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white drop-shadow-2xl">
            ¿Para qué empresa vas a pedir hoy?
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto font-semibold drop-shadow">
            Cada empresa puede tener preguntas y configuraciones propias (ej. multiple choice). Selecciona la correcta y te llevamos a su flujo dedicado.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {orderedCompanies.map((company) => (
            <button
              key={company.slug}
              onClick={() => handleSelect(company.slug)}
              className="relative group text-left bg-white/95 border-2 border-white/30 rounded-3xl shadow-2xl hover:shadow-3xl overflow-hidden transition-all duration-200 hover:-translate-y-1.5 p-2 sm:p-3"
            >
              <div className={`absolute inset-0 bg-linear-to-br ${company.accent} opacity-10 group-hover:opacity-25 transition-opacity`} />
              <div className="p-6 sm:p-8 flex flex-col gap-5 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="p-5 rounded-2xl bg-white shadow-inner border-2 border-gray-100">
                    <Building2 className="h-9 w-9 text-gray-800" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`inline-flex px-4 py-2.5 rounded-full text-xl font-black ${company.badgeClass} border border-white`}>
                        {company.name}
                      </p>
                      {company.slug === recommendedCompany && (
                        <span className="inline-flex px-3 py-1 text-xs font-bold rounded-full bg-emerald-600 text-white">
                          Última usada
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-semibold text-gray-800 mt-1">
                      {company.subtitle || 'Flujo dedicado'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-lg sm:text-xl text-gray-900 font-bold leading-snug">
                    {company.description}
                  </p>
                  <p className="text-sm sm:text-base text-gray-700">
                    {company.customHint}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    {company.requiresAuthorizedLocations ? 'Locaciones autorizadas' : company.locations.join(' • ')}
                  </div>
                  <div className="inline-flex items-center gap-2 bg-[#0b1f3a] text-white font-bold text-base px-3 py-1.5 rounded-full shadow-md">
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

      </div>
    </RequireUser>
  )
}

export default OrderCompanySelector
