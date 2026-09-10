// ================================================
// LyricSnap — Service Worker
// PWAオフラインキャッシュ戦略
// ================================================

const CACHE_NAME = 'lyricsnap-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './modules/auth.js',
  './modules/db.js',
  './modules/musicSearch.js',
  './modules/lyrics.js',
  './modules/ui.js',
  './assets/favicon.svg',
  './manifest.json',
];

// Google Fonts のキャッシュ名（別管理）
const FONT_CACHE_NAME = 'lyricsnap-fonts-v2';

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== FONT_CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// フェッチ戦略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 認証・DB・外部API・CDN → 常にネットワーク（キャッシュしない）
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.hostname === 'itunes.apple.com' ||
    url.hostname === 'lrclib.net' ||
    url.hostname === 'api.lyrics.ovh' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'accounts.google.com'
  ) {
    return; // デフォルト（ネットワーク）に委ねる
  }

  // Google Fonts → Stale While Revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetched = fetch(request).then((response) => {
            cache.put(request, response.clone());
            return response;
          });
          return cached || fetched;
        })
      )
    );
    return;
  }

  // 同一オリジンの静的アセット → Cache First, Network Fallback
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
