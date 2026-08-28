import { Clock } from 'lucide-react'

const OrderHoursBanner = ({ schedule }) => {
  const scheduleRange = schedule?.scheduleRange || '06:00-14:00'
  const timezone = schedule?.timezone || 'America/Argentina/San_Juan'
  const countdown = schedule?.countdownValue
    ? `${schedule.countdownLabel} ${schedule.countdownValue}`
    : ''

  return (
    <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 sm:p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 text-blue-600 shrink-0" />
        <div>
          <p className="text-sm sm:text-base text-blue-800 font-medium">
            Horario de tu sede: <strong>{scheduleRange}</strong> ({timezone})
          </p>
          <p className="text-xs sm:text-sm text-blue-700 mt-1">
            {schedule?.statusLabel || 'Validando horario'}{countdown ? ` - ${countdown}` : ''}
          </p>
          <p className="text-xs sm:text-sm text-blue-700 mt-1">
            Si necesitas realizar cambios, presiona el botón <strong>"¿Necesitas ayuda?"</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

export default OrderHoursBanner
