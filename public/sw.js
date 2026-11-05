// Service Worker para PWA da Scaglioni Joias.
// Garante atualização imediata (skipWaiting + clients.claim) e expurgo de qualquer cache antigo.
const CACHE_NAME = 'scaglioni-cache-v3'
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  // Força ativação imediata sem esperar fechamento das abas abertas
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {})
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // Exclui TODOS os caches anteriores
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        )
      })
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  // Ignora requisições de API, PocketBase ou esquemas não-http
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith('http') ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('/backend/')
  ) {
    return
  }

  const url = new URL(event.request.url)

  // Documentos HTML (navegação e /index.html): NUNCA serve do cache, sempre rede
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).catch(() => {
        return caches.match('/index.html') || new Response('Offline', { status: 503 })
      }),
    )
    return
  }

  // Assets estáticos imutáveis com hash ou ícones
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          // Apenas assets de imagem/ícones são armazenados no cache estático
          if (url.pathname.startsWith('/assets/') || STATIC_ASSETS.includes(url.pathname)) {
            const responseToCache = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' })
        })
      }),
  )
})
