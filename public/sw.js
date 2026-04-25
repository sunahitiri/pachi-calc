// pachi-calc Service Worker
// BUILD_ID は vite.config.js の build hook で自動置換される。
// ビルド毎に値が変わるため、デプロイ後はこのファイル自体の内容差分が
// 発生 → ブラウザが新 SW をインストール → controllerchange でクライアントが
// リロードする仕組み。
const BUILD_ID = '__BUILD_ID__';
const RUNTIME_CACHE = `pachi-calc-runtime-${BUILD_ID}`;

self.addEventListener('install', () => {
  // 旧 SW を待たずに即時 active 化
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 古いビルドのキャッシュを破棄
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== RUNTIME_CACHE).map((n) => caches.delete(n)),
      );
      // 既存タブにも即時に制御を奪う (controllerchange トリガー)
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML ナビゲーションはネットワークファースト (常に最新を試行)
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: 'no-store' });
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          // オフライン時はキャッシュにフォールバック
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
          return new Response('オフラインです', { status: 503 });
        }
      })(),
    );
    return;
  }

  // ハッシュ付きアセット (Vite の /assets/) はキャッシュファースト (immutable)
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      })(),
    );
  }
  // それ以外はブラウザ標準動作
});
