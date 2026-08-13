const SummaryCard = ({ label, value, accent, sublabel }) => (
  <div className="card min-w-0 bg-white/95 backdrop-blur-sm shadow-md border border-slate-200 rounded-2xl p-4 sm:p-5">
    <div className="flex min-w-0 items-start justify-between gap-2">
      <p className="min-w-0 text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold leading-snug break-words">
        {label}
      </p>
      <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${accent}`}>
        {sublabel}
      </span>
    </div>
    <p className="mt-2 min-w-0 text-xl sm:text-2xl font-bold text-slate-900 leading-tight break-words [overflow-wrap:anywhere]" title={value}>
      {value}
    </p>
  </div>
)

const TrendsSummaryCards = ({
  totalOrders,
  companyLabel,
  topMenu,
  topBife,
  topSide,
  topBeverage
}) => {
  return (
    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <SummaryCard label="Pedidos Analizados" value={totalOrders} accent="bg-blue-100 text-blue-700" sublabel="Total" />
      <SummaryCard label="Empresa" value={companyLabel} accent="bg-slate-100 text-slate-700" sublabel="Filtro" />
      <SummaryCard label="Plato Más Pedido" value={topMenu} accent="bg-emerald-100 text-emerald-700" sublabel="Top" />
      <SummaryCard label="Bife Más Pedido" value={topBife} accent="bg-orange-100 text-orange-700" sublabel="Top" />
      <SummaryCard label="Guarnición Top" value={topSide} accent="bg-amber-100 text-amber-700" sublabel="Top" />
      <SummaryCard label="Bebida Top" value={topBeverage} accent="bg-sky-100 text-sky-700" sublabel="Top" />
    </div>
  )
}

export default TrendsSummaryCards
