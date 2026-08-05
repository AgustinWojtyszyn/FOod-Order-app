import { createClient } from '@supabase/supabase-js'
import { sanitizeInput } from '../utils'

// Configuración del cliente Supabase optimizada
const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isLocalSupabaseUrl = /^https?:\/\/(127\.0\.0\.1|localhost):54321(?:\/|$)/i.test(rawSupabaseUrl)
const allowLocalSupabase = import.meta.env.VITE_ALLOW_LOCAL_SUPABASE === 'true'
const supabaseUrl = (!isLocalSupabaseUrl || allowLocalSupabase) ? rawSupabaseUrl : ''

// Log controlado para diagnosticar env vars en producción
// Activa esto seteando VITE_LOG_SUPABASE_ENV="true" en el entorno de deploy
if (import.meta.env.VITE_LOG_SUPABASE_ENV === 'true') {
  console.log('[Supabase] URL:', supabaseUrl || 'undefined')
  if (supabaseAnonKey) {
    console.log('[Supabase] ANON_KEY prefix:', supabaseAnonKey.slice(0, 6) + '...')
  } else {
    console.log('[Supabase] ANON_KEY prefix: undefined')
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  if (isLocalSupabaseUrl && !allowLocalSupabase) {
    throw new Error('Invalid Supabase URL: local Supabase is only allowed when VITE_ALLOW_LOCAL_SUPABASE=true')
  }
  throw new Error('Missing Supabase environment variables')
}

// Cliente principal con configuración avanzada
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'sb-servifood-auth' // clave única para evitar colisiones si hubiera más clientes
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'servifood-app',
      'x-client-info': 'servifood-web'
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Cache inteligente con TTL y LRU-like eviction
class SmartCache {
  constructor(maxSize = 100, defaultTTL = 30000) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return null
    }

    // Actualizar LRU
    item.lastAccessed = Date.now()
    return item.value
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiry = Date.now() + ttl

    if (this.cache.size >= this.maxSize) {
      // Evict least recently used
      let oldestKey = null
      let oldestTime = Date.now()

      for (const [k, v] of this.cache) {
        if (v.lastAccessed < oldestTime) {
          oldestTime = v.lastAccessed
          oldestKey = k
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      value,
      expiry,
      lastAccessed: Date.now()
    })
  }

  clear() {
    this.cache.clear()
  }

  delete(key) {
    return this.cache.delete(key)
  }

  has(key) {
    const item = this.cache.get(key)
    if (!item) return false

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return false
    }

    return true
  }
}

// Instancia global del cache
export const cache = new SmartCache()

// Wrapper para operaciones con retry y cache
class SupabaseService {
  constructor() {
    this.maxRetries = 3
    this.retryDelay = 1000
  }

  isTransientError(error) {
    if (!error) return false

    const transientStatus = [502, 503, 504]
    if (transientStatus.includes(error.status)) return true

    const message = (error.message || '').toLowerCase()
    return message.includes('network') || message.includes('fetch') || message.includes('timeout')
  }

  async withRetry(operation, context = '') {
    let lastError

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        const shouldRetry = this.isTransientError(error)

        if (!shouldRetry || attempt === this.maxRetries) {
          console.error(`Operation failed after ${this.maxRetries} attempts${context ? ` in ${context}` : ''}:`, error)
          throw error
        }

        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1)
        console.warn(`Attempt ${attempt} failed${context ? ` in ${context}` : ''}, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }

  async cachedQuery(key, queryFn, ttl = 30000, force = false) {
    if (!force && cache.has(key)) {
      return cache.get(key)
    }

    const result = await this.withRetry(queryFn, `cached query ${key}`)
    cache.set(key, result, ttl)
    return result
  }

  invalidateCache(pattern = null) {
    if (pattern) {
      // Invalidate by pattern (simple string matching)
      for (const key of cache.cache.keys()) {
        if (key.includes(pattern)) {
          cache.delete(key)
        }
      }
    } else {
      cache.clear()
    }
  }
}

// Instancia global del servicio
export const supabaseService = new SupabaseService()

// Función helper para sanitizar queries
export const sanitizeQuery = (query) => {
  if (typeof query === 'string') {
    return sanitizeInput(query)
  }
  if (typeof query === 'object' && query !== null) {
    const sanitized = {}
    for (const [key, value] of Object.entries(query)) {
      sanitized[key] = typeof value === 'string' ? sanitizeInput(value) : value
    }
    return sanitized
  }
  return query
}

const createTimedAbort = (timeoutMs = 5000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  return {
    controller,
    clear: () => clearTimeout(timer)
  }
}

// Health check del servicio (HEAD liviano, sin lógica de negocio)
export const healthCheck = async (timeoutMs = 4000) => {
  const startedAt = performance.now()
  const { controller, clear } = createTimedAbort(timeoutMs)
  try {
    const { error } = await supabase
      .from('user_features') // tabla liviana
      .select('user_id', { head: true, limit: 1 })
      .abortSignal(controller.signal)

    clear()
    const latency = Math.round(performance.now() - startedAt)

    return {
      healthy: !error,
      timestamp: new Date().toISOString(),
      latencyMs: latency,
      error: error?.message
    }
  } catch (error) {
    clear()
    const latency = Math.round(performance.now() - startedAt)
    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      latencyMs: latency,
      error: error.message
    }
  }
}

const TELEMETRY_AUTH_STATE = {
  initialized: false,
  session: null,
  user: null
}

const RECENT_METRIC_KEYS = new Map()
const METRIC_DEDUPE_WINDOW_MS = 2000
const AUTH_PERMISSION_ERROR_CODES = new Set(['401', '403', '42501'])

const hasAuthenticatedSession = (session) => Boolean(session?.user)

export const setTelemetryAuthState = (state = {}) => {
  const { initialized, session, user } = state
  if (typeof initialized === 'boolean') {
    TELEMETRY_AUTH_STATE.initialized = initialized
  }
  if (Object.prototype.hasOwnProperty.call(state, 'session')) {
    TELEMETRY_AUTH_STATE.session = session || null
  }
  if (Object.prototype.hasOwnProperty.call(state, 'user')) {
    TELEMETRY_AUTH_STATE.user = user || null
  }
}

export const safeLogMetric = async (payload, options = {}) => {
  const authReady = options.authReady ?? TELEMETRY_AUTH_STATE.initialized
  const session = options.session ?? TELEMETRY_AUTH_STATE.session

  if (!authReady || !hasAuthenticatedSession(session)) return

  const dedupeKey = options.dedupeKey
  if (dedupeKey) {
    const nowTs = Date.now()
    const lastSentAt = RECENT_METRIC_KEYS.get(dedupeKey) || 0
    if (nowTs - lastSentAt < METRIC_DEDUPE_WINDOW_MS) return
    RECENT_METRIC_KEYS.set(dedupeKey, nowTs)
  }

  try {
    await supabase.rpc('log_metric', payload)
  } catch (e) {
    if (import.meta.env.DEV) {
      const code = String(e?.code || e?.status || '')
      const message = e?.message || e
      const reason = AUTH_PERMISSION_ERROR_CODES.has(code) ? `auth/permission ${code}` : 'best-effort failure'
      console.warn('[metrics] log_metric skipped/failed', reason, message)
    }
  }
}

export const instrumentRpc = async (rpcName, args = {}, metaContext = {}, options = {}) => {
  const now = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  )
  const startedAt = now()
  let query = supabase.rpc(rpcName, args)
  if (options?.signal) {
    query = query.abortSignal(options.signal)
  }
  const { data, error } = await query
  const durationMs = Math.round(now() - startedAt)

  const skipInstrumentation = ['log_metric', 'log_system_metric', 'log_health_probe'].includes(rpcName)
  if (skipInstrumentation) {
    return { data, error, durationMs }
  }

  void safeLogMetric({
    p_op: `rpc.${rpcName}`,
    p_ok: !error,
    p_duration_ms: durationMs,
    p_screen: null,
    p_error_code: error ? String(error.code || error.message || 'rpc_error').slice(0, 180) : null,
    p_meta: metaContext || {}
  })

  return { data, error, durationMs }
}
