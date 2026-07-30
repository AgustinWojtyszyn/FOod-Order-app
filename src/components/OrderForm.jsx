import { useNavigate, useLocation } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import RequireUser from './RequireUser'
import { Sound } from '../utils/Sound'
import OrderErrorBanner from './order-form/OrderErrorBanner'
import OrderFormHeader from './order-form/OrderFormHeader'
import OrderCommentsSection from './order-form/OrderCommentsSection'
import OrderPersonalInfoSection from './order-form/OrderPersonalInfoSection'
import OrderLunchSummary from './order-form/OrderLunchSummary'
import OrderSuggestionPanel from './order-form/OrderSuggestionPanel'
import OrderTurnSelector from './order-form/OrderTurnSelector'
import OrderLunchMenuSection from './order-form/OrderLunchMenuSection'
import OrderConfirmModal from './order-form/OrderConfirmModal'
import OrderLunchOptionsSection from './order-form/OrderLunchOptionsSection'
import OrderDinnerOptionsSection from './order-form/OrderDinnerOptionsSection'
import OrderSuccessScreen from './order-form/OrderSuccessScreen'
import OrderHoursBanner from './order-form/OrderHoursBanner'
import InlineSpinner from './ui/InlineSpinner'
import { formatResponseValue } from '../utils/order/orderFormatters'
import { useOrderFlowController } from '../hooks/orderForm/useOrderFlowController'

const OrderForm = ({ user, loading }) => {
  const navigate = useNavigate()
  const locationState = useLocation()

  const controller = useOrderFlowController({ user, locationState, navigate })

  if (controller.success) {
    return (
      <RequireUser user={user} loading={loading}>
        <OrderSuccessScreen />
      </RequireUser>
    )
  }

  return (
    <RequireUser user={user} loading={loading}>
      <div
        className="p-3 sm:p-6 min-h-dvh flex flex-col"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 mb-4 flex-1">
          <OrderFormHeader
            companyName={controller.company.companyConfig.name}
            showPostreNotice={controller.company.hasGenneiaRules}
          />
          {!controller.form.hasOrderToday && <OrderHoursBanner />}

          <form onSubmit={controller.submit.handleSubmit} className="space-y-6 sm:space-y-8">
            {/* Sugerencias inteligentes */}
            <OrderSuggestionPanel
              suggestionVisible={controller.suggestions.suggestionVisible}
              suggestion={controller.suggestions.suggestion}
              suggestionMode={controller.suggestions.suggestionMode}
              suggestionSummary={controller.suggestions.suggestionSummary}
              suggestionLoading={controller.suggestions.suggestionLoading}
              onRepeat={controller.suggestions.handleRepeatSuggestion}
              onDismiss={controller.suggestions.handleDismissSuggestion}
            />
            {/* Información Personal */}
            <OrderPersonalInfoSection
              formData={controller.form.formData}
              locations={controller.company.locations}
              deliveryLocation={controller.company.deliveryLocationsByLocation.get(controller.form.formData.location) || controller.form.formData.location}
              locationsLoading={controller.company.authorizedLocationsLoading}
              requiresAuthorizedLocations={controller.company.requiresAuthorizedLocations}
              onChange={controller.form.handleFormChange}
            />

            {/* Selección de Menú */}
            <OrderLunchMenuSection
              items={controller.lunch.menuItems}
              selectedItems={controller.lunch.selectedItems}
              onToggleItem={controller.lunch.handleItemSelect}
            />

            {/* Resumen del Pedido */}
            <OrderLunchSummary
              items={controller.lunch.getSelectedItemsList()}
              total={controller.lunch.calculateTotal()}
              onRemove={controller.lunch.removeLunchItem}
            />

            {/* Opciones Personalizadas - Solo mostrar opciones activas */}
            {controller.lunch.lunchOptionsUI.length > 0 && (
              <OrderLunchOptionsSection
                options={controller.lunch.lunchOptionsUI}
                companyName={controller.company.companyConfig.name}
                onCustomResponse={controller.lunch.handleCustomResponse}
              />
            )}

            {controller.turns.dinnerEnabled && controller.turns.dinnerMenuEnabled && (
              <OrderTurnSelector
                selectedTurns={controller.turns.selectedTurns}
                onToggleLunch={controller.turns.toggleLunchTurn}
                onToggleDinner={controller.turns.toggleDinnerTurn}
              />
            )}

            {controller.turns.dinnerEnabled && controller.turns.dinnerMenuEnabled && controller.turns.selectedTurns.dinner && (
              <div className="space-y-4">
                <OrderLunchMenuSection
                  items={controller.dinner.dinnerMenuItemsUI}
                  selectedItems={controller.dinner.selectedItemsDinner}
                  onToggleItem={controller.dinner.handleItemSelectDinner}
                />

                <OrderLunchSummary
                  items={controller.dinner.getSelectedItemsListDinner()}
                  total={controller.dinner.calculateTotalDinner()}
                  onRemove={(itemId) => controller.dinner.handleItemSelectDinner(itemId, false)}
                />

                <OrderDinnerOptionsSection
                  options={controller.dinner.visibleDinnerOptions}
                  customResponsesDinner={controller.dinner.customResponsesDinner}
                  setCustomResponsesDinner={controller.dinner.setCustomResponsesDinnerSafe}
                  isGenneia={controller.company.hasGenneiaRules}
                  isGenneiaPostreDay={controller.dinner.isGenneiaPostreDay}
                  customSideBlocked={!controller.dinner.canChooseCustomSideForDinner}
                  isDinnerOverrideValue={controller.dinner.isDinnerOverrideValue}
                  clearDinnerMenuSelections={controller.dinner.clearDinnerMenuSelections}
                  dinnerSpecial={controller.dinner.dinnerMenuSpecial}
                  dinnerSpecialChoice={controller.dinner.dinnerSpecialChoice}
                  onDinnerSpecialSelect={controller.dinner.handleDinnerSpecialSelect}
                />
              </div>
            )}

            {/* Información Adicional */}
            <OrderCommentsSection comments={controller.form.formData.comments} onCommentsChange={controller.form.handleFormChange} />

            <OrderErrorBanner error={controller.submit.error} />

            {/* Botón de confirmación - SIEMPRE visible al fondo, nunca fijo en mobile */}
            <div
              className="w-full bg-linear-to-t from-white via-white to-white/95 sm:bg-transparent p-4 sm:p-0 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] sm:shadow-none border-t-2 sm:border-t-0 border-gray-200 flex justify-center sm:mt-6 z-40"
              style={{
                position: 'relative',
                bottom: 'auto',
                left: 'auto',
                right: 'auto',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)'
              }}
            >
              <button
                type="submit"
                onClick={() => {
                  Sound.primeSuccess()
                }}
                disabled={loading || controller.submit.submitting || !controller.submit.hasAnySelectedItems || controller.form.hasOrderToday}
                style={{ 
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  WebkitTextFillColor: '#ffffff',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                  WebkitAppearance: 'none'
                }}
                className="w-full sm:w-auto hover:bg-green-700 font-black py-5 px-8 rounded-xl shadow-2xl hover:shadow-green-500/50 transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-2xl border-2 border-green-600"
              >
                {controller.submit.submitting ? (
                  <>
                    <InlineSpinner size="md" tone="light" className="mr-3" label="Creando pedido" />
                    <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', fontWeight: '900' }}>Creando pedido...</span>
                  </>
                ) : controller.form.hasOrderToday ? (
                  <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', fontWeight: '900' }}>Ya tienes un pedido pendiente</span>
                ) : (
                  <>
                    <ShoppingCart className="h-6 w-6 mr-3" style={{ color: '#ffffff', stroke: '#ffffff', strokeWidth: 2 }} />
                    <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff', fontWeight: '900' }}>Confirmar Pedido</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {controller.submit.confirmOpen && controller.submit.confirmData && (
        <OrderConfirmModal
          open={controller.submit.confirmOpen}
          confirmData={controller.submit.confirmData}
          submitting={controller.submit.submitting}
          onClose={controller.submit.closeConfirm}
          onConfirm={controller.submit.handleConfirmSubmit}
          formatResponseValue={formatResponseValue}
        />
      )}
    </RequireUser>
  )
}

export default OrderForm
