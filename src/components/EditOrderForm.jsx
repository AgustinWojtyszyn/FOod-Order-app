import { useEffect, useCallback, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Clock, Save } from 'lucide-react'
import { EDIT_WINDOW_MINUTES } from '../constants/orderRules'
import RequireUser from './RequireUser'
import { COMPANY_CATALOG, getVisibleCompanyList } from '../constants/companyConfig'
import { db } from '../supabaseClient'
import EditOrderCustomOptionsSection from './edit-order/EditOrderCustomOptionsSection'
import EditOrderPersonalInfoSection from './edit-order/EditOrderPersonalInfoSection'
import EditOrderSummarySection from './edit-order/EditOrderSummarySection'
import EditOrderMenuSection from './edit-order/EditOrderMenuSection'
import { Sound } from '../utils/Sound'
import { useAuthContext } from '../contexts/authContextValue'
import { useEditOrderBootstrap } from '../hooks/orderEdit/useEditOrderBootstrap'
import { useEditOrderSelection } from '../hooks/orderEdit/useEditOrderSelection'
import { useEditOrderSubmit } from '../hooks/orderEdit/useEditOrderSubmit'
import {
  appendOriginalLocation,
  resolveEditOrderCompany,
  resolveEditOrderLocation
} from '../utils/orderEdit/editOrderCompany'

const TOTAL_ADMIN_EMAIL = 'agustinwojtyszyn99@gmail.com'
const ADMIN_SERVIFOOD_SLUG = 'administracion_servifood'

export default function EditOrderForm({ user, loading }) {
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const order = routerLocation.state?.order
  const { isAdmin } = useAuthContext()

  const [authorizedEpseLocationRows, setAuthorizedEpseLocationRows] = useState([])
  const [canUseAdminServifoodInEdit, setCanUseAdminServifoodInEdit] = useState(false)
  const originalCompany = useMemo(() => resolveEditOrderCompany(order), [order])
  const originalLocation = useMemo(() => resolveEditOrderLocation(order), [order])
  const isEpseOrder = originalCompany?.slug === 'epse'
  const isTotalAdminUser = String(user?.email || '').trim().toLowerCase() === TOTAL_ADMIN_EMAIL
  const authorizedEpseLocations = useMemo(
    () => authorizedEpseLocationRows.map((row) => row.name).filter(Boolean),
    [authorizedEpseLocationRows]
  )
  const visibleCompanyLocations = useMemo(() => {
    const companies = getVisibleCompanyList({ includeAdminOnly: false })
    const adminServifood = COMPANY_CATALOG[ADMIN_SERVIFOOD_SLUG]
    if (
      (canUseAdminServifoodInEdit || originalCompany?.slug === ADMIN_SERVIFOOD_SLUG) &&
      adminServifood &&
      !companies.some((company) => company.slug === ADMIN_SERVIFOOD_SLUG)
    ) {
      companies.push(adminServifood)
    }
    return companies.flatMap((company) => company.locations || [])
  }, [canUseAdminServifoodInEdit, originalCompany?.slug])
  const locations = useMemo(() => {
    const baseLocations = isEpseOrder ? authorizedEpseLocations : visibleCompanyLocations
    return appendOriginalLocation(baseLocations, originalLocation)
  }, [authorizedEpseLocations, isEpseOrder, originalLocation, visibleCompanyLocations])

  const {
    menuItems,
    customOptions,
    customResponses,
    selectedItems,
    formData,
    setFormData,
    setCustomResponses,
    setSelectedItems
  } = useEditOrderBootstrap({ order, user, navigate, isAdmin })

  const { handleItemSelect, getSelectedItemsList, total } = useEditOrderSelection({
    service: order?.service,
    dinnerOverrideChoice: customResponses?.['dinner-special'],
    menuItems,
    selectedItems,
    setSelectedItems
  })

  const selectedItemsList = getSelectedItemsList()
  const deliveryLocationForEdit = useMemo(() => {
    if (!isEpseOrder) return order?.delivery_location || formData?.location || originalLocation || ''
    const row = authorizedEpseLocationRows.find((item) => item.name === formData?.location)
    return row?.delivery_name || order?.delivery_location || formData?.location || originalLocation || ''
  }, [authorizedEpseLocationRows, formData?.location, isEpseOrder, order?.delivery_location, originalLocation])

  useEffect(() => {
    if (!isEpseOrder) return
    let mounted = true
    const load = async () => {
      const { data, error } = await db.getCompanyOrderLocations({ companySlug: 'epse' })
      if (!mounted) return
      setAuthorizedEpseLocationRows(error ? [] : (Array.isArray(data) ? data : []))
    }
    load()
    return () => {
      mounted = false
    }
  }, [isEpseOrder])

  useEffect(() => {
    let mounted = true

    const loadAdminServifoodEligibility = async () => {
      if (isTotalAdminUser) {
        setCanUseAdminServifoodInEdit(true)
        return
      }

      if (!user?.id) {
        setCanUseAdminServifoodInEdit(false)
        return
      }

      const { data, error } = await db.hasArchivedOrderForLocation({
        userId: user.id,
        locations: [
          'Administración ServiFood',
          'Administracion ServiFood',
          ADMIN_SERVIFOOD_SLUG
        ]
      })

      if (!mounted) return
      if (error) {
        setCanUseAdminServifoodInEdit(false)
        return
      }
      setCanUseAdminServifoodInEdit(Boolean(data))
    }

    loadAdminServifoodEligibility()

    return () => {
      mounted = false
    }
  }, [isTotalAdminUser, user?.id])

  const { handleSubmit, error, success } = useEditOrderSubmit({
    order,
    user,
    formData,
    selectedItemsList,
    customOptions,
    customResponses,
    isAdmin
  })

  useEffect(() => {
    if (success) {
      Sound.playSuccess()
    }
  }, [success])

  const handleFormChange = useCallback((e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }, [setFormData])

  const handleCustomResponse = useCallback((optionId, value, type) => {
    const isSelectingDinnerSpecial = optionId === 'dinner-special'
      && type === 'multiple_choice'
      && customResponses?.[optionId] !== value

    if (type === 'checkbox') {
      setCustomResponses(prev => {
        const current = prev[optionId] || []
        const isChecked = current.includes(value)
        return {
          ...prev,
          [optionId]: isChecked
            ? current.filter(v => v !== value)
            : [...current, value]
        }
      })
      return
    }

    if (type === 'multiple_choice') {
      setCustomResponses(prev => {
        const current = prev[optionId]
        return {
          ...prev,
          [optionId]: current === value ? null : value
        }
      })
      if (isSelectingDinnerSpecial) {
        setSelectedItems({})
      }
      return
    }

    setCustomResponses(prev => ({
      ...prev,
      [optionId]: value
    }))
  }, [customResponses, setCustomResponses, setSelectedItems])

  if (!order) {
    return (
      <RequireUser user={user} loading={loading}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </RequireUser>
    )
  }

  if (success) {
    return (
      <RequireUser user={user} loading={loading}>
        <div className="p-3 sm:p-6 flex items-center justify-center min-h-dvh">
          <div className="max-w-2xl mx-auto text-center px-4">
            <div className="bg-white/95 backdrop-blur-sm border-2 border-green-300 rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-center mb-3 sm:mb-4">
                <div className="p-3 sm:p-4 rounded-full bg-green-100">
                  <Save className="h-10 w-10 sm:h-12 sm:w-12 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-green-900 mb-2">¡Pedido actualizado exitosamente!</h2>
              <p className="text-base sm:text-lg text-green-700">Los cambios han sido guardados.</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="inline-flex items-center justify-center rounded-full bg-[#0b1f3a] text-white font-bold text-sm px-5 py-2.5 shadow-md"
                >
                  Volver al dashboard
                </button>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm px-5 py-2.5 shadow-md"
                >
                  Seguir revisando
                </button>
              </div>
            </div>
          </div>
        </div>
      </RequireUser>
    )
  }

  return (
    <RequireUser user={user} loading={loading}>
      <div className="p-3 sm:p-6 pb-32 sm:pb-6 min-h-dvh">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 mb-4">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white drop-shadow-2xl mb-2 sm:mb-3">Editar Pedido</h1>
          <p className="text-lg sm:text-xl md:text-2xl text-white font-semibold drop-shadow-lg">Modifica tu pedido antes de que sea procesado</p>
          <p className="text-base sm:text-lg text-white/90 mt-1 sm:mt-2">¡Solo tienes {EDIT_WINDOW_MINUTES} minutos para editarlo!</p>
        </div>

        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 sm:p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-sm sm:text-base text-blue-800 font-medium">
                <strong>Edición disponible:</strong> Solo puedes editar pedidos dentro de los primeros {EDIT_WINDOW_MINUTES} minutos de creación
              </p>
              <p className="text-xs sm:text-sm text-blue-700 mt-1">
                Después de este tiempo, contacta al soporte si necesitas cambios
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
          <EditOrderPersonalInfoSection
            formData={formData}
            locations={locations}
            deliveryLocation={deliveryLocationForEdit}
            onChange={handleFormChange}
          />

          <EditOrderMenuSection
            items={menuItems}
            selectedItems={selectedItems}
            onToggleItem={handleItemSelect}
            companySlug={originalCompany?.slug}
          />

          <EditOrderSummarySection
            items={selectedItemsList}
            total={total}
            onRemove={(itemId) => handleItemSelect(itemId, false)}
            companySlug={originalCompany?.slug}
          />

          <EditOrderCustomOptionsSection
            options={customOptions}
            customResponses={customResponses}
            onCustomResponse={handleCustomResponse}
          />

          {/* Información Adicional */}
          <div className="card">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Información Adicional</h2>

            <div>
              <label htmlFor="additional-comments" className="block text-sm font-bold text-gray-700 mb-2">
                Comentarios adicionales
              </label>
              <textarea
                id="additional-comments"
                name="comments"
                value={formData.comments}
                onChange={handleFormChange}
                rows={4}
                className="input-field"
                placeholder="Instrucciones especiales, alergias, etc."
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm sm:text-base">
              {error}
            </div>
          )}

          {/* Botón de confirmación - Sticky en mobile con safe area */}
          <div className="fixed sm:relative bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto bg-linear-to-t from-white via-white to-white/95 sm:bg-transparent p-4 sm:p-0 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] sm:shadow-none border-t-2 sm:border-t-0 border-gray-200 sm:flex sm:justify-end mt-0 sm:mt-6 z-50" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <div className="flex gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 sm:flex-none bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || selectedItemsList.length === 0}
                style={{
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  WebkitTextFillColor: '#ffffff',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                  WebkitAppearance: 'none'
                }}
                className="flex-1 sm:flex-none hover:bg-green-700 font-black py-5 px-8 rounded-xl shadow-2xl hover:shadow-green-500/50 transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-2xl border-2 border-green-600"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', fontWeight: '900' }}>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-6 w-6 mr-3" style={{ color: '#ffffff', stroke: '#ffffff', strokeWidth: 2 }} />
                    <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', fontWeight: '900' }}>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
      </div>
    </RequireUser>
  )
}
