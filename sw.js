const CACHE_VERSION = 'v31';
const CACHE_PREFIX = 'service-approval-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const LEGACY_PREFIXES = ['service-approval-mobile-', 'service-approval-main-'];
const BASE_URL = new URL('./', self.location.href);
const inScope = path => new URL(path, BASE_URL).href;

// 只快取程式本身，不快取使用者輸入的核定內容。
const APP_SHELL = [
  inScope('./'),
  inScope('./index.html'),
  inScope('./styles.css?v=30'),
  inScope('./app.js?v=30'),
  inScope('./manifest.webmanifest'),
  inScope('./icon.svg'),
  inScope('./icon-180.png'),
  inScope('./icon-192.png'),
  inScope('./icon-512.png'),
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      const isOldPwa = key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME;
      const isLegacy = LEGACY_PREFIXES.some(prefix => key.startsWith(prefix));
      return (isOldPwa || isLegacy) ? caches.delete(key) : Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cloudflare Analytics 等第三方請求不攔截；離線時失敗也不影響工具本身。
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // HTML 採 network-first：有網路優先拿新版，離線才回退到快取的 App Shell。
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(inScope('./index.html'), response.clone());
        }
        return response;
      } catch (_) {
        return (
          await caches.match(inScope('./index.html')) ||
          await caches.match(inScope('./'))
        );
      }
    })());
    return;
  }

  // 版本化的 CSS / JS / 圖示採 cache-first；新版部署後由新 SW 建立新快取。
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      // 無快取且離線時讓瀏覽器正常回報資源失敗；核心 App Shell 已預先快取。
      return Response.error();
    }
  })());
});
