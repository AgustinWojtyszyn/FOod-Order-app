import { useMemo, useState } from 'react'
import { shouldUseDonut } from './donutChartRules'

const defaultColors = [
  '#2563eb', // blue
  '#f59e0b', // amber
  '#22c55e', // green
  '#ef4444', // red
  '#8b5cf6', // purple
  '#0ea5e9', // sky
  '#f97316', // orange
  '#14b8a6'  // teal
]

const formatPercent = (value) => `${value.toFixed(1)}%`
const preferenceIndicator = (value) => {
  const number = Number(value || 0)
  if (number > 0) return '▲'
  if (number < 0) return '▼'
  return '='
}

const formatSignedUnits = (value) => {
  const number = Number(value || 0)
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(0)}`
}

const formatSignedPp = (value) => {
  const number = Number(value || 0)
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(1)} pp`
}

const ComparisonText = ({ comparison }) => {
  if (!comparison) return null
  if (comparison.noPreviousData) {
    return <span className="text-xs font-semibold text-slate-600">Sin base comparable</span>
  }
  if (comparison.isNew) {
    return (
      <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
        Nuevo
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
      {preferenceIndicator(comparison.countDelta)} {formatSignedUnits(comparison.countDelta)} · {formatSignedPp(comparison.ppDelta)}
    </span>
  )
}

const buildSlices = (items, maxSlices = 6) => {
  const sorted = [...items].sort((a, b) => b.count - a.count)
  if (sorted.length <= maxSlices) return sorted
  const head = sorted.slice(0, maxSlices - 1)
  const tail = sorted.slice(maxSlices - 1)
  const otherCount = tail.reduce((sum, item) => sum + item.count, 0)
  const otherPercent = tail.reduce((sum, item) => sum + item.percent, 0)
  return [...head, { label: 'Otros', count: otherCount, percent: otherPercent }]
}

const polarToCartesian = (cx, cy, r, angle) => {
  const rad = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  }
}

const describeArc = (cx, cy, r, startAngle, endAngle) => {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

const DonutChartPro = ({
  items = [],
  size = 220,
  strokeWidth = 26,
  colors = defaultColors,
  centerMode = 'total',
  centerLabel = '',
  centerValue = '',
  onFallback
}) => {
  const [activeIndex, setActiveIndex] = useState(null)
  const [tooltip, setTooltip] = useState(null)

  const { slices, total } = useMemo(() => {
    const totalCount = items.reduce((sum, item) => sum + (item.count || 0), 0)
    return {
      slices: buildSlices(items),
      total: totalCount
    }
  }, [items])

  const usable = shouldUseDonut(slices)
  if (!usable) {
    onFallback?.()
    return null
  }

  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const padAngle = 3
  let acc = 0
  const computed = slices.map((slice) => {
    const value = total ? slice.count / total : 0
    const start = acc * 360
    const end = (acc + value) * 360
    acc += value
    return { ...slice, start, end }
  })

  const main = slices[0]
  const centerText = (() => {
    if (centerMode === 'top' && main) return main.label
    if (centerMode === 'percent' && main) return formatPercent(main.percent || 0)
    if (centerValue) return centerValue
    return total ? total.toLocaleString('es-AR') : '0'
  })()

  const centerSub = centerLabel || (centerMode === 'top' ? 'Top' : 'Total')

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        className="relative"
        onMouseLeave={() => {
          setActiveIndex(null)
          setTooltip(null)
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className=""
        >
          <circle cx={center} cy={center} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
          {computed.map((slice, index) => {
            const color = colors[index % colors.length]
            const startAngle = slice.start + padAngle / 2
            const endAngle = slice.end - padAngle / 2
            if (endAngle <= startAngle) return null
            const isActive = activeIndex === index
            return (
              <g key={`${slice.label}-${index}`}>
                <path
                  d={describeArc(center, center, radius, startAngle, endAngle)}
                  stroke={color}
                  strokeWidth={isActive ? strokeWidth + 4 : strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  style={{ transition: 'stroke-width 160ms ease' }}
                  onMouseEnter={(e) => {
                    setActiveIndex(index)
                    const rect = e.currentTarget.getBoundingClientRect()
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                      label: slice.label,
                      count: slice.count,
                      percent: slice.percent
                    })
                  }}
                  onMouseMove={(e) => {
                    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev)
                  }}
                />
              </g>
            )
          })}
          <circle cx={center} cy={center} r={radius - strokeWidth / 1.7} fill="#fff" stroke="#e2e8f0" strokeWidth="1" />
          <text x={center} y={center - 6} textAnchor="middle" className="text-sm font-bold fill-slate-800">
            {centerText}
          </text>
          <text x={center} y={center + 12} textAnchor="middle" className="text-[11px] font-semibold fill-slate-600">
            {centerSub}
          </text>
        </svg>

        {tooltip && (
          <div
            className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 text-white text-xs px-3 py-2 shadow-lg pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-semibold">{tooltip.label}</div>
            <div>{tooltip.count} · {formatPercent(tooltip.percent || 0)}</div>
          </div>
        )}
      </div>

      <div className="w-full grid gap-3">
        {slices.map((slice, index) => (
          <div key={`${slice.label}-${index}`} className="flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="font-semibold text-slate-800 whitespace-normal break-normal overflow-hidden">{slice.label}</span>
            </div>
            <span className="flex shrink-0 flex-wrap items-center gap-1 text-slate-900 sm:justify-end">
              <span className="font-bold">{slice.count}</span>
              <span className="font-medium text-slate-700">· {formatPercent(slice.percent || 0)}</span>
              {slice.comparison && <span className="text-slate-400">|</span>}
              <ComparisonText comparison={slice.comparison} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DonutChartPro
