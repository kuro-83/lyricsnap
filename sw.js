// ================================================
// LyricSnap — Service Worker
// PWAオフラインキャッシュ戦略
// ================================================

const CACHE_NAME = 'lyricsnap-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './modules/ocr.js',
  './modules/lyrics.js',
  './modules/storage.js',
  './modules/ui.js',
  './assets/favicon.svg',
  './manifest.json',
];

// Google Fonts のキャッシュ名（別管理）
const FONT_CACHE_NAME = 'lyricsnap-fonts-v1';

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== FONT_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// フェッチ: Network First for API, Cache First for Assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API リクエスト → Network Only（キャッシュしない）
  if (
    url.hostname === 'lrclib.net' ||
    url.hostname === 'api.lyrics.ovh' ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google Fonts → Cache First (Stale While Revalidate)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetched;
        });
      })
    );
    return;
  }

  // 静的アセット → Cache First, Network Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
