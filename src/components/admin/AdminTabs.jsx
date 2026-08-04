import { Building2, ChefHat, Settings, Users, MoonStar, Coffee } from 'lucide-react'

const AdminTabs = ({ activeTab, onChange, showCafeteria = false, canManageGlobalAdmin = false, showDinner = true }) => (
  <div className="border-b-2 border-white/30 w-full" style={{ overflowX: 'auto', minWidth: 0 }}>
    <div className="overflow-x-auto scrollbar-hide -mx-3 sm:-mx-6 md:mx-0" style={{ WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
      <nav className="-mb-0.5 flex space-x-2 sm:space-x-4 md:space-x-8 min-w-max px-3 sm:px-6 md:px-0" style={{ minWidth: '100%', flexWrap: 'nowrap', overflowX: 'auto' }}>
        {canManageGlobalAdmin && (
          <button
            onClick={() => onChange('users')}
            className={`py-3 px-3 sm:px-4 border-b-4 font-bold text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 sm:gap-2 ${
              activeTab === 'users'
                ? 'border-secondary-500 text-white drop-shadow'
                : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
            }`}
          >
            <Users className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span>Usuarios</span>
          </button>
        )}
        <button
          onClick={() => onChange('menu')}
          className={`py-3 px-3 sm:px-4 border-b-4 font-bold text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 sm:gap-2 ${
            activeTab === 'menu'
              ? 'border-secondary-500 text-white drop-shadow'
              : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
          }`}
        >
          <ChefHat className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
          <span>Menú</span>
        </button>
        {showDinner && (
          <button
            onClick={() => onChange('dinner-option')}
            className={`py-3 px-3 sm:px-4 border-b-4 font-bold text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 sm:gap-2 ${
              activeTab === 'dinner-option'
                ? 'border-secondary-500 text-white drop-shadow'
                : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
            }`}
          >
            <MoonStar className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span>Cena</span>
          </button>
        )}
        {canManageGlobalAdmin && (
          <>
            <button
              onClick={() => onChange('options')}
              className={`py-3 px-3 sm:px-4 border-b-4 font-bold text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 sm:gap-2 ${
                activeTab === 'options'
                  ? 'border-secondary-500 text-white drop-shadow'
                  : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
              }`}
            >
              <Settings className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>Opciones</span>
            </button>
            <button
              onClick={() => onChange('companies')}
              className={`py-3 px-3 sm:px-4 border-b-4 font-bold text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 sm:gap-2 ${
                activeTab === 'companies'
                  ? 'border-secondary-500 text-white drop-shadow'
                  : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
              }`}
            >
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>Empresas</span>
            </button>
          </>
        )}
        {showCafeteria && (
          <button
            onClick={() => onChange('cafeteria')}
            className={`py-3 px-3 sm:px-4 border-b-4 font-bold text-xs sm:text-sm transition-colors whitespace-nowrap flex items-center gap-1 sm:gap-2 ${
              activeTab === 'cafeteria'
                ? 'border-secondary-500 text-white drop-shadow'
                : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
            }`}
          >
            <Coffee className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
            <span>Cafeteria</span>
          </button>
        )}
      </nav>
    </div>
  </div>
)

export default AdminTabs
