import { loadExcelJS } from './loadExcelJS'

const toLower = (value) => (value || '').toString().trim().toLowerCase()

export const getActorName = (log = {}) =>
  log.actor_name || log.actor_email || log.actor || 'Administrador'

export const getTargetName = (log = {}) =>
  log.target_name || log.target_email || log.target || log.affected_user || 'N/A'

export const getReadableDetail = (log = {}) => {
  if (log.details) return log.details
  if (log.reason) return log.reason
  if (log.metadata && typeof log.metadata === 'object') {
    try {
      return JSON.stringify(log.metadata)
    } catch {
      return String(log.metadata)
    }
  }
  return 'Sin descripción adicional'
}

const normalizeDetail = (detail = '') => {
  return detail
    .toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const safeTimestamp = (value) => {
  const ts = new Date(value || 0).getTime()
  return Number.isFinite(ts) ? ts : 0
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

export const prepareAuditLogs = (logs = []) => {
  return (Array.isArray(logs) ? logs : [])
    .map((log) => {
      const actor = getActorName(log)
      const target = getTargetName(log)
      const detail = getReadableDetail(log)
      const createdAt = log.created_at || log.timestamp || null
      const createdAtTs = safeTimestamp(createdAt)

      return {
        ...log,
        actor,
        target,
        detail,
        createdAt,
        createdAtTs,
        dedupeDetail: normalizeDetail(detail)
      }
    })
    .sort((a, b) => b.createdAtTs - a.createdAtTs)
}

export const filterAuditLogs = (logs = [], filters = {}) => {
  const {
    search = '',
    actions = [],
    actor = 'all',
    action = 'all',
    dateFrom = '',
    dateTo = ''
  } = filters

  const hasSearch = !!search.trim()
  const lowerSearch = toLower(search)
  const selectedActions = Array.isArray(actions) ? actions : []
  const fromTs = dateFrom ? safeTimestamp(`${dateFrom}T00:00:00`) : null
  const toTs = dateTo ? safeTimestamp(`${dateTo}T23:59:59.999`) : null

  return (Array.isArray(logs) ? logs : []).filter((log) => {
    if (selectedActions.length > 0 && !selectedActions.includes(log.action)) return false
    if (action !== 'all' && log.action !== action) return false
    if (actor !== 'all' && log.actor !== actor) return false

    if (fromTs && log.createdAtTs < fromTs) return false
    if (toTs && log.createdAtTs > toTs) return false

    if (!hasSearch) return true

    const haystack = [
      log.actor,
      log.target,
      log.action,
      log.detail,
      JSON.stringify(log.metadata || {})
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(lowerSearch)
  })
}

export const groupDuplicateAuditLogs = (logs = [], { enabled = true, windowSeconds = 120 } = {}) => {
  const source = Array.isArray(logs) ? logs : []
  if (!enabled) {
    return source.map((log) => ({ ...log, repeatCount: 1, groupedIds: [log.id].filter(Boolean) }))
  }

  const windowMs = Math.max(1, Number(windowSeconds) || 120) * 1000
  const grouped = []
  const buckets = new Map()

  source.forEach((log) => {
    const key = `${log.action || 'unknown'}|${toLower(log.actor)}|${log.dedupeDetail}`
    const bucket = buckets.get(key) || []
    let matchedGroup = null

    for (const group of bucket) {
      if (Math.abs(group.createdAtTs - log.createdAtTs) <= windowMs) {
        matchedGroup = group
        break
      }
    }

    if (!matchedGroup) {
      matchedGroup = {
        ...log,
        repeatCount: 1,
        groupedIds: [log.id].filter(Boolean)
      }
      grouped.push(matchedGroup)
      bucket.push(matchedGroup)
      buckets.set(key, bucket)
      return
    }

    matchedGroup.repeatCount += 1
    matchedGroup.groupedIds.push(log.id)
    if (log.createdAtTs > matchedGroup.createdAtTs) {
      matchedGroup.createdAtTs = log.createdAtTs
      matchedGroup.createdAt = log.createdAt
    }
  })

  return grouped.sort((a, b) => b.createdAtTs - a.createdAtTs)
}

export const buildDailyAuditSummary = (logs = []) => {
  const source = Array.isArray(logs) ? logs : []
  const now = new Date()
  const todayLogs = source.filter((log) => {
    if (!log.createdAtTs) return false
    return sameDay(new Date(log.createdAtTs), now)
  })

  const actorCount = new Map()
  todayLogs.forEach((log) => {
    const actor = log.actor || 'Administrador'
    actorCount.set(actor, (actorCount.get(actor) || 0) + 1)
  })

  let topActor = 'N/A'
  let topActorCount = 0
  actorCount.forEach((count, actor) => {
    if (count > topActorCount) {
      topActor = actor
      topActorCount = count
    }
  })

  const lastMenuUpdate = source.find((log) => log.action === 'menu_updated') || null

  return {
    lastMenuUpdate,
    changesToday: todayLogs.length,
    topActor,
    topActorCount
  }
}

export const hasRapidMenuUpdates = (logs = [], { minCount = 2, windowMinutes = 10 } = {}) => {
  const menuLogs = (Array.isArray(logs) ? logs : [])
    .filter((log) => log.action === 'menu_updated' && log.createdAtTs)
    .sort((a, b) => b.createdAtTs - a.createdAtTs)

  if (menuLogs.length < minCount) return false

  const windowMs = Math.max(1, Number(windowMinutes) || 10) * 60 * 1000
  for (let i = 0; i < menuLogs.length; i++) {
    let count = 1
    const startTs = menuLogs[i].createdAtTs
    for (let j = i + 1; j < menuLogs.length; j++) {
      if (startTs - menuLogs[j].createdAtTs <= windowMs) {
        count += 1
        if (count >= minCount) return true
      } else {
        break
      }
    }
  }

  return false
}

export const buildAuditExportRows = (logs = [], actionFormatter = (action) => action) => {
  return (Array.isArray(logs) ? logs : []).map((log) => ({
    Fecha: log.createdAt || '',
    Accion: actionFormatter(log.action),
    Detalle: log.detail || '',
    Responsable: log.actor || '',
    UsuarioAfectado: log.target || '',
    Repeticiones: log.repeatCount || 1
  }))
}

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1200)
}

export const exportAuditCsv = (rows = [], fileName = 'auditoria.csv') => {
  const safeRows = Array.isArray(rows) ? rows : []
  if (safeRows.length === 0) return false

  const headers = Object.keys(safeRows[0])
  const escapeCsv = (value) => {
    const str = (value ?? '').toString()
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
  }

  const lines = [
    headers.join(','),
    ...safeRows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
  ]
  const csv = lines.join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fileName)
  return true
}

export const exportAuditXlsx = async (rows = [], fileName = 'auditoria.xlsx') => {
  const safeRows = Array.isArray(rows) ? rows : []
  if (safeRows.length === 0) return false

  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Auditoria')
  const headers = Object.keys(safeRows[0])
  sheet.columns = headers.map((header) => ({ header, key: header, width: 28 }))
  sheet.addRows(safeRows)

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName
  )
  return true
}
