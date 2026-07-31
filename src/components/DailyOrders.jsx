import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import RequireUser from './RequireUser'
import { COMPANY_LOCATIONS } from '../constants/companyConfig'
import DailyFilters from './daily/DailyFilters'
import DailyHeader from './daily/DailyHeader'
import DailyLoader from './daily/DailyLoader'
import DailyClosePanel from './daily/DailyClosePanel'
import DailyOrdersTable from './daily/DailyOrdersTable'
import DailySummary from './daily/DailySummary'
import DailyPrintStyles from './daily/DailyPrintStyles'
import { useDailyOrdersData } from '../hooks/useDailyOrdersData'
import { matchesDailyOrderStatusFilter, useDailyOrdersFilters } from '../hooks/useDailyOrdersFilters'
import {
  buildLocationCards,
  buildOperationalSummary,
  calculateStats,
  buildPrintStats,
  filterOrdersByCompany
} from '../utils/daily/dailyOrderCalculations'
import { getDailyOperationalStatus } from '../utils/daily/dailyCloseStatus'
import { formatDeliveryDateLabel } from '../utils/daily/dailyOrderFormatters'
import { exportDailyOrdersExcel } from '../utils/daily/exportDailyOrdersExcel'
import { exportDailyOrdersPdf } from '../utils/daily/exportDailyOrdersPdf'
import { shareDailyOrdersWhatsApp } from '../utils/daily/shareDailyOrdersWhatsApp'

const DailyOrders = ({ user, loading }) => {
  const [selectedLocation, setSelectedLocation] = useState('all')
  const [exportCompany, setExportCompany] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('pending')
  const [selectedDish, setSelectedDish] = useState('all')
  const [selectedSide, setSelectedSide] = useState('all')
  const [sortBy, setSortBy] = useState('recent')

  const locations = COMPANY_LOCATIONS
  const navigate = useNavigate()

  const {
    orders,
    ordersLoading,
    isAdmin,
    availableDishes,
    refreshing,
    ordersError,
    reportRun,
    reportRunError,
    lastUpdatedAt,
    operationalDate,
    stats,
    handleRefresh,
    handleDeliveryDateChange,
    handleArchiveOrder,
    handleArchiveAllPending
  } = useDailyOrdersData(user)

  const {
    allOrders,
    sortedOrders,
    availableSides
  } = useDailyOrdersFilters({
    orders,
    selectedLocation,
    selectedStatus,
    selectedDish,
    selectedSide,
    sortBy
  })

  const exportToExcel = async () => {
    await exportDailyOrdersExcel({
      sortedOrders: manualExportOrders,
      exportCompany,
      selectedLocation,
      selectedStatus,
      stats
    })
  }

  const exportToPdf = () => {
    exportDailyOrdersPdf(manualExportOrders)
  }

  const shareViaWhatsApp = () => {
    shareDailyOrdersWhatsApp(manualExportOrders, selectedStatus)
  }

  const operationalSummary = useMemo(
    () => buildOperationalSummary(sortedOrders),
    [sortedOrders]
  )

  const statusFilteredOrders = useMemo(() => {
    return allOrders.filter(order => matchesDailyOrderStatusFilter(order, selectedStatus))
  }, [allOrders, selectedStatus])

  const statsForFilters = useMemo(
    () => calculateStats(statusFilteredOrders),
    [statusFilteredOrders]
  )

  const activeLocationsCount = useMemo(
    () => Object.values(statsForFilters.byLocation || {}).filter(count => Number(count) > 0).length,
    [statsForFilters.byLocation]
  )

  const locationCards = useMemo(
    () => buildLocationCards(allOrders),
    [allOrders]
  )

  const printStats = useMemo(() => buildPrintStats(allOrders), [allOrders])
  const manualExportOrders = useMemo(
    () => filterOrdersByCompany(sortedOrders, exportCompany),
    [sortedOrders, exportCompany]
  )
  const exportableOrdersCount = manualExportOrders.length
  const deliveryDateLabel = formatDeliveryDateLabel(operationalDate)
  const dailyCloseStatus = useMemo(
    () => getDailyOperationalStatus({
      orders: allOrders,
      deliveryDate: operationalDate,
      selectedStatus: 'all',
      reportRun,
      reportRunError,
      lastUpdatedAt,
      exportCompany
    }),
    [allOrders, exportCompany, lastUpdatedAt, operationalDate, reportRun, reportRunError]
  )

  if (!isAdmin) {
    return (
      <RequireUser user={user} loading={loading}>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-red-100 rounded-full">
                <Shield className="h-12 w-12 text-red-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-red-900 mb-2">Acceso Restringido</h2>
            <p className="text-red-700">Solo los administradores pueden ver los pedidos diarios.</p>
          </div>
        </div>
      </RequireUser>
    )
  }

  if (ordersLoading) {
    return (
      <RequireUser user={user} loading={loading}>
        <DailyLoader />
      </RequireUser>
    )
  }

  return (
    <RequireUser user={user} loading={loading}>
      <DailyPrintStyles />
      <div className="mx-auto max-w-screen-2xl rounded-3xl bg-slate-50/70 p-4 md:p-6 2xl:p-10 print-wrap print-content">
        <DailySummary
          mode="print"
          stats={stats}
          printStats={printStats}
          tomorrowLabel={deliveryDateLabel}
        />

        <DailyHeader
          stats={statsForFilters}
          activeLocationsCount={activeLocationsCount}
          tomorrowLabel={deliveryDateLabel}
          operationalDate={operationalDate}
          onDeliveryDateChange={handleDeliveryDateChange}
          exportCompany={exportCompany}
          onExportCompanyChange={setExportCompany}
          locations={locations}
          exportableOrdersCount={exportableOrdersCount}
          onExportExcel={exportToExcel}
          onShareWhatsApp={shareViaWhatsApp}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onExportPdf={exportToPdf}
          onArchiveAll={handleArchiveAllPending}
          sortedOrdersLength={sortedOrders.length}
          pendingOrdersCount={dailyCloseStatus.pendingCount}
          isAdmin={isAdmin}
        />

        {ordersError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print-hide">
            {ordersError}
          </div>
        )}

        <DailyClosePanel
          status={dailyCloseStatus}
        />

        <DailyFilters
          stats={statsForFilters}
          locations={locations}
          selectedLocation={selectedLocation}
          onLocationChange={setSelectedLocation}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedDish={selectedDish}
          onDishChange={setSelectedDish}
          selectedSide={selectedSide}
          onSideChange={setSelectedSide}
          availableDishes={availableDishes}
          availableSides={availableSides}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        <DailySummary
          mode="main"
          stats={stats}
          operationalSummary={operationalSummary}
          sortedOrdersLength={sortedOrders.length}
          selectedLocation={selectedLocation}
          locationCards={locationCards}
        />

        <DailyOrdersTable
          sortedOrders={sortedOrders}
          sortBy={sortBy}
          selectedLocation={selectedLocation}
          selectedStatus={selectedStatus}
          onArchiveOrder={handleArchiveOrder}
          onViewOrder={(orderId) => navigate(`/orders/${orderId}`)}
        />
      </div>
    </RequireUser>
  )
}

export default DailyOrders
