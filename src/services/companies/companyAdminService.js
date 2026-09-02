const normalizeSlug = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const DEFAULT_LABEL_SETTINGS = {
  showCompany: true,
  showLocation: true,
  showName: true,
  showMenu: true,
  showSide: true,
  showBeverage: true,
  showNotes: true
}

const DEFAULT_INTEGRATION_SETTINGS = {
  dailyReport: true,
  totalizer: true,
  excel: true,
  monthlyPanel: true,
  extraOrders: true
}

const DEFAULT_RULES = {
  beverages: { enabled: true, value: {} },
  sides: { enabled: true, value: {} },
  automaticSnack: { enabled: false, value: {} },
  extraOrders: { enabled: true, value: {} },
  customOptions: { enabled: true, value: {} },
  labelsReportsTotalizer: { enabled: true, value: {} }
}

const normalizeServices = (services = []) => {
  const byService = new Map((Array.isArray(services) ? services : []).map((row) => [row.service, row]))
  return ['lunch', 'dinner'].map((service) => ({
    service,
    enabled: byService.has(service) ? Boolean(byService.get(service)?.enabled) : service === 'lunch'
  }))
}

const normalizeLocations = (locations = []) =>
  (Array.isArray(locations) ? locations : []).map((location) => ({
    id: location.id || null,
    name: location.name || location.display_name || '',
    code: location.code || '',
    slug: normalizeSlug(location.slug || location.name || location.display_name || location.code),
    active: location.active !== false,
    deliveryName: location.deliveryName || location.delivery_name || location.name || location.display_name || '',
    scheduleMode: location.scheduleMode || location.schedule_mode || 'inherit',
    scheduleFlow: location.scheduleFlow || location.schedule_flow || ''
  }))

export const normalizeCompanyAdminConfig = (company = {}) => {
  const slug = normalizeSlug(company.slug || company.name)
  const remitoStartNumber = company.remitoStartNumber ?? company.remito_start_number ?? null
  const remitoEndNumber = company.remitoEndNumber ?? company.remito_end_number ?? null
  const nextRemitoNumber = company.nextRemitoNumber ?? company.next_remito_number ?? null
  return {
    id: company.id || null,
    slug,
    name: company.name || '',
    description: company.description || '',
    subtitle: company.subtitle || '',
    active: company.active !== false,
    visibility: company.visibility || (company.adminOnly ? 'admins' : 'public'),
    optionsSourceSlug: normalizeSlug(company.optionsSourceSlug || company.options_source_slug || slug),
    settings: {
      requiresAuthorizedLocations: Boolean(company.settings?.requiresAuthorizedLocations || company.requiresAuthorizedLocations)
    },
    labelSettings: { ...DEFAULT_LABEL_SETTINGS, ...(company.labelSettings || company.label_settings || {}) },
    integrationSettings: { ...DEFAULT_INTEGRATION_SETTINGS, ...(company.integrationSettings || company.integration_settings || {}) },
    services: normalizeServices(company.services),
    schedule: {
      mode: company.schedule?.mode || 'standard',
      opensAt: company.schedule?.opens_at || company.schedule?.opensAt || '06:00',
      closesAt: company.schedule?.closes_at || company.schedule?.closesAt || '14:00',
      timezone: company.schedule?.timezone || 'America/Argentina/San_Juan',
      perLocation: Boolean(company.schedule?.per_location || company.schedule?.perLocation)
    },
    locations: normalizeLocations(company.locations),
    rules: { ...DEFAULT_RULES, ...(company.rules || {}) },
    menuItems: Array.isArray(company.menuItems || company.menu_items) ? (company.menuItems || company.menu_items) : [],
    remitos: {
      enabled: remitoStartNumber != null || nextRemitoNumber != null,
      startNumber: remitoStartNumber ?? '',
      endNumber: remitoEndNumber ?? '',
      nextNumber: nextRemitoNumber ?? ''
    },
    issuedCount: Number(company.issuedCount ?? company.issued_count ?? 0),
    lastRemitoNumber: company.lastRemitoNumber ?? company.last_remito_number ?? null,
    admins: Array.isArray(company.admins) ? company.admins : []
  }
}

export const createBlankCompanyConfig = () => normalizeCompanyAdminConfig({
  active: true,
  visibility: 'admins',
  services: [{ service: 'lunch', enabled: true }, { service: 'dinner', enabled: false }],
  locations: [],
  schedule: { mode: 'standard', opensAt: '06:00', closesAt: '14:00', perLocation: false }
})

export const createCompanyAdminService = ({
  supabase,
  invalidateCache = () => {}
} = {}) => {
  if (!supabase) {
    throw new Error('createCompanyAdminService requires a supabase client')
  }

  const getCompanyAdminCatalog = async () => {
    const { data, error } = await supabase.rpc('get_company_admin_catalog')
    return {
      data: (Array.isArray(data) ? data : []).map(normalizeCompanyAdminConfig),
      error
    }
  }

  const getPublicCompanyCatalog = async () => {
    const { data, error } = await supabase.rpc('get_public_company_catalog')
    return {
      data: (Array.isArray(data) ? data : []).map(normalizeCompanyAdminConfig),
      error
    }
  }

  const validateCompanyAdminConfig = async ({ company, publish = false }) => {
    const { data, error } = await supabase.rpc('validate_company_admin_payload', {
      p_company: normalizeCompanyAdminConfig(company),
      p_publish: publish
    })
    return { data, error }
  }

  const saveCompanyAdminConfig = async ({ company, publish = false }) => {
    invalidateCache()
    const { data, error } = await supabase.rpc('save_company_admin_config', {
      p_company: normalizeCompanyAdminConfig(company),
      p_publish: publish
    })
    return { data, error }
  }

  const duplicateCompanyAdminConfig = async ({ sourceSlug, name, slug = null }) => {
    invalidateCache()
    const { data, error } = await supabase.rpc('duplicate_company_admin_config', {
      p_source_slug: sourceSlug,
      p_new_name: name,
      p_new_slug: slug || normalizeSlug(name)
    })
    return { data, error }
  }

  return {
    getCompanyAdminCatalog,
    getPublicCompanyCatalog,
    validateCompanyAdminConfig,
    saveCompanyAdminConfig,
    duplicateCompanyAdminConfig
  }
}

export { normalizeSlug as normalizeCompanyAdminSlug }
