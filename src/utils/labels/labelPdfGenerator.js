import { jsPDF } from 'jspdf'
import {
  DEFAULT_THERMAL_LABEL_SAFE_AREA_MM,
  DEFAULT_THERMAL_LABEL_SIZE,
  getThermalLabelContentGeometry
} from '../../components/labels/labelPrintConfig'
import { expandLabelsForCopies } from './labelOrderUtils'

export const LABEL_PDF_PAGE_SIZE_MM = [DEFAULT_THERMAL_LABEL_SIZE.width, DEFAULT_THERMAL_LABEL_SIZE.height]
export const LABEL_PDF_PAGE_SIZE_PT = LABEL_PDF_PAGE_SIZE_MM.map(value => value * 72 / 25.4)

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

const asUpper = (value) => String(value || '').trim().toUpperCase()

const drawWrappedText = (pdf, text, x, y, maxWidth, {
  fontSize = 8,
  style = 'normal',
  lineHeight = fontSize * 0.38,
  maxY = 48
} = {}) => {
  const normalized = asUpper(text)
  if (!normalized) return y

  pdf.setFont('helvetica', style)
  pdf.setFontSize(fontSize)
  const lines = pdf.splitTextToSize(normalized, maxWidth)

  for (const line of lines) {
    if (y > maxY) return y
    pdf.text(line, x, y)
    y += lineHeight
  }

  return y
}

const drawLabel = (pdf, label) => {
  const { safeArea, contentWidth, contentHeight } = getThermalLabelContentGeometry()
  const x = safeArea.left
  const y = safeArea.top
  const right = x + contentWidth
  const bottom = y + contentHeight
  const codeWidth = 17
  const gap = 2
  let cursorY = y + 4

  pdf.setDrawColor(17, 24, 39)
  pdf.setLineWidth(0.35)
  pdf.rect(x, y, contentWidth, contentHeight)

  const customerWidth = contentWidth - codeWidth - gap - 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  const customerLines = pdf.splitTextToSize(asUpper(label.customerName || 'Cliente sin nombre'), customerWidth)
  pdf.text(customerLines.slice(0, 2), x + 1.6, cursorY)

  pdf.rect(right - codeWidth - 1.3, y + 1.5, codeWidth, 5.5)
  pdf.setFontSize(7.2)
  pdf.text(asUpper(label.shortCode || 'Sin codigo'), right - codeWidth + 0.2, y + 5.2, { maxWidth: codeWidth - 1 })

  cursorY = y + Math.max(8.5, customerLines.slice(0, 2).length * 4.2 + 2)
  pdf.line(x, cursorY, right, cursorY)
  cursorY += 3.1

  const meta = [
    label.companyLabel,
    label.serviceLabel,
    formatDate(label.delivery_date),
    label.originLabel === 'Extra' ? 'Extra' : ''
  ].filter(Boolean).join(' | ')
  cursorY = drawWrappedText(pdf, meta, x + 1.6, cursorY, contentWidth - 3.2, {
    fontSize: 6.8,
    style: 'bold',
    lineHeight: 2.6,
    maxY: bottom - 2
  }) + 0.4

  cursorY = drawWrappedText(pdf, `Pedido: ${label.itemsText || 'Sin detalle'}`, x + 1.6, cursorY, contentWidth - 3.2, {
    fontSize: 7.4,
    style: 'bold',
    lineHeight: 2.9,
    maxY: bottom - 2
  }) + 0.2

  if (Array.isArray(label.beverages) && label.beverages.length > 0) {
    cursorY = drawWrappedText(pdf, `Bebida: ${label.beverages.join(', ')}`, x + 1.6, cursorY, contentWidth - 3.2, {
      fontSize: 6.8,
      style: 'normal',
      lineHeight: 2.6,
      maxY: bottom - 2
    }) + 0.2
  }

  if (label.fruitDessertChoice) {
    drawWrappedText(pdf, `Fruta o postre: ${label.fruitDessertChoice}`, x + 1.6, cursorY, contentWidth - 3.2, {
      fontSize: 6.8,
      style: 'normal',
      lineHeight: 2.6,
      maxY: bottom - 2
    })
  }
}

export const createOrderLabelsPdfDocument = (orders = [], copiesByOrderId = {}) => {
  const labels = expandLabelsForCopies(orders, copiesByOrderId)
  const pdf = new jsPDF({
    unit: 'mm',
    format: LABEL_PDF_PAGE_SIZE_MM,
    orientation: 'landscape',
    compress: false
  })

  labels.forEach((label, index) => {
    if (index > 0) {
      pdf.addPage(LABEL_PDF_PAGE_SIZE_MM, 'landscape')
    }
    drawLabel(pdf, label)
  })

  return { pdf, labels }
}

export const getPdfPageSizes = (pdf) => {
  const pages = pdf.getNumberOfPages()
  return Array.from({ length: pages }, (_, index) => {
    pdf.setPage(index + 1)
    const widthMm = pdf.internal.pageSize.getWidth()
    const heightMm = pdf.internal.pageSize.getHeight()
    return {
      widthMm,
      heightMm,
      widthPt: widthMm * 72 / 25.4,
      heightPt: heightMm * 72 / 25.4
    }
  })
}

export const printOrderLabelsPdf = (orders = [], copiesByOrderId = {}) => {
  try {
    const { pdf, labels } = createOrderLabelsPdfDocument(orders, copiesByOrderId)
    if (labels.length === 0) return { labels, pdf: null, error: null }

    const blob = pdf.output('blob')
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.title = 'Etiquetas ServiFood'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'

    const cleanup = () => {
      setTimeout(() => {
        iframe.remove()
        URL.revokeObjectURL(url)
      }, 1000)
    }

    iframe.onload = () => {
      try {
        const printWindow = iframe.contentWindow
        printWindow?.focus()
        printWindow?.print()
      } finally {
        cleanup()
      }
    }

    iframe.src = url
    document.body.appendChild(iframe)
    return { labels, pdf, error: null }
  } catch (error) {
    return { labels: [], pdf: null, error }
  }
}
