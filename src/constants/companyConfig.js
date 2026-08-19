export const COMPANY_CATALOG = {
  ccp: {
    slug: 'ccp',
    name: 'Ccp',
    description: 'Flujo dedicado para equipos que operan en Ccp.',
    subtitle: 'Calidra',
    accent: 'from-cyan-500 to-cyan-700',
    badgeClass: 'bg-cyan-100 text-cyan-700',
    locations: ['Ccp'],
    customHint: 'Mismas preguntas y opciones disponibles que La Laja.',
    optionsSourceSlug: 'laja'
  },
  laja: {
    slug: 'laja',
    name: 'La Laja',
    description: 'Flujo dedicado para equipos que operan en La Laja.',
    subtitle: 'Calidra',
    accent: 'from-emerald-500 to-emerald-700',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    locations: ['La Laja'],
    customHint: 'Configura opciones solo visibles para pedidos de La Laja.',
    optionsSourceSlug: 'laja'
  },
  padrebueno: {
    slug: 'padrebueno',
    name: 'Padre Bueno',
    description: 'Flujo dedicado para equipos que operan en Padre Bueno.',
    subtitle: 'Calidra',
    accent: 'from-sky-500 to-blue-700',
    badgeClass: 'bg-sky-100 text-sky-700',
    locations: ['Padre Bueno'],
    customHint: 'Mismas preguntas y opciones disponibles que La Laja.',
    optionsSourceSlug: 'laja'
  },
  losberros: {
    slug: 'losberros',
    name: 'Los Berros',
    description: 'Flujo dedicado para equipos que operan en Los Berros.',
    subtitle: 'Calidra',
    accent: 'from-teal-500 to-teal-700',
    badgeClass: 'bg-teal-100 text-teal-700',
    locations: ['Los Berros'],
    customHint: 'Mismas preguntas y opciones disponibles que La Laja.',
    optionsSourceSlug: 'laja'
  },
  genneia: {
    slug: 'genneia',
    name: 'Genneia',
    description: 'Pedidos y configuraciones especiales para personal de Genneia.',
    accent: 'from-amber-500 to-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700',
    locations: ['Genneia'],
    customHint: 'Verás preguntas específicas y menú filtrado para Genneia.',
    optionsSourceSlug: 'genneia'
  },
  distro_cuyo: {
    slug: 'distro_cuyo',
    name: 'DistroCuyo',
    description: 'Flujo dedicado para equipos que operan en DistroCuyo.',
    accent: 'from-indigo-500 to-indigo-700',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    locations: ['DistroCuyo'],
    customHint: 'Incluye bebida y regla de postre/fruta igual que Genneia.',
    optionsSourceSlug: 'distro_cuyo'
  },
  epse: {
    slug: 'epse',
    name: 'EPSE',
    description: 'Pedidos para locaciones operativas de EPSE.',
    accent: 'from-blue-500 to-cyan-700',
    badgeClass: 'bg-blue-100 text-blue-700',
    locations: [
      'EPSE – Quebrada de Ullum',
      'EPSE – Anchipurac',
      'EPSE – Planta Fotovoltaica',
      'EPSE – Estación Transformadora',
      'EPSE – Punta Negra',
      'EPSE – Los Caracoles',
      'EPSE – Obra Línea de Alta Tensión'
    ],
    customHint: 'Seleccioná la sede EPSE donde solicitás el pedido.',
    optionsSourceSlug: 'epse',
    requiresAuthorizedLocations: true
  },
  greif: {
    slug: 'greif',
    name: 'Greif',
    description: 'Pedidos para equipos operativos de Greif.',
    accent: 'from-rose-500 to-red-700',
    badgeClass: 'bg-rose-100 text-rose-700',
    locations: ['Greif'],
    customHint: 'Seleccioná Greif para cargar tu pedido.',
    optionsSourceSlug: 'laja'
  },
  administracion_servifood: {
    slug: 'administracion_servifood',
    name: 'Administración ServiFood',
    description: 'Flujo interno para administración de ServiFood.',
    accent: 'from-slate-700 to-slate-900',
    badgeClass: 'bg-slate-100 text-slate-700',
    locations: ['Administración ServiFood'],
    customHint: 'Visible solo para usuarios administradores.',
    optionsSourceSlug: 'administracion_servifood',
    adminOnly: true
  }
}

export const ALL_COMPANY_LIST = Object.values(COMPANY_CATALOG)

export const getVisibleCompanyList = ({ includeAdminOnly = false } = {}) =>
  ALL_COMPANY_LIST.filter((company) => includeAdminOnly || !company.adminOnly)

export const COMPANY_LIST = getVisibleCompanyList()

export const ALL_COMPANY_LOCATIONS = ALL_COMPANY_LIST.flatMap((company) => company.locations || [])

export const COMPANY_LOCATIONS = COMPANY_LIST.flatMap((company) => company.locations || [])

const normalizeCompanyLookupText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const getCompanyByLocationOrSlug = (value = '') => {
  const target = normalizeCompanyLookupText(value)
  if (!target) return null
  return ALL_COMPANY_LIST.find((company) => {
    if (normalizeCompanyLookupText(company.slug) === target) return true
    if (normalizeCompanyLookupText(company.name) === target) return true
    return (company.locations || []).some((location) => normalizeCompanyLookupText(location) === target)
  }) || null
}
