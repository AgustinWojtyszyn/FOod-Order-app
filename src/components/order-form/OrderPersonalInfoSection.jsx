import { User } from 'lucide-react'

const OrderPersonalInfoSection = ({
  formData,
  locations,
  deliveryLocation,
  locationsLoading = false,
  locationsError = null,
  requiresAuthorizedLocations = false,
  onChange
}) => {
  const hasSingleLocation = !requiresAuthorizedLocations && locations.length === 1
  const hasLocationsError = requiresAuthorizedLocations && !locationsLoading && Boolean(locationsError)
  const hasNoAuthorizedLocations = requiresAuthorizedLocations && !locationsLoading && !hasLocationsError && locations.length === 0
  const showDeliveryLocation = Boolean(formData.location && deliveryLocation)
  const deliveryDiffers = showDeliveryLocation && deliveryLocation !== formData.location

  return (
  <div className="card bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/20">
    <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
      <div className="bg-linear-to-r from-primary-600 to-primary-700 text-white p-2 sm:p-3 rounded-xl">
        <User className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Información Personal</h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
      <div>
        <label htmlFor="location" className="block text-sm font-bold text-gray-700 mb-2">
          Locación solicitante *
        </label>
        {hasSingleLocation ? (
          <input
            id="location"
            type="text"
            name="location"
            value={formData.location || locations[0]}
            className="input-field bg-gray-100 text-gray-700"
            readOnly
            autoComplete="organization"
          />
        ) : (
          <select
            id="location"
            name="location"
            value={formData.location}
            onChange={onChange}
            className="input-field"
            required
            disabled={locationsLoading || hasNoAuthorizedLocations || hasLocationsError}
            autoComplete="organization"
          >
            <option value="">{locationsLoading ? 'Cargando locaciones...' : 'Seleccionar locación'}</option>
            {locations.map(location => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        )}
        {hasNoAuthorizedLocations && (
          <p className="mt-2 text-sm font-semibold text-red-700">
            No hay locaciones habilitadas para esta empresa.
          </p>
        )}
        {hasLocationsError && (
          <p className="mt-2 text-sm font-semibold text-red-700">
            No pudimos cargar las locaciones de EPSE. Intentá nuevamente o comunicate con administración.
          </p>
        )}
        {showDeliveryLocation && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            deliveryDiffers
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}>
            <span className="font-bold">Entrega en:</span> {deliveryLocation}
          </div>
        )}
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-bold text-gray-700 mb-2">
          Nombre completo *
        </label>
        <input
          id="name"
          type="text"
          name="name"
          value={formData.name}
          onChange={onChange}
          className="input-field"
          required
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
          Correo electrónico *
        </label>
        <input
          id="email"
          type="email"
          name="email"
          value={formData.email}
          onChange={onChange}
          className="input-field"
          required
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-bold text-gray-700 mb-2">
          Teléfono
        </label>
        <input
          id="phone"
          type="tel"
          name="phone"
          value={formData.phone}
          onChange={onChange}
          className="input-field"
          autoComplete="tel"
        />
      </div>
    </div>
  </div>
  )
}

export default OrderPersonalInfoSection
