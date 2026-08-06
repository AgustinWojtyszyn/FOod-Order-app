const CACHE_NAME = 'servifood-pwa-v3'
const APP_SHELL = [
  '/manifest.json',
  '/favicon.ico',
  '/icons/servifood-32.png',
  '/icons/servifood-48.png',
  '/icons/apple-touch-icon.png',
  '/icons/servifood-192.png',
  '/icons/servifood-512.png',
  '/icons/servifood-maskable-192.png',
  '/icons/servifood-maskable-512.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          return response
        })
        .catch(() => new Response('ServiFood no está disponible sin conexión. Volvé a intentar cuando tengas internet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }))
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request).then((response) => {
        const contentType = response.headers.get('content-type') || ''
        if (response.ok && !contentType.includes('text/html')) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      }).catch(() => caches.match(request))
    )
    return
  }

  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => (
        cached || fetch(request).then((response) => {
          const contentType = response.headers.get('content-type') || ''
          if (response.ok && !contentType.includes('text/html')) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
      ))
    )
  }
})
