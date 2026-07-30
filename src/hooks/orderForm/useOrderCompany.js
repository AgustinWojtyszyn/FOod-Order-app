import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { COMPANY_CATALOG, COMPANY_LIST } from '../../constants/companyConfig'
import { useAuthContext } from '../../contexts/authContextValue'
import { db } from '../../supabaseClient'
import { hasGenneiaOptionRules } from '../../utils/order/companySpecialRules'

export const useOrderCompany = () => {
  const { companySlug: companySlugParam } = useParams()
  const [searchParams] = useSearchParams()
  const { isAdmin } = useAuthContext()
  const [activeCompanySlug, setActiveCompanySlug] = useState('')
  const [authorizedLocationRows, setAuthorizedLocationRows] = useState([])
  const [authorizedLocationsLoading, setAuthorizedLocationsLoading] = useState(false)
  const [authorizedLocationsError, setAuthorizedLocationsError] = useState(null)

  const recommendedCompany = typeof window !== 'undefined'
    ? window.localStorage.getItem('lastCompany')
    : null

  const fallbackCompanySlug = COMPANY_LIST[0]?.slug || 'laja'
  const defaultCompanyCandidate = activeCompanySlug || recommendedCompany || fallbackCompanySlug
  const defaultCompanySlug = (!COMPANY_CATALOG[defaultCompanyCandidate]?.adminOnly || isAdmin)
    ? defaultCompanyCandidate
    : fallbackCompanySlug
  const rawCompanySlug = (companySlugParam || searchParams.get('company') || defaultCompanySlug || '')
    .trim()
    .toLowerCase()

  const requestedCompany = COMPANY_CATALOG[rawCompanySlug]
  const requestedCompanyAllowed = requestedCompany && (!requestedCompany.adminOnly || isAdmin)
  const companyConfig = requestedCompanyAllowed
    ? requestedCompany
    : COMPANY_CATALOG[defaultCompanySlug]
  const companyOptionsSlug = (companyConfig?.optionsSourceSlug || companyConfig?.slug || rawCompanySlug || '')
    .trim()
    .toLowerCase()

  const isGenneia = (companyConfig?.slug || rawCompanySlug || '').toLowerCase() === 'genneia'
  const hasGenneiaRules = hasGenneiaOptionRules(companyConfig || rawCompanySlug)

  const requiresAuthorizedLocations = Boolean(companyConfig?.requiresAuthorizedLocations)

  const locations = useMemo(() => {
    if (requiresAuthorizedLocations) {
      return authorizedLocationRows.map((row) => row.name).filter(Boolean)
    }
    return companyConfig?.locations || COMPANY_LIST[0]?.locations || []
  }, [authorizedLocationRows, companyConfig, requiresAuthorizedLocations])

  const deliveryLocationsByLocation = useMemo(() => {
    const map = new Map()
    authorizedLocationRows.forEach((row) => {
      if (!row?.name) return
      map.set(row.name, row.delivery_name || row.name)
    })
    locations.forEach((location) => {
      if (!map.has(location)) map.set(location, location)
    })
    return map
  }, [authorizedLocationRows, locations])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { data, error } = await db.getUserCompanySwitchContext()
      if (!mounted || error) return
      const slug = (data?.current_company_slug || '').toString().trim().toLowerCase()
      if (slug) setActiveCompanySlug(slug)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (companyConfig?.slug) {
        window.localStorage.setItem('lastCompany', companyConfig.slug)
      }
    } catch (_err) {
      // no-op: fallback sin persistencia
    }
  }, [companyConfig?.slug])

  useEffect(() => {
    let mounted = true
    const loadAuthorizedLocations = async () => {
      if (!requiresAuthorizedLocations) {
        setAuthorizedLocationRows([])
        setAuthorizedLocationsLoading(false)
        setAuthorizedLocationsError(null)
        return
      }
      setAuthorizedLocationsLoading(true)
      setAuthorizedLocationsError(null)
      const { data, error } = await db.getUserOrderLocations({ companySlug: companyConfig?.slug })
      if (!mounted) return
      if (error) {
        console.error('[EPSE locations] Error loading authorized locations from /rest/v1/rpc/get_user_order_locations', {
          companySlug: companyConfig?.slug,
          error
        })
        setAuthorizedLocationRows([])
        setAuthorizedLocationsError(error)
      } else {
        setAuthorizedLocationRows(Array.isArray(data) ? data : [])
        setAuthorizedLocationsError(null)
      }
      setAuthorizedLocationsLoading(false)
    }
    loadAuthorizedLocations()
    return () => {
      mounted = false
    }
  }, [companyConfig?.slug, requiresAuthorizedLocations])

  return {
    companySlugParam,
    defaultCompanySlug,
    rawCompanySlug,
    companyConfig,
    companyOptionsSlug,
    isGenneia,
    hasGenneiaRules,
    locations,
    authorizedLocationRows,
    authorizedLocationsLoading,
    authorizedLocationsError,
    requiresAuthorizedLocations,
    deliveryLocationsByLocation
  }
}
