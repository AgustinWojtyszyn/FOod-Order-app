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
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-sm font-bold text-white shadow-md">
            <ShieldCheck className="h-4 w-4" />
            Elegí tu empresa antes de crear el pedido
          </div>
          <h1 className="text-3xl font-black text-white drop-shadow-xl sm:text-4xl">
            ¿Para qué empresa vas a pedir hoy?
          </h1>
          <p className="mx-auto max-w-2xl text-sm font-semibold text-white/85 sm:text-base">
            Seleccioná la empresa correcta para continuar con su flujo de pedido.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedCompanies.map((company) => {
            const hasUsefulSubtitle = company.subtitle && company.subtitle !== 'Flujo dedicado'
            const locationLabel = company.requiresAuthorizedLocations
              ? 'Locaciones autorizadas'
              : company.locations.join(' • ')

            return (
              <button
                key={company.slug}
                type="button"
                onClick={() => handleSelect(company.slug)}
                className="group relative min-h-44 overflow-hidden rounded-2xl border border-white/40 bg-white/95 p-5 text-left shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white/80 focus:ring-offset-2 focus:ring-offset-blue-700"
              >
                <div className={`absolute inset-0 bg-linear-to-br ${company.accent} opacity-[0.07] transition-opacity group-hover:opacity-15`} />

                <div className="relative z-10 flex h-full flex-col">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <Building2 className="h-6 w-6 text-slate-800" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex max-w-full rounded-full border border-white px-3 py-1 text-base font-black ${company.badgeClass}`}>
                          <span className="truncate">{company.name}</span>
                        </span>
                        {company.slug === recommendedCompany && (
                          <span className="inline-flex rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-black text-white">
                            Última usada
                          </span>
                        )}
                      </div>

                      {hasUsefulSubtitle && (
                        <p className="mt-1 text-sm font-bold text-slate-700">
                          {company.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {company.description && (
                    <p className="mt-4 line-clamp-2 text-sm font-semibold leading-relaxed text-slate-700">
                      {company.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                    <p className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wide text-slate-500" title={locationLabel}>
                      {locationLabel}
                    </p>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0b1f3a] px-3 py-1.5 text-xs font-black text-white shadow-sm transition-colors group-hover:bg-slate-800">
                      Continuar
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </RequireUser>
  )
}

export default OrderCompanySelector
