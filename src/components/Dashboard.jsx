import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../supabaseClient'
import { usersService } from '../services/users'
import { birthdaysService } from '../services/birthdays'
import { isOrderEditable } from '../utils'
import { EDIT_WINDOW_MINUTES } from '../constants/orderRules'
import RequireUser from './RequireUser'
import { useOverlayLock } from '../contexts/overlayLockContext'
import OrderHistorySection from './dashboard/OrderHistorySection'
import ArchivedOrdersSection from './dashboard/ArchivedOrdersSection'
import DeleteConfirmModal from './dashboard/DeleteConfirmModal'
import SupportCard from './dashboard/SupportCard'
import WeeklyOrdersSection from './dashboard/WeeklyOrdersSection'
import DashboardHeader from './dashboard/DashboardHeader'
import StatsCards from './dashboard/StatsCards'
import ToastBanner from './dashboard/ToastBanner'
import ChangeCompanyModal from './dashboard/ChangeCompanyModal'
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '../utils/notice'
import LoadingState from './ui/LoadingState'
import { confirmAction } from '../utils/confirm'
import {
  getCustomSideFromResponses,
  summarizeOrderItems,
  serviceBadge,
  formatWeeklyDate,
  getServiceLabel,
  getStatusLabel,
  getStatusBadgeClass,
  getMainMenuLabel,
  formatOrderDate
} from '../utils/dashboard/dashboardHelpers.jsx'
import { useDashboardToast } from '../hooks/dashboard/useDashboardToast'
import { useDashboardCountdown } from '../hooks/dashboard/useDashboardCountdown'
import { useDashboardOrders } from '../hooks/dashboard/useDashboardOrders'
import { useDashboardDerived } from '../hooks/dashboard/useDashboardDerived'
import { useDashboardOrderActions } from '../hooks/dashboard/useDashboardOrderActions'
import OrderRegisteredCard from './dashboard/OrderRegisteredCard'
import { useAuthContext } from '../contexts/authContextValue'
import { BIRTHDAY_STATUS_LABELS } from '../utils/birthdays/birthdayUtils'

const HumanResourcesDashboard = ({ user, loading }) => {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoadingData(true)
      const [birthdayResult, orderResult] = await Promise.all([
        birthdaysService.getBirthdays({ activeOnly: true, force: true }),
        birthdaysService.getCakeOrders({ force: true })
      ])
      if (!mounted) return
      setBirthdays(birthdayResult.data || [])
      setOrders(orderResult.data || [])
      setLoadingData(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const upcomingOrders = useMemo(() => orders.slice(0, 5), [orders])
  const upcomingBirthdays = useMemo(() => birthdays.slice(0, 5), [birthdays])

  return (
    <RequireUser user={user} loading={loading}>
      <div className="p-6 space-y-6 pb-8">
        <DashboardHeader
          user={user}
          countdownLabel="Recursos Humanos"
          countdownValue="Cumpleaños"
          countdownTone="info"
          refreshing={loadingData}
          onRefresh={() => window.location.reload()}
          headerOrder={null}
          headerStatus={null}
          headerSummary=""
          canEditOrder={() => false}
          onEditOrder={() => {}}
          onDeleteOrder={() => {}}
          deleteActionLabel="Cancelar"
          onOpenChangeCompany={() => {}}
          canOpenChangeCompany={false}
          changeCompanyHint=""
          hideNewOrder
          description="Resumen de cumpleaños y tortitas de tus empresas"
          emptyTitle="Gestión de cumpleaños"
          emptyDescription="Los pedidos de tortitas se administran en el módulo independiente."
        />

        <section className="rounded-lg border border-white/20 bg-white/95 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Próximos cumpleaños</p>
              <h2 className="mt-1 text-2xl font-black text-slate-900">Cumpleaños de tus empresas</h2>
            </div>
            <button type="button" onClick={() => navigate('/birthdays')} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
              Ir a Cumpleaños
            </button>
          </div>
          {loadingData ? (
            <div className="mt-4"><LoadingState variant="inline" message="Cargando cumpleaños..." /></div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-black text-slate-900">Personas</h3>
                {upcomingBirthdays.length === 0 ? (
                  <p className="mt-3 text-sm font-semibold text-slate-500">No hay cumpleaños activos cargados.</p>
                ) : upcomingBirthdays.map((birthday) => (
                  <div key={birthday.id} className="mt-3 border-t border-slate-100 pt-3">
                    <p className="font-bold text-slate-900">{birthday.person_name}</p>
                    <p className="text-xs font-semibold text-slate-500">{birthday.birth_day}/{birthday.birth_month} · {birthday.company_name}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-black text-slate-900">Tortitas</h3>
                {upcomingOrders.length === 0 ? (
                  <p className="mt-3 text-sm font-semibold text-slate-500">No hay tortitas próximas.</p>
                ) : upcomingOrders.map((order) => (
                  <div key={order.id} className="mt-3 border-t border-slate-100 pt-3">
                    <p className="font-bold text-slate-900">{order.person_name}</p>
                    <p className="text-xs font-semibold text-slate-500">{new Date(`${order.planned_delivery_date}T00:00:00`).toLocaleDateString('es-AR')} · {BIRTHDAY_STATUS_LABELS[order.status] || order.status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </RequireUser>
  )
}

const OrdersDashboard = ({ user, loading }) => {
  const navigate = useNavigate()
  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [companyModalStep, setCompanyModalStep] = useState(1)
  const [selectedCompanySlug, setSelectedCompanySlug] = useState('')
  const [companySwitchContext, setCompanySwitchContext] = useState(null)
  const [companySwitchLoading, setCompanySwitchLoading] = useState(false)

  const { toast, showToast } = useDashboardToast()
  const { countdownLabel, countdownValue, countdownTone } = useDashboardCountdown()

  const {
    orders,
    setOrders,
    ordersLoading,
    isAdmin,
    refreshing,
    stats,
    fetchOrders,
    calculateStats,
    handleRefresh
  } = useDashboardOrders({ user, db, usersService })

  const {
    weeklyOrders,
    headerOrder,
    headerStatus,
    headerSummary,
    deliveryText,
    isDeliveringTomorrow
  } = useDashboardDerived({ orders })

  const {
    deleteConfirmOrder,
    deleteSubmitting,
    handleEditOrder,
    handleDeleteOrder,
    confirmDeleteOrder,
    closeDeleteConfirm,
    handleViewOrder
  } = useDashboardOrderActions({
    orders,
    setOrders,
    fetchOrders,
    calculateStats,
    navigate,
    db,
    isAdmin,
    isOrderEditable,
    EDIT_WINDOW_MINUTES,
    confirmAction,
    notifyError,
    notifyInfo,
    notifySuccess,
    notifyWarning,
    showToast
  })

  useOverlayLock(!!deleteConfirmOrder)

  const refreshCompanySwitchContext = useCallback(async () => {
    const { data, error } = await db.getUserCompanySwitchContext()
    if (error) {
      console.error('Error fetching company switch context:', error)
      return
    }
    setCompanySwitchContext(data || null)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    refreshCompanySwitchContext()
  }, [refreshCompanySwitchContext, user?.id])

  const canOpenChangeCompany = useMemo(() => {
    if (!companySwitchContext) return true
    if (!companySwitchContext.within_order_window) return false
    return Number(companySwitchContext.remaining_changes || 0) > 0
  }, [companySwitchContext])

  const changeCompanyHint = useMemo(() => {
    if (!companySwitchContext?.within_order_window) {
      return 'Solo podés cambiar de empresa dentro del horario de pedidos.'
    }
    if (Number(companySwitchContext?.remaining_changes || 0) <= 0) {
      return 'Ya usaste los 2 cambios permitidos por hoy.'
    }
    return ''
  }, [companySwitchContext])

  const openChangeCompanyFlow = () => {
    if (!companySwitchContext?.within_order_window) {
      notifyWarning('Solo podés cambiar de empresa dentro del horario de pedidos.')
      return
    }
    if (Number(companySwitchContext?.remaining_changes || 0) <= 0) {
      notifyWarning('Ya usaste los 2 cambios permitidos por hoy.')
      return
    }
    setSelectedCompanySlug(companySwitchContext?.current_company_slug || '')
    setCompanyModalStep(1)
    setCompanyModalOpen(true)
  }

  const continueChangeCompanyFlow = () => {
    if (!selectedCompanySlug) {
      notifyInfo('Seleccioná una empresa/sede para continuar.')
      return
    }
    if (selectedCompanySlug === companySwitchContext?.current_company_slug) {
      notifyWarning('Ya estás usando esta empresa/sede.')
      return
    }
    setCompanyModalStep(2)
  }

  const confirmChangeCompanyFlow = async () => {
    if (!selectedCompanySlug) return
    setCompanySwitchLoading(true)
    const { data, error } = await db.changeActiveCompanyForToday({
      newCompanySlug: selectedCompanySlug
    })
    setCompanySwitchLoading(false)

    if (error) {
      const code = (error?.message || '').toLowerCase()
      if (code.includes('daily_limit_reached')) {
        notifyError('Ya usaste los 2 cambios permitidos por hoy.')
      } else if (code.includes('outside_order_window')) {
        notifyError('Solo podés cambiar de empresa dentro del horario de pedidos.')
      } else if (code.includes('same_company')) {
        notifyWarning('Ya estás usando esta empresa/sede.')
      } else {
        notifyError('No se pudo actualizar la empresa/sede. Intentalo de nuevo.')
      }
      await refreshCompanySwitchContext()
      return
    }

    if (typeof window !== 'undefined' && data?.current_company_slug) {
      window.localStorage.setItem('lastCompany', data.current_company_slug)
      window.localStorage.setItem('lastCompanySelected', data.current_company_slug)
      window.localStorage.setItem('lastCompanyConfirmed', data.current_company_slug)
    }

    notifySuccess('Empresa actualizada correctamente.')
    setCompanyModalOpen(false)
    setCompanyModalStep(1)
    await Promise.all([fetchOrders(true), refreshCompanySwitchContext()])
  }

  const formatDate = formatOrderDate

  if (ordersLoading) {
    return (
      <RequireUser user={user} loading={loading}>
        <div className="py-8">
          <LoadingState message="Cargando pedidos..." />
        </div>
      </RequireUser>
    )
  }

  return (
    <RequireUser user={user} loading={loading}>
      <div className="p-6 space-y-6 pb-8">
      <ToastBanner toast={toast} />
      <DashboardHeader
        user={user}
        countdownLabel={countdownLabel}
        countdownValue={countdownValue}
        countdownTone={countdownTone}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        headerOrder={headerOrder}
        headerStatus={headerStatus}
        headerSummary={headerSummary}
        canEditOrder={(order) => isOrderEditable(order.created_at, EDIT_WINDOW_MINUTES)}
        onEditOrder={handleEditOrder}
        onDeleteOrder={handleDeleteOrder}
        deleteActionLabel={isAdmin ? 'Eliminar' : 'Cancelar pedido'}
        onOpenChangeCompany={openChangeCompanyFlow}
        canOpenChangeCompany={canOpenChangeCompany}
        changeCompanyHint={changeCompanyHint}
      />

      <div className="mt-8">
        <StatsCards stats={stats} />
      </div>

      <OrderRegisteredCard
        headerOrder={headerOrder}
        headerSummary={headerSummary}
        deliveryText={deliveryText}
        isDeliveringTomorrow={isDeliveringTomorrow}
      />

      <WeeklyOrdersSection
        weeklyOrders={weeklyOrders}
        formatWeeklyDate={formatWeeklyDate}
        getServiceLabel={getServiceLabel}
        getMainMenuLabel={getMainMenuLabel}
        getStatusLabel={getStatusLabel}
        getStatusBadgeClass={getStatusBadgeClass}
        onEditOrder={handleEditOrder}
        onDeleteOrder={handleDeleteOrder}
        deleteActionLabel={isAdmin ? 'Eliminar' : 'Cancelar pedido'}
        canEditOrder={(order) => isOrderEditable(order.created_at, EDIT_WINDOW_MINUTES)}
      />

      {/* Support Card - Para usuarios normales */}
      {!isAdmin && <SupportCard />}

      <ArchivedOrdersSection
        isAdmin={isAdmin}
        orders={orders}
        formatDate={formatDate}
        onViewOrder={handleViewOrder}
      />

      <OrderHistorySection
        orders={orders}
        formatDate={formatDate}
        summarizeOrderItems={summarizeOrderItems}
        getCustomSideFromResponses={getCustomSideFromResponses}
        serviceBadge={serviceBadge}
        getStatusLabel={getStatusLabel}
        getStatusBadgeClass={getStatusBadgeClass}
      />

      {deleteConfirmOrder && (
        <DeleteConfirmModal
          order={deleteConfirmOrder}
          onConfirm={confirmDeleteOrder}
          onClose={closeDeleteConfirm}
          submitting={deleteSubmitting}
          mode={isAdmin ? 'delete' : 'cancel'}
        />
      )}

      <ChangeCompanyModal
        open={companyModalOpen}
        step={companyModalStep}
        currentCompanySlug={companySwitchContext?.current_company_slug}
        selectedCompanySlug={selectedCompanySlug}
        remainingChanges={Number(companySwitchContext?.remaining_changes || 0)}
        loading={companySwitchLoading}
        onClose={() => {
          if (companySwitchLoading) return
          setCompanyModalOpen(false)
          setCompanyModalStep(1)
        }}
        onSelect={setSelectedCompanySlug}
        onContinue={continueChangeCompanyFlow}
        onBack={() => setCompanyModalStep(1)}
        onConfirm={confirmChangeCompanyFlow}
        isAdmin={isAdmin}
      />

      </div>
    </RequireUser>
  )
}

const Dashboard = (props) => {
  const { isHumanResources } = useAuthContext()
  return isHumanResources ? <HumanResourcesDashboard {...props} /> : <OrdersDashboard {...props} />
}

export default Dashboard
