/// <reference lib="deno.window" />
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0'
import ExcelJS from 'npm:exceljs@4.4.0'
import {
  DAILY_REPORT_TEST_TYPE,
  DAILY_REPORT_TYPE,
  DailyReportPayload,
  DAILY_REPORT_ARCHIVE_STATUSES,
  DAILY_REPORT_SEND_STATUSES,
  buildArchiveCompletedPayload,
  buildArchiveFailedPayload,
  buildDailySummary,
  buildDailyReportFailurePayload,
  buildDailyReportRunPayload,
  buildEmailHtml,
  buildEmailText,
  createMockOrders,
  formatDateEs,
  getArchiveOrdersRpcCall,
  getCustomSide,
  getDefaultReportDate,
  getEmailSubject,
  getMenuOptionText,
  getRecipientsForMode,
  getServiceLabel,
  isAuthorized,
  canArchiveSuccessfulDailyReportRun,
  isStaleRunningRun,
  isTestEmailMode,
  isValidISODate,
  normalizeOrder,
  parseRecipients,
  shouldSkipExistingRun,
  shouldWriteDailyReportRun,
  usesMockOrdersForMode,
  usesRealOrdersForMode
} from '../_shared/daily_report.ts'

const jsonHeaders = {
  'Content-Type': 'application/json'
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const cronSecret = Deno.env.get('CRON_SECRET') || ''
const mailFrom = Deno.env.get('MAIL_FROM') || ''
const resendApiKey = Deno.env.get('EMAIL_PROVIDER_API_KEY') || Deno.env.get('RESEND_API_KEY') || ''
const configuredRecipients = parseRecipients(Deno.env.get('DAILY_REPORT_RECIPIENTS') || '')
const configuredTestRecipients = parseRecipients(Deno.env.get('TEST_REPORT_RECIPIENT') || '')
const serviFoodLogoUrl = (Deno.env.get('SERVIFOOD_LOGO_URL') || '').trim()

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const toResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || 'Error desconocido')
  return message.slice(0, 500)
}

type ReportFailureContext = {
  reportDate?: string
  reportType?: string
  ordersCount?: number
  recipients?: string[]
  emailAccepted?: boolean
  sentStatus?: string
  sentAt?: string
}

const getMenuNames = (order: ReturnType<typeof normalizeOrder>) =>
  order.items
    .map((item) => String(item.name || item.title || item.menu || '').trim())
    .filter(Boolean)
    .join('; ') || 'Sin menú'

const addHeaderStyle = (worksheet: ExcelJS.Worksheet) => {
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF14532D' }
  }
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount }
  }
}

const buildWorkbook = async ({
  orders,
  reportDate,
  isTest
}: {
  orders: ReturnType<typeof normalizeOrder>[]
  reportDate: string
  isTest: boolean
}) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ServiFood Pedidos'
  workbook.created = new Date()

  const summary = buildDailySummary(orders, reportDate)
  const summarySheet = workbook.addWorksheet('Resumen')
  summarySheet.columns = [
    { header: 'Concepto', key: 'Concepto', width: 36 },
    { header: 'Valor', key: 'Valor', width: 48 }
  ]
  summarySheet.addRows([
    { Concepto: 'Fecha de entrega', Valor: summary.displayDate || 'Sin fecha' },
    { Concepto: 'Estado exportado', Valor: 'Pendientes' },
    { Concepto: 'Total de pedidos', Valor: summary.totalOrders },
    { Concepto: 'Cantidad de pedidos con comentarios', Valor: summary.commentRows.length }
  ])
  summarySheet.addRow({ Concepto: 'Totales por ubicación / empresa', Valor: '' })
  summary.byLocation.forEach((row) => {
    summarySheet.addRow({ Concepto: row.label, Valor: `${row.orders} pedidos / ${row.items} ítems` })
  })
  summarySheet.addRow({ Concepto: 'Totales por lugar de entrega', Valor: '' })
  ;(summary.byDeliveryLocation || []).forEach((row) => {
    summarySheet.addRow({ Concepto: row.label, Valor: `${row.orders} pedidos / ${row.items} ítems` })
  })
  summarySheet.addRow({ Concepto: 'Totales por menú / opción', Valor: '' })
  summary.byMenuOption.forEach((row) => {
    summarySheet.addRow({ Concepto: row.label, Valor: row.quantity })
  })
  summarySheet.addRow({ Concepto: 'Totales por servicio / turno', Valor: '' })
  ;['Almuerzo', 'Cena'].forEach((serviceLabel) => {
    const serviceOrders = orders.filter((order) => getServiceLabel(order.service) === serviceLabel)
    if (!serviceOrders.length) return
    summarySheet.addRow({ Concepto: serviceLabel, Valor: `${serviceOrders.length} pedidos` })
  })
  addHeaderStyle(summarySheet)
  summarySheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })

  const details = workbook.addWorksheet('Pedidos Detallados')
  details.columns = [
    { header: 'Cliente', key: 'cliente', width: 24 },
    { header: 'Organización', key: 'organizacion', width: 20 },
    { header: 'Ubicación / empresa', key: 'ubicacion', width: 28 },
    { header: 'Lugar de entrega', key: 'lugarEntrega', width: 28 },
    { header: 'Fecha de entrega', key: 'fechaEntrega', width: 18 },
    { header: 'Turno / servicio', key: 'turno', width: 16 },
    { header: 'Menú elegido', key: 'menu', width: 36 },
    { header: 'Guarniciones', key: 'guarniciones', width: 24 },
    { header: 'Comentarios', key: 'comentarios', width: 36 }
  ]

  if (isTest) {
    details.addRow({
      cliente: 'PRUEBA - NO USAR PARA PRODUCCIÓN',
      organizacion: '',
      ubicacion: '',
      lugarEntrega: '',
      fechaEntrega: formatDateEs(reportDate),
      turno: '',
      menu: '',
      guarniciones: '',
      comentarios: ''
    })
  }

  orders.forEach((order) => {
    details.addRow({
      cliente: order.customer_name || order.user_name || 'Sin nombre',
      organizacion: order.organization || order.company_name || order.company || '',
      ubicacion: order.location || order.company_name || order.company || 'Sin ubicación / empresa',
      lugarEntrega: order.delivery_location || order.location || order.company_name || order.company || 'Sin ubicación / empresa',
      fechaEntrega: formatDateEs(String(order.delivery_date || reportDate)),
      turno: getServiceLabel(order.service),
      menu: getMenuNames(order),
      guarniciones: getCustomSide(order) || 'Sin guarnición',
      comentarios: order.comments || 'Sin comentarios'
    })
  })
  addHeaderStyle(details)
  details.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })

  const comments = workbook.addWorksheet('Comentarios')
  comments.columns = [
    { header: 'Cliente', key: 'cliente', width: 24 },
    { header: 'Ubicación / Empresa', key: 'ubicacion', width: 28 },
    { header: 'Servicio / Turno', key: 'servicio', width: 16 },
    { header: 'Menú / Opción', key: 'menu', width: 36 },
    { header: 'Comentario', key: 'comentario', width: 48 }
  ]
  comments.addRows(orders
    .filter((order) => String(order.comments || '').trim())
    .map((order) => ({
      cliente: order.customer_name || order.user_name || 'Sin nombre',
      ubicacion: order.location || order.company_name || order.company || 'Sin ubicación / empresa',
      servicio: getServiceLabel(order.service),
      menu: getMenuOptionText(order),
      comentario: order.comments || ''
    })))
  addHeaderStyle(comments)
  comments.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })

  const inconsistencies = workbook.addWorksheet('Inconsistencias')
  inconsistencies.columns = [
    { header: 'Pedido', key: 'pedido', width: 28 },
    { header: 'Ubicación / Empresa', key: 'ubicacion', width: 28 },
    { header: 'Problema', key: 'problema', width: 48 }
  ]
  const issueRows: Array<{ pedido: string; ubicacion: string; problema: string }> = []
  orders.forEach((order, index) => {
    const pedido = order.customer_name || order.user_name || `Pedido ${index + 1}`
    const ubicacion = order.location || order.company_name || order.company || 'Sin ubicación'
    if (!order.customer_name && !order.user_name) issueRows.push({ pedido, ubicacion, problema: 'Sin cliente' })
    if (!order.customer_email && !order.user_email) issueRows.push({ pedido, ubicacion, problema: 'Sin email' })
    if (!order.location && !order.company && !order.company_name) issueRows.push({ pedido, ubicacion, problema: 'Sin ubicación' })
    if (!order.items.length) issueRows.push({ pedido, ubicacion, problema: 'Sin items' })
    ;(order.normalization_warnings || []).forEach((warning) => {
      issueRows.push({ pedido, ubicacion, problema: warning })
    })
  })
  if (issueRows.length) {
    inconsistencies.addRows(issueRows)
  } else {
    inconsistencies.addRow({
      pedido: 'No se detectaron datos incompletos o inconsistentes.',
      ubicacion: '',
      problema: ''
    })
  }
  addHeaderStyle(inconsistencies)
  inconsistencies.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })

  return workbook.xlsx.writeBuffer()
}

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  filename,
  attachment
}: {
  to: string[]
  subject: string
  html: string
  text: string
  filename: string
  attachment: ArrayBuffer
}) => {
  if (!resendApiKey) throw new Error('EMAIL_PROVIDER_API_KEY o RESEND_API_KEY no está configurado')
  if (!mailFrom) throw new Error('MAIL_FROM no está configurado')
  if (!to.length) throw new Error('No hay destinatarios configurados')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: mailFrom,
      to,
      subject,
      html,
      text,
      attachments: [{
        filename,
        content: arrayBufferToBase64(attachment)
      }]
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend respondió ${response.status}: ${body.slice(0, 300)}`)
  }

  return response.json()
}

const fetchOrders = async (reportDate: string) => {
  const { data, error } = await supabase
    .from('orders_with_person_key')
    .select('*')
    .eq('status', 'pending')
    .eq('delivery_date', reportDate)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (Array.isArray(data) ? data : []).map((order) => normalizeOrder(order))
}

const fetchOrdersForRealTestEmail = async (reportDate: string) => {
  const query = (filterDeleted = true) => {
    let builder = supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_date', reportDate)

    if (filterDeleted) builder = builder.is('deleted_at', null)

    return builder.order('created_at', { ascending: true })
  }

  const { data, error } = await query()

  if (!error) return (Array.isArray(data) ? data : []).map((order) => normalizeOrder(order))

  const missingDeletedAtColumn = String(error.message || '').toLowerCase().includes('deleted_at')
  if (!missingDeletedAtColumn) throw error

  const { data: retryData, error: retryError } = await query(false)
  if (retryError) throw retryError
  return (Array.isArray(retryData) ? retryData : []).map((order) => normalizeOrder(order))
}

const getExistingRun = async (reportDate: string, reportType = DAILY_REPORT_TYPE) => {
  const { data, error } = await supabase
    .from('daily_report_runs')
    .select('id,status,sent_at,created_at,updated_at,archive_status,archived_at')
    .eq('report_date', reportDate)
    .eq('report_type', reportType)
    .maybeSingle()

  if (error) throw error
  return data
}

const acquireRunLock = async ({
  reportDate,
  reportType,
  ordersCount,
  recipients,
  force
}: {
  reportDate: string
  reportType: string
  ordersCount: number
  recipients: string[]
  force?: boolean
}) => {
  if (force) {
    await upsertRun({
      reportDate,
      reportType,
      status: DAILY_REPORT_SEND_STATUSES.RUNNING,
      ordersCount,
      recipients
    })
    return { acquired: true, existingRun: null }
  }

  const { error } = await supabase
    .from('daily_report_runs')
    .insert({
      report_date: reportDate,
      report_type: reportType,
      status: DAILY_REPORT_SEND_STATUSES.RUNNING,
      orders_count: ordersCount,
      recipients,
      sent_at: null,
      error: null
    })

  if (!error) return { acquired: true, existingRun: null }

  if (error.code === '23505') {
    const existingRun = await getExistingRun(reportDate, reportType)
    const canRetryExistingRun = existingRun?.status === DAILY_REPORT_SEND_STATUSES.FAILED ||
      (existingRun?.status === DAILY_REPORT_SEND_STATUSES.RUNNING && isStaleRunningRun({
        createdAt: existingRun?.created_at,
        updatedAt: existingRun?.updated_at
      }))

    if (canRetryExistingRun) {
      const { data: retriedRun, error: retryError } = await supabase
        .from('daily_report_runs')
        .update({
          status: DAILY_REPORT_SEND_STATUSES.RUNNING,
          orders_count: ordersCount,
          recipients,
          sent_at: null,
          error: existingRun?.status === DAILY_REPORT_SEND_STATUSES.RUNNING ? 'Retry after stale running lock' : null
        })
        .eq('report_date', reportDate)
        .eq('report_type', reportType)
        .in('status', [DAILY_REPORT_SEND_STATUSES.FAILED, DAILY_REPORT_SEND_STATUSES.RUNNING])
        .select('id,status,sent_at,created_at,updated_at')
        .maybeSingle()

      if (retryError) throw retryError
      if (retriedRun) return { acquired: true, existingRun: null }

      return { acquired: false, existingRun: await getExistingRun(reportDate, reportType) }
    }
    return { acquired: false, existingRun }
  }

  throw error
}

const upsertRun = async ({
  reportDate,
  reportType,
  status,
  ordersCount,
  recipients,
  error,
  sentAt,
}: {
  reportDate: string
  reportType: string
  status: string
  ordersCount: number
  recipients: string[]
  error?: string | null
  sentAt?: string | null
}) => {
  const payload = buildDailyReportRunPayload({
    reportDate,
    reportType,
    status,
    ordersCount,
    recipients,
    error,
    sentAt
  })
  const { error: upsertError } = await supabase
    .from('daily_report_runs')
    .upsert(payload, { onConflict: 'report_date,report_type' })

  if (upsertError) throw upsertError
}

const upsertFailureRun = async ({
  reportDate,
  reportType,
  ordersCount,
  recipients,
  error,
  emailAccepted,
  sentStatus,
  sentAt
}: {
  reportDate: string
  reportType: string
  ordersCount: number
  recipients: string[]
  error: string
  emailAccepted?: boolean
  sentStatus?: string
  sentAt?: string | null
}) => {
  const payload = buildDailyReportFailurePayload({
    reportDate,
    reportType,
    ordersCount,
    recipients,
    error,
    emailAccepted,
    sentStatus,
    sentAt
  })
  const { error: upsertError } = await supabase
    .from('daily_report_runs')
    .upsert(payload, { onConflict: 'report_date,report_type' })

  if (upsertError) throw upsertError
}

const updateArchiveRun = async ({
  reportDate,
  reportType,
  patch
}: {
  reportDate: string
  reportType: string
  patch: Record<string, unknown>
}) => {
  const { error } = await supabase
    .from('daily_report_runs')
    .update(patch)
    .eq('report_date', reportDate)
    .eq('report_type', reportType)

  if (error) throw error
}

const archiveReportedOrders = async (reportDate: string) => {
  const { rpcName, args } = getArchiveOrdersRpcCall(reportDate)
  const { data, error } = await supabase.rpc(rpcName, args)

  if (error) throw error
  const result = Array.isArray(data) ? data[0] : data
  return {
    reportFound: Boolean(result?.report_found),
    reportStatus: result?.report_status || null,
    sentAt: result?.sent_at || null,
    reclassifiedOrdersCount: Number(result?.reclassified_count || 0),
    archivedOrdersCount: Number(result?.archived_count || 0)
  }
}

Deno.serve(async (req: Request) => {
  let currentPayload: DailyReportPayload = {}
  const failureContext: ReportFailureContext = {}
  if (req.method !== 'POST') return toResponse({ error: 'Method not allowed' }, 405)
  if (!isAuthorized(req.headers, cronSecret)) return toResponse({ error: 'Unauthorized' }, 401)

  try {
    const payload = await req.json().catch(() => ({})) as DailyReportPayload
    currentPayload = payload
    const mode = payload.mode || 'send'
    if (!['send', 'dryRun', 'testEmail', 'testEmailReal', 'archiveAfterSuccessfulReport'].includes(mode)) {
      return toResponse({ error: 'mode inválido' }, 400)
    }

    const reportDate = isValidISODate(payload.reportDate)
      ? payload.reportDate
      : getDefaultReportDate()
    const allowEmpty = payload.allowEmpty !== false
    const isTest = isTestEmailMode(mode)
    const recipients = getRecipientsForMode({
      mode,
      configuredRecipients,
      configuredTestRecipients,
      sendTo: payload.sendTo
    })
    const shouldUseMocks = usesMockOrdersForMode(mode, Boolean(payload.useRealData))
    const shouldUseRealOrders = usesRealOrdersForMode(mode, Boolean(payload.useRealData))
    failureContext.reportDate = reportDate

    console.log('[daily-orders-report] inicio', {
      mode,
      reportDate,
      recipientsCount: recipients.length,
      logoUrlConfigured: Boolean(serviFoodLogoUrl),
      force: Boolean(payload.force)
    })

    if (mode === 'archiveAfterSuccessfulReport') {
      const existingRun = await getExistingRun(reportDate, DAILY_REPORT_TYPE)

      if (!canArchiveSuccessfulDailyReportRun(existingRun)) {
        if (existingRun) {
          await updateArchiveRun({
            reportDate,
            reportType: DAILY_REPORT_TYPE,
            patch: {
              archive_error: 'report_not_sent'
            }
          })
        }
        return toResponse({
          ok: true,
          mode,
          skipped: true,
          reason: 'report_not_sent',
          reportDate,
          reportStatus: existingRun?.status || null,
          sentAt: existingRun?.sent_at || null,
          archivedOrdersCount: 0
        })
      }

      try {
        const archiveResult = await archiveReportedOrders(reportDate)
        if (!archiveResult.reportFound) {
          return toResponse({
            ok: true,
            mode,
            skipped: true,
            reason: 'report_not_sent',
            reportDate,
            reportStatus: archiveResult.reportStatus,
            sentAt: archiveResult.sentAt,
            reclassifiedOrdersCount: 0,
            archivedOrdersCount: 0
          })
        }
        await updateArchiveRun({
          reportDate,
          reportType: DAILY_REPORT_TYPE,
          patch: buildArchiveCompletedPayload(archiveResult.archivedOrdersCount)
        })

        console.log('[daily-orders-report] archivado post reporte', {
          mode,
          reportDate,
          reclassifiedOrdersCount: archiveResult.reclassifiedOrdersCount,
          archivedOrdersCount: archiveResult.archivedOrdersCount
        })

        return toResponse({
          ok: true,
          mode,
          skipped: false,
          reportDate,
          reclassifiedOrdersCount: archiveResult.reclassifiedOrdersCount,
          archivedOrdersCount: archiveResult.archivedOrdersCount
        })
      } catch (archiveError) {
        const message = safeError(archiveError)
        await updateArchiveRun({
          reportDate,
          reportType: DAILY_REPORT_TYPE,
          patch: buildArchiveFailedPayload(message)
        })
        throw archiveError
      }
    }

    const orders = shouldUseMocks
      ? createMockOrders(reportDate)
      : shouldUseRealOrders && isTest
        ? await fetchOrdersForRealTestEmail(reportDate)
        : await fetchOrders(reportDate)
    const summary = buildDailySummary(orders, reportDate)
    const filename = `${isTest ? 'PRUEBA_' : ''}pedidos_servifood_${reportDate}.xlsx`
    const wouldAttachExcel = orders.length > 0 || allowEmpty || isTest

    if (mode === 'dryRun') {
      return toResponse({
        ok: true,
        mode,
        reportDate,
        ordersCount: summary.totalOrders,
        itemsCount: summary.totalItems,
        resumen: summary,
        recipientsCount: recipients.length,
        adjuntariaExcel: wouldAttachExcel,
        warnings: summary.warnings
      })
    }

    if (mode === 'send' && orders.length === 0 && !allowEmpty) {
      return toResponse({
        ok: true,
        skipped: true,
        reason: 'No hay pedidos y allowEmpty=false',
        reportDate,
        ordersCount: 0
      })
    }

    const reportType = isTest ? DAILY_REPORT_TEST_TYPE : DAILY_REPORT_TYPE
    failureContext.reportType = reportType
    failureContext.ordersCount = summary.totalOrders
    failureContext.recipients = recipients
    if (shouldWriteDailyReportRun(mode)) {
      const { acquired, existingRun } = await acquireRunLock({
        reportDate,
        reportType,
        ordersCount: summary.totalOrders,
        recipients,
        force: payload.force
      })
      if (!acquired && shouldSkipExistingRun({
        existingStatus: existingRun?.status,
        existingCreatedAt: existingRun?.created_at,
        existingUpdatedAt: existingRun?.updated_at,
        force: payload.force
      })) {
        return toResponse({
          ok: true,
          skipped: true,
          reason: `Reporte ya procesado con status ${existingRun?.status}`,
          reportDate,
          status: existingRun?.status
        })
      }
    }

    const workbookBuffer = await buildWorkbook({ orders, reportDate, isTest })
    const reportCutoffAt = new Date().toISOString()
    const emailResult = await sendEmail({
      to: recipients,
      subject: getEmailSubject(reportDate, isTest),
      html: buildEmailHtml(summary, isTest, { logoUrl: serviFoodLogoUrl }),
      text: buildEmailText(summary, isTest),
      filename,
      attachment: workbookBuffer
    })
    failureContext.emailAccepted = true
    failureContext.sentStatus = DAILY_REPORT_SEND_STATUSES.SENT
    failureContext.sentAt = reportCutoffAt

    if (shouldWriteDailyReportRun(mode)) {
      await upsertRun({
        reportDate,
        reportType,
        status: DAILY_REPORT_SEND_STATUSES.SENT,
        ordersCount: summary.totalOrders,
        recipients,
        sentAt: reportCutoffAt
      })
    }

    console.log('[daily-orders-report] enviado', {
      mode,
      reportDate,
      ordersCount: summary.totalOrders,
      recipientsCount: recipients.length,
      logoUrlConfigured: Boolean(serviFoodLogoUrl)
    })

    return toResponse({
      ok: true,
      mode,
      reportDate,
      ordersCount: summary.totalOrders,
      itemsCount: summary.totalItems,
      recipientsCount: recipients.length,
      archivedOrdersCount: 0,
      filename,
      emailResult
    })
  } catch (error) {
    const message = safeError(error)
    console.error('[daily-orders-report] error', message)
    try {
      const reportDate = isValidISODate(currentPayload.reportDate) ? currentPayload.reportDate : getDefaultReportDate()
      if (shouldWriteDailyReportRun(currentPayload.mode || 'send')) {
        await upsertFailureRun({
          reportDate,
          reportType: failureContext.reportType || DAILY_REPORT_TYPE,
          ordersCount: failureContext.ordersCount ?? 0,
          recipients: failureContext.recipients || [],
          error: message,
          emailAccepted: Boolean(failureContext.emailAccepted),
          sentStatus: failureContext.sentStatus,
          sentAt: failureContext.sentAt
        })
      }
    } catch {
      // Best-effort failure logging only.
    }
    return toResponse({ ok: false, error: message }, 500)
  }
})
