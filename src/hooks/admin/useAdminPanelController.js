import { useEffect, useMemo, useState } from 'react'
import { Sound } from '../../utils/Sound'
import { getTomorrowISOInTimeZone } from '../../utils/dateUtils'
import { notifyInfo, notifySuccess } from '../../utils/notice'
import { confirmAction } from '../../utils/confirm'
import { buildVisibleDates } from '../../utils/admin/adminPanelHelpers'
import { useAdminPanelUI } from './useAdminPanelUI'
import { useAdminUsersData } from './useAdminUsersData'
import { useAdminUsersActions } from './useAdminUsersActions'
import { useAdminFilters } from './useAdminFilters'
import { useAdminMenuEditor } from './useAdminMenuEditor'
import { useAdminMenuData } from './useAdminMenuData'
import { useAdminMenuActions } from './useAdminMenuActions'
import { useAdminOptionsData } from './useAdminOptionsData'
import { useAdminOptionActions } from './useAdminOptionActions'
import { useAdminCompaniesData } from './useAdminCompaniesData'
import { useAdminDinnerMenuData } from './useAdminDinnerMenuData'
import { useAdminDinnerMenuActions } from './useAdminDinnerMenuActions'
import { useAdminCleanupData } from './useAdminCleanupData'
import { useAdminCleanupActions } from './useAdminCleanupActions'
import { getWeeklyMenuFailureReason } from '../../utils/menu/menuErrorMapper'

const useAdminPanelController = ({
  user,
  isAdmin,
  isCompanyAdmin = false,
  adminCompanies = [],
  refreshPermissions
}) => {
  const tomorrowISO = getTomorrowISOInTimeZone()
  const initialSelectedDates = [tomorrowISO]
  const canExportCafeteria = isAdmin
  const canManageGlobalAdmin = isAdmin
  const companyOptions = useMemo(() => {
    const list = Array.isArray(adminCompanies) ? adminCompanies : []
    if (isAdmin) {
      return [
        { slug: 'global', name: 'General' },
        ...list.filter((company) => company?.slug && company.slug !== 'global')
      ]
    }
    return list.filter((company) => company?.slug && company.slug !== 'global')
  }, [adminCompanies, isAdmin])
  const firstCompanySlug = companyOptions[0]?.slug || 'global'
  const [selectedMenuCompanySlug, setSelectedMenuCompanySlug] = useState(firstCompanySlug)
  const [hiddenMenuDates, setHiddenMenuDates] = useState([])

  const {
    activeTab,
    setActiveTab,
    menuWeekBaseDate,
    setMenuWeekBaseDate
  } = useAdminPanelUI()

  useEffect(() => {
    if (!companyOptions.some((company) => company.slug === selectedMenuCompanySlug)) {
      setSelectedMenuCompanySlug(firstCompanySlug)
    }
  }, [companyOptions, firstCompanySlug, selectedMenuCompanySlug])

  const {
    searchTerm,
    debouncedSearchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    sortBy,
    setSortBy,
    page,
    setPage,
    pageSize
  } = useAdminFilters()

  const {
    users,
    usersTotalCount,
    usersTotalPages,
    usersLoading,
    usersError,
    refreshUsers
  } = useAdminUsersData({
    enabled: !!user?.id && isAdmin,
    searchTerm: debouncedSearchTerm,
    roleFilter,
    sortBy,
    page,
    pageSize
  })

  const {
    draftMenuItemsByDate,
    editingMenuByDate,
    savingMenuByDate,
    setDraftItemsForDate,
    setEditingForDate,
    setSavingForDate,
    clearEditorForDate
  } = useAdminMenuEditor()

  const {
    selectedDates,
    loadedDates,
    menuItemsByDate,
    loadingMenuByDate,
    dinnerMenuEnabled,
    fetchMenuForDate,
    addSelectedDate,
    removeSelectedDate,
    clearMenuDate,
    setMenuItemsForDate,
    toggleDinnerMenu
  } = useAdminMenuData({
    editingMenuByDate,
    draftMenuItemsByDate,
    setDraftItemsForDate,
    initialSelectedDates,
    userId: user?.id || null,
    weekBaseDate: menuWeekBaseDate,
    companySlug: selectedMenuCompanySlug
  })

  const {
    handleMenuUpdate,
    handleMenuItemChange,
    addMenuItem,
    removeMenuItem,
    getMenuItemChangeSummary,
    clearDeletedMenuItemsForDate
  } = useAdminMenuActions({
    menuItemsByDate,
    draftMenuItemsByDate,
    savingMenuByDate,
    setMenuItemsForDate,
    setDraftItemsForDate,
    setEditingForDate,
    setSavingForDate,
    fetchMenuForDate,
    companySlug: selectedMenuCompanySlug
  })

  const optionsEnabled = !!user?.id && isAdmin
  const {
    customOptions,
    optionsWithoutDinner,
    optionsLoading,
    refreshOptions,
    dessertOption,
    dessertOverrideDate,
    setDessertOverrideDate,
    dessertOverrideEnabled,
    setDessertOverrideEnabled,
    loadingDessertOverride,
    setLoadingDessertOverride
  } = useAdminOptionsData({ enabled: optionsEnabled, initialDessertDate: tomorrowISO })

  const {
    editingOptions,
    newOption,
    showDessertConfirm,
    handleCreateOption,
    handleEditOption,
    handleSaveOption,
    handleDeleteOption,
    handleToggleOption,
    handleMoveOption,
    handleOptionFieldChange,
    toggleDay,
    handleAddOptionChoice,
    handleRemoveOptionChoice,
    handleOptionChoiceChange,
    handleToggleDessertOverride,
    closeDessertConfirm,
    confirmDessertDisable,
    cancelOptionEdit
  } = useAdminOptionActions({
    customOptions,
    dessertOption,
    dessertOverrideDate,
    dessertOverrideEnabled,
    setDessertOverrideEnabled,
    setLoadingDessertOverride,
    refreshOptions
  })

  const {
    companies,
    draftStartNumbers,
    adminEmailDrafts,
    companiesLoading,
    savingCompanySlug,
    onCompanyStartNumberChange,
    onSaveCompanyStartNumber,
    onAdminEmailChange,
    onAssignCompanyAdmin,
    onRemoveCompanyAdmin,
    onRefreshCompanies
  } = useAdminCompaniesData({ enabled: optionsEnabled })

  const {
    dinnerWeekBaseDate,
    setDinnerWeekBaseDate,
    dinnerSelectedDates,
    dinnerLoadedDates,
    dinnerMenusByDate,
    dinnerDateLoading,
    toggleDinnerDate,
    updateDinnerMenuField,
    updateDinnerMenuOption,
    addDinnerMenuOption,
    removeDinnerMenuOption
  } = useAdminDinnerMenuData({
    active: activeTab === 'dinner-option',
    defaultCompanySlug: isAdmin ? '' : firstCompanySlug
  })

  const { dinnerDateSaving, saveDinnerMenuDate } = useAdminDinnerMenuActions({ dinnerMenusByDate })

  const {
    archivedOrdersCount,
    refreshArchivedOrdersCount,
    clearArchivedOrdersCount
  } = useAdminCleanupData({ active: activeTab === 'cleanup' })

  const refreshAdminData = async () => {
    await refreshUsers()
    await refreshOptions()
    await onRefreshCompanies()
  }

  const {
    archivingPending,
    deletingOrders,
    handleArchiveAllPendingOrders,
    handleDeleteArchivedOrders
  } = useAdminCleanupActions({
    archivedOrdersCount,
    clearArchivedOrdersCount,
    refreshArchivedOrdersCount,
    onRefreshData: refreshAdminData
  })

  const {
    isPersonExpanded,
    togglePersonDetails,
    handleRoleChange,
    handleDeleteUser,
    roleUpdatingById,
    deletingById
  } = useAdminUsersActions({
    user,
    refreshPermissions,
    refreshAdminData
  })

  const menuVisibleDates = buildVisibleDates(loadedDates, selectedDates)
    .filter(date => selectedDates.includes(date) || !hiddenMenuDates.includes(date))
  const dinnerVisibleDates = buildVisibleDates(dinnerLoadedDates, dinnerSelectedDates)

  useEffect(() => {
    const globalOnlyTabs = ['users', 'options', 'companies', 'cleanup', 'cafeteria', 'dinner-option']
    if (globalOnlyTabs.includes(activeTab) && !canManageGlobalAdmin) {
      setActiveTab('menu')
      return
    }
    if (activeTab === 'cafeteria' && !canExportCafeteria) {
      setActiveTab('menu')
    }
  }, [activeTab, canExportCafeteria, canManageGlobalAdmin, setActiveTab])

  useEffect(() => {
    if (!user?.id || (!isAdmin && !isCompanyAdmin)) return
    if (!Array.isArray(menuVisibleDates) || menuVisibleDates.length === 0) return
    menuVisibleDates.forEach(date => {
      if (!Object.prototype.hasOwnProperty.call(menuItemsByDate, date) && !loadingMenuByDate[date]) {
        fetchMenuForDate(date)
      }
    })
  }, [menuVisibleDates, isAdmin, isCompanyAdmin, user, menuItemsByDate, loadingMenuByDate, fetchMenuForDate])

  const handleToggleMenuDate = (menuDate) => {
    if (!menuDate) return
    const isSelected = selectedDates.includes(menuDate)
    if (isSelected) {
      removeSelectedDate(menuDate)
      clearEditorForDate(menuDate)
      clearMenuDate(menuDate)
      setHiddenMenuDates(prev => prev.includes(menuDate) ? prev : [...prev, menuDate])
      return
    }
    setHiddenMenuDates(prev => prev.filter(date => date !== menuDate))
    addSelectedDate(menuDate)
  }

  const handleRemoveVisibleMenuDate = (menuDate) => {
    if (!menuDate) return
    if (selectedDates.includes(menuDate)) {
      removeSelectedDate(menuDate)
      clearEditorForDate(menuDate)
    }
    clearDeletedMenuItemsForDate(menuDate)
    clearMenuDate(menuDate)
    setHiddenMenuDates(prev => prev.includes(menuDate) ? prev : [...prev, menuDate])
  }

  const handleSaveAllMenus = async () => {
    if (!selectedDates.length) return
    const confirmed = await confirmAction({
      title: 'Guardar todos los menús',
      message: `Se guardarán únicamente ${selectedDates.length} fecha${selectedDates.length === 1 ? '' : 's'} seleccionada${selectedDates.length === 1 ? '' : 's'}.`,
      confirmText: 'Guardar todos'
    })
    if (!confirmed) return
    const results = []
    for (const menuDate of selectedDates) {
      results.push(await handleMenuUpdate(menuDate, { silent: true }))
    }
    const savedDates = results
      .filter((result) => result?.ok && result.status === 'saved')
      .map((result) => result.menuDate)
    const unchangedDates = results
      .filter((result) => result?.ok && result.status !== 'saved')
      .map((result) => result.menuDate)
    const failedDates = results
      .filter((result) => !result?.ok)
      .filter((result) => result?.menuDate)

    if (failedDates.length > 0) {
      const lines = [
        `Se guardaron ${savedDates.length} de ${selectedDates.length} fechas.`,
        '',
        'Guardadas:',
        ...(savedDates.length ? savedDates.map((date) => `- ${date}`) : ['- ninguna']),
        '',
        'No guardadas:',
        ...failedDates.map((result) => `- ${result.menuDate}: ${getWeeklyMenuFailureReason(result)}.`)
      ]
      if (unchangedDates.length > 0) {
        lines.push('', 'Sin cambios:', ...unchangedDates.map((date) => `- ${date}`))
      }
      notifyInfo(lines.join('\n'))
      return
    }
    notifySuccess(`Menús procesados. Guardadas: ${savedDates.join(', ') || 'ninguna'}. Sin cambios: ${unchangedDates.join(', ') || 'ninguna'}.`)
  }

  const mergedLoading = optionsLoading || usersLoading || companiesLoading

  return {
    activeTab,
    setActiveTab,
    canExportCafeteria,
    canManageGlobalAdmin,
    mergedLoading,
    usersSection: {
      searchTerm,
      onSearchChange: setSearchTerm,
      roleFilter,
      onRoleFilterChange: setRoleFilter,
      sortBy,
      onSortChange: setSortBy,
      filteredUsers: users,
      usersCount: usersTotalCount,
      usersLoading,
      usersError,
      filteredTotalCount: users.length,
      page,
      totalPages: usersTotalPages,
      pageSize,
      onPageChange: setPage,
      onClearFilters: () => {
        setSearchTerm('')
        setRoleFilter('all')
      },
      isPersonExpanded,
      onTogglePersonDetails: togglePersonDetails,
      onRoleChange: handleRoleChange,
      onDeleteUser: handleDeleteUser,
      roleUpdatingById,
      deletingById
    },
    menuSection: {
      visibleDates: menuVisibleDates,
      selectedDates,
      manualSelectedDatesCount: selectedDates.length,
      loadedDates,
      weekBaseDate: menuWeekBaseDate,
      onWeekBaseDateChange: setMenuWeekBaseDate,
      menuItemsByDate,
      draftMenuItemsByDate,
      editingMenuByDate,
      savingMenuByDate,
      loadingMenuByDate,
      dinnerMenuEnabled,
      onToggleDinnerMenu: toggleDinnerMenu,
      onToggleDate: handleToggleMenuDate,
      onRemoveVisibleDate: handleRemoveVisibleMenuDate,
      onSaveAllMenus: handleSaveAllMenus,
      onEditMenu: (menuDate) => setEditingForDate(menuDate, true),
      onSaveMenu: handleMenuUpdate,
      onCancelMenu: (menuDate) => {
        setEditingForDate(menuDate, false)
        clearDeletedMenuItemsForDate(menuDate)
        fetchMenuForDate(menuDate)
      },
      onMenuItemChange: handleMenuItemChange,
      onAddMenuItem: addMenuItem,
      onRemoveMenuItem: removeMenuItem,
      getMenuItemChangeSummary,
      onPrimeSuccess: () => Sound.primeSuccess(),
      companyOptions,
      selectedCompanySlug: selectedMenuCompanySlug,
      onCompanyChange: (companySlug) => {
        setSelectedMenuCompanySlug(companySlug)
        setHiddenMenuDates([])
        selectedDates.forEach((date) => clearMenuDate(date))
      }
    },
    cafeteriaSection: {
      adminName: user?.user_metadata?.full_name || user?.email || ''
    },
    dinnerSection: {
      weekBaseDate: dinnerWeekBaseDate,
      onWeekBaseDateChange: setDinnerWeekBaseDate,
      visibleDates: dinnerVisibleDates,
      selectedDates: dinnerSelectedDates,
      loadedDates: dinnerLoadedDates,
      onToggleDate: toggleDinnerDate,
      dateLoadingMap: dinnerDateLoading,
      dinnerMenusByDate,
      onFieldChange: updateDinnerMenuField,
      onOptionChoiceChange: updateDinnerMenuOption,
      onAddOptionChoice: addDinnerMenuOption,
      onRemoveOptionChoice: removeDinnerMenuOption,
      onSaveDate: saveDinnerMenuDate,
      savingMap: dinnerDateSaving,
      companyOptions: companyOptions.filter((company) => company.slug !== 'global'),
      canUseGlobalCompany: isAdmin
    },
    optionsSection: {
      editingOptions,
      newOption,
      customOptions: optionsWithoutDinner,
      dessertOption,
      dessertOverrideEnabled,
      dessertOverrideDate,
      loadingDessertOverride,
      showDessertConfirm,
      onDessertOverrideDateChange: setDessertOverrideDate,
      onToggleDessertOverride: handleToggleDessertOverride,
      onCloseDessertConfirm: closeDessertConfirm,
      onConfirmDessertDisable: confirmDessertDisable,
      onCreateOption: handleCreateOption,
      onEditOption: handleEditOption,
      onToggleOption: handleToggleOption,
      onMoveOption: handleMoveOption,
      onDeleteOption: handleDeleteOption,
      onFieldChange: handleOptionFieldChange,
      onToggleDay: toggleDay,
      onOptionChoiceChange: handleOptionChoiceChange,
      onAddOptionChoice: handleAddOptionChoice,
      onRemoveOptionChoice: handleRemoveOptionChoice,
      onSaveOption: handleSaveOption,
      onCancelOption: cancelOptionEdit
    },
    companiesSection: {
      companies,
      draftStartNumbers,
      adminEmailDrafts,
      companiesLoading,
      savingCompanySlug,
      onCompanyStartNumberChange,
      onSaveCompanyStartNumber,
      onAdminEmailChange,
      onAssignCompanyAdmin,
      onRemoveCompanyAdmin
    },
    cleanupSection: {
      archivingPending,
      archivedOrdersCount,
      deletingOrders,
      onArchiveAllPendingOrders: handleArchiveAllPendingOrders,
      onDeleteArchivedOrders: handleDeleteArchivedOrders
    }
  }
}

export { useAdminPanelController }
