const formatDate = (value) => {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'Sin fecha'
  const [year, month, day] = raw.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)))
}

const OrderLabelCard = ({ label }) => (
  <article className="sf-label-card">
    <header className="sf-label-header">
      <div className="sf-label-customer">{label.customerName}</div>
      <div className="sf-label-code">{label.shortCode}</div>
    </header>

    <div className="sf-label-meta">
      <strong>{label.companyLabel}</strong>
      <span>{label.serviceLabel}</span>
      <span>{formatDate(label.delivery_date)}</span>
    </div>

    {label.deliveryLocation && (
      <div className="sf-label-line">
        <strong>Entrega:</strong> {label.deliveryLocation}
      </div>
    )}

    <div className="sf-label-items">
      <strong>Pedido:</strong> {label.itemsText}
    </div>

    {label.totalItems > 1 && (
      <div className="sf-label-line">
        <strong>Cantidad:</strong> {label.totalItems}
      </div>
    )}

    {label.beverages.length > 0 && (
      <div className="sf-label-line">
        <strong>Bebida:</strong> {label.beverages.join(', ')}
      </div>
    )}

    {label.optionsText && label.optionsText !== 'Sin opciones adicionales' && (
      <div className="sf-label-line sf-label-secondary">
        <strong>Opciones:</strong> {label.optionsText}
      </div>
    )}

    {label.notes && (
      <div className="sf-label-alert">
        <strong>Observaciones alimentarias:</strong> {label.notes}
      </div>
    )}

    {label.responses.length > 0 && (
      <div className="sf-label-responses">
        {label.responses.slice(0, 4).map((response, index) => (
          <div key={`${response.title}-${index}`}>
            <strong>{response.title}:</strong> {response.value}
          </div>
        ))}
      </div>
    )}
  </article>
)

export default OrderLabelCard
