/**
 * Service Worker — Painel do Colaborador (Sitio Labareda)
 * Estrategia: Cache-first para assets estaticos, network-first para API.
 * Fila offline para acoes pendentes (conclusao de itens).
 */

const CACHE_NAME = 'labareda-painel-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/* ------------------------------------------------------------------ */
/*  INSTALL — pre-cache dos assets estaticos                          */
/* ------------------------------------------------------------------ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ------------------------------------------------------------------ */
/*  ACTIVATE — limpar caches antigos                                  */
/* ------------------------------------------------------------------ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ------------------------------------------------------------------ */
/*  FETCH — cache-first para estaticos, network-first para API        */
/* ------------------------------------------------------------------ */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Fontes do Google — cache-first com fallback de rede
  if (FONT_ORIGINS.some((origin) => url.origin === origin)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Requisicoes API (supabase, n8n) — network-first
  if (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/storage/') ||
    url.pathname.includes('/webhook/')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets estaticos — cache-first
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback para navegacao — servir index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        })
    )
  );
});

/* ------------------------------------------------------------------ */
/*  SYNC — sincronizar acoes pendentes quando voltar online           */
/* ------------------------------------------------------------------ */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pendentes') {
    event.respondWith(syncPendentes());
  }
});

async function syncPendentes() {
  // A logica de sync fica no app.js via postMessage.
  // O SW apenas dispara o evento para os clients.
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_PENDENTES' });
  });
}

/* ------------------------------------------------------------------ */
/*  MESSAGE — comunicacao com o app                                   */
/* ------------------------------------------------------------------ */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
