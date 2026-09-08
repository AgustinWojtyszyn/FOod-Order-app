const DEFAULT_ACCESS_CONTEXT_TIMEOUT_MS = 5000
const DEFAULT_RETRY_DELAY_MS = 350

export const createPermissionTimeoutError = () => {
  const error = new Error('No pudimos validar tus permisos a tiempo.')
  error.code = 'PERMISSION_VALIDATION_TIMEOUT'
  return error
}

export const isTransientPermissionError = (error) => {
  if (!error) return false

  const status = Number(error.status || error.code)
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true

  const searchableErrorText = [
    error.message,
    error.name,
    error.code,
    String(error)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return [
    'permission_validation_timeout',
    'failed to fetch',
    'err_connection_closed',
    'err_network',
    'network request failed',
    'networkerror',
    'timeout',
    'timed out'
  ].some((pattern) => searchableErrorText.includes(pattern))
}

export const withPermissionTimeout = (promise, timeoutMs, createError = createPermissionTimeoutError) => {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createError())
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))

export const fetchPermissionAccessContext = async (
  operation,
  {
    attempts = 2,
    timeoutMs = DEFAULT_ACCESS_CONTEXT_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  } = {}
) => {
  const safeAttempts = Math.max(Number(attempts) || 1, 1)
  let lastError = null

  for (let attempt = 1; attempt <= safeAttempts; attempt += 1) {
    try {
      const result = await withPermissionTimeout(
        Promise.resolve().then(operation),
        timeoutMs,
        createPermissionTimeoutError
      )

      if (!result?.error) {
        return { data: result?.data ?? null, error: null, attempts: attempt }
      }

      lastError = result.error
    } catch (error) {
      lastError = error
    }

    if (!isTransientPermissionError(lastError) || attempt >= safeAttempts) {
      return { data: null, error: lastError, attempts: attempt }
    }

    if (retryDelayMs > 0) {
      await wait(retryDelayMs)
    }
  }

  return { data: null, error: lastError || new Error('No pudimos validar tus permisos.'), attempts: safeAttempts }
}
