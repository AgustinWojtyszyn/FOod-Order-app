import { Link } from 'react-router-dom'
import { Building2, Clock, Edit, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react'
import servifoodLogo from '../../assets/servifood_logo_white_text_HQ.png'

const DashboardHeader = ({
  user,
  countdownLabel,
  countdownValue,
  countdownTone,
  schedule,
  refreshing,
  onRefresh,
  headerOrder,
  headerStatus,
  headerSummary,
  canEditOrder,
  onEditOrder,
  onDeleteOrder,
  deleteActionLabel = 'Eliminar',
  onOpenChangeCompany,
  canOpenChangeCompany,
  changeCompanyHint,
  hideNewOrder = false,
  description = 'Aquí está el resumen de tus pedidos',
  emptyTitle = 'Sin pedido activo',
  emptyDescription = 'Creá tu pedido para hoy en segundos'
}) => {
  const allowEdit = headerOrder && canEditOrder ? canEditOrder(headerOrder) : false
  const scheduleRange = schedule?.scheduleRange || '06:00-14:00'
  const scheduleStatus = schedule?.statusLabel || 'Validando horario'

  return (
    <div className="space-y-4">
      <section className="dashboardHero">
        <div className="dashboardHeroContent">
          <div className="dashboardHeroInfo">
            <h1 className="dashboardHeroTitle">Panel Principal</h1>
            <p className="dashboardHeroGreeting">
              ¡Hola, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}!
            </p>
            <p className="dashboardHeroDescription">{description}</p>
            <div
              className={`dashboardHeroSchedule ${
                countdownTone === 'urgent'
                  ? 'dashboardHeroSchedule--urgent'
                  : countdownTone === 'warn'
                  ? 'dashboardHeroSchedule--warn'
                  : ''
              }`}
            >
              <Clock className="h-5 w-5 shrink-0" />
              <span>{scheduleStatus}: {scheduleRange}</span>
              <span>• {countdownLabel} {countdownValue}</span>
            </div>
            <div className="dashboardHeroActions">
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className={`inline-flex items-center justify-center font-bold py-3 px-6 text-base rounded-xl border transition-all duration-200 ${
                  refreshing
                    ? 'bg-gray-200 border-gray-200 cursor-not-allowed text-gray-500'
                    : 'bg-white text-gray-900 border-white/40 hover:bg-white/90'
                }`}
              >
                <RefreshCw className={`h-5 w-5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Actualizando...' : 'Actualizar'}
              </button>
              {!hideNewOrder && (
                <Link to="/order" className="inline-flex items-center justify-center w-full sm:w-auto text-white font-bold py-3 sm:py-4 px-6 sm:px-8 text-base sm:text-lg rounded-xl border border-blue-300/70 bg-transparent hover:bg-blue-600/25 shadow-lg shadow-blue-900/25 transition-colors">
                  <Plus className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
                  Nuevo Pedido
                </Link>
              )}
            </div>
          </div>

          <div className="dashboardHeroBrand">
            <img
              src={servifoodLogo}
              alt="ServiFood"
              className="dashboardHeroLogo"
            />
            <div className="dashboardHeroStars" aria-label="Tres estrellas">
              <span>★</span>
              <span>★</span>
              <span>★</span>
            </div>
          </div>
        </div>

        <div className="dashboardHeroFlag" aria-label="Bandera de Argentina">
          <div className="dashboardHeroFlagStripe dashboardHeroFlagStripe--sky" />
          <div className="dashboardHeroFlagStripe dashboardHeroFlagStripe--white">
            <svg
              className="dashboardHeroSun"
              viewBox="0 0 64 64"
              role="img"
              aria-label="Sol de Mayo"
            >
              <g fill="none" stroke="#d89b12" strokeLinecap="round" strokeWidth="3">
                <path d="M32 4v9" />
                <path d="M32 51v9" />
                <path d="M4 32h9" />
                <path d="M51 32h9" />
                <path d="m12.2 12.2 6.4 6.4" />
                <path d="m45.4 45.4 6.4 6.4" />
                <path d="m51.8 12.2-6.4 6.4" />
                <path d="m18.6 45.4-6.4 6.4" />
                <path d="M20.4 6.8 24 15" />
                <path d="M40 49l3.6 8.2" />
                <path d="M6.8 43.6 15 40" />
                <path d="M49 24l8.2-3.6" />
                <path d="M43.6 6.8 40 15" />
                <path d="M24 49l-3.6 8.2" />
                <path d="M6.8 20.4 15 24" />
                <path d="M49 40l8.2 3.6" />
              </g>
              <circle cx="32" cy="32" r="13" fill="#f6c445" stroke="#d89b12" strokeWidth="2" />
              <path d="M24 31c2-3 5-4 8-4s6 1 8 4" fill="none" stroke="#9b6b08" strokeLinecap="round" strokeWidth="2" />
              <circle cx="27" cy="33" r="1.5" fill="#7a5206" />
              <circle cx="37" cy="33" r="1.5" fill="#7a5206" />
              <path d="M27 39c3 2 7 2 10 0" fill="none" stroke="#9b6b08" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </div>
          <div className="dashboardHeroFlagStripe dashboardHeroFlagStripe--sky" />
        </div>
      </section>

      <div className="rounded-2xl border border-white/30 bg-white/10 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-white/70 font-semibold">Estado del pedido</p>
            {headerOrder ? (
              <>
                <p className="text-xl sm:text-2xl font-black text-white">Pedido en curso</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-gray-900">
                    {headerStatus}
                  </span>
                  <span className="text-xs sm:text-sm text-white/90 font-semibold">
                    Pedido #{String(headerOrder.id).slice(-8)}
                  </span>
                </div>
                <p className="text-sm sm:text-base text-white font-semibold">
                  {headerSummary}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-white/90" />
                  <p className="text-3xl sm:text-4xl font-black text-white">{emptyTitle}</p>
                </div>
                <p className="text-base sm:text-lg text-white/90 font-semibold mt-3">
                  {emptyDescription}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!hideNewOrder && <button
              type="button"
              onClick={onOpenChangeCompany}
              disabled={!canOpenChangeCompany}
              title={changeCompanyHint || ''}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                canOpenChangeCompany
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'bg-slate-200/25 text-slate-200 border-slate-200/30 cursor-not-allowed'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Cambiar empresa
            </button>}
            {headerOrder && (
              <>
                <button
                  type="button"
                  onClick={() => headerOrder && onEditOrder && onEditOrder(headerOrder)}
                  disabled={!allowEdit}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                    allowEdit
                      ? 'bg-white text-gray-900 border-white hover:bg-white/90'
                      : 'bg-white/40 text-white/70 border-white/30 cursor-not-allowed'
                  }`}
                >
                  <Edit className="h-4 w-4" />
                  Editar pedido
                </button>
                <button
                  type="button"
                  onClick={() => headerOrder && onDeleteOrder && onDeleteOrder(headerOrder)}
                  disabled={!allowEdit}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold border transition-colors ${
                    allowEdit
                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                      : 'bg-red-100/60 text-red-200 border-red-100/60 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteActionLabel}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardHeader
