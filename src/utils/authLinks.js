const exchangeByCode = new Map()

export const getAuthLinkParams = () => {
  const queryParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return {
    code: queryParams.get('code') || hashParams.get('code'),
    type: queryParams.get('type') || hashParams.get('type'),
    tokenHash: queryParams.get('token_hash') || hashParams.get('token_hash'),
    accessToken: queryParams.get('access_token') || hashParams.get('access_token'),
    refreshToken: queryParams.get('refresh_token') || hashParams.get('refresh_token'),
    error: queryParams.get('error') || hashParams.get('error'),
    errorCode: queryParams.get('error_code') || hashParams.get('error_code'),
    errorDescription: queryParams.get('error_description') || hashParams.get('error_description')
  }
}

export const getAuthLinkErrorMessage = ({ error, errorCode, errorDescription }) => {
  if (!error && !errorCode && !errorDescription) return ''

  const rawMessage = `${error || ''} ${errorCode || ''} ${errorDescription || ''}`.toLowerCase()
  if (
    rawMessage.includes('expired') ||
    rawMessage.includes('otp_expired') ||
    rawMessage.includes('invalid') ||
    rawMessage.includes('access_denied')
  ) {
    return 'El enlace es inválido, expiró o ya fue usado. Pedí uno nuevo.'
  }

  return errorDescription || 'No se pudo validar el enlace. Intentá nuevamente.'
}

export const exchangeCodeForSessionOnce = (supabase, code) => {
  if (!code) {
    return Promise.resolve({ error: null })
  }

  if (!exchangeByCode.has(code)) {
    exchangeByCode.set(
      code,
      supabase.auth.exchangeCodeForSession(code).finally(() => {
        window.setTimeout(() => exchangeByCode.delete(code), 30000)
      })
    )
  }

  return exchangeByCode.get(code)
}

export const clearAuthLinkFromUrl = () => {
  const cleanUrl = `${window.location.origin}${window.location.pathname}`
  window.history.replaceState({}, document.title, cleanUrl)
}
