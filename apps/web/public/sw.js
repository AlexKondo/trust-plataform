/**
 * IP-022 — Service Worker mínimo para instalabilidade PWA e uso em campo.
 * Escopo deliberadamente pequeno (a IP pede "opcionalmente PWA", sem sync offline complexo):
 *  - cache-first para assets estáticos (ícones, manifest, offline.html, build hashed assets);
 *  - network-first para navegação/API, com fallback para `offline.html` só quando a rede
 *    falhar de verdade (nunca serve uma resposta de API cacheada como se fosse fresca —
 *    dados de pedido/pagamento não podem ficar obsoletos silenciosamente em campo).
 * Não há fila de retry/sync em background aqui: o retry de mutações fica em `lib/api.ts`
 * (bounded, só para chamadas explicitamente marcadas como seguras para repetir).
 */
const CACHE_VERSION = 'trust-shell-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PRECACHE_URLS = ['/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('trust-shell-') && key !== STATIC_CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    // Mutações (check-in, evidência, pause...) nunca passam pelo SW: sempre vão direto
    // à rede, para não arriscar responder algo cacheado/errado a um POST.
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isStaticAsset(url)) {
    // Cache-first: hashed build assets e ícones não mudam sem mudar de nome.
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })),
    );
    return;
  }

  // Network-first para navegação/páginas e chamadas de API: nunca serve dado obsoleto
  // silenciosamente, só cai para o fallback offline quando a rede falha de fato.
  event.respondWith(
    fetch(request).catch(() => {
      if (request.mode === 'navigate') {
        return caches.match('/offline.html');
      }
      return Response.error();
    }),
  );
});
