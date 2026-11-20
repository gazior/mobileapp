'use strict';

const CORE_CACHE = 'przepisy-core-v2';
const IMAGES_CACHE = 'przepisy-images-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/recipes.json',
  './data/recipes.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

let isCachingImages = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CORE_CACHE && k !== IMAGES_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function broadcast(payload) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(payload);
  }
}

async function getRecipeImageUrls() {
  const cache = await caches.open(CORE_CACHE);
  let res = await cache.match('./data/recipes.json');
  if (!res) {
    res = await fetch('./data/recipes.json');
    if (res.ok) {
      await cache.put('./data/recipes.json', res.clone());
    }
  }
  const data = await res.json();
  const urls = (data.recipes || [])
    .map((r) => (r.image ? `./${r.image.replace(/^\.\//, '')}` : null))
    .filter(Boolean);
  return [...new Set(urls)];
}

async function getOfflineStatus() {
  try {
    const urls = await getRecipeImageUrls();
    const imgCache = await caches.open(IMAGES_CACHE);
    let cached = 0;
    for (const url of urls) {
      const hit = await imgCache.match(url);
      if (hit) cached += 1;
    }
    return { cached, total: urls.length, done: cached >= urls.length && urls.length > 0 };
  } catch (_) {
    return { cached: 0, total: 0, done: false };
  }
}

async function cacheAllImagesInBatches() {
  if (isCachingImages) return;
  isCachingImages = true;
  try {
    const urls = await getRecipeImageUrls();
    const imgCache = await caches.open(IMAGES_CACHE);
    const total = urls.length;
    const missing = [];
    let cached = 0;

    for (const url of urls) {
      const hit = await imgCache.match(url);
      if (hit) {
        cached += 1;
      } else {
        missing.push(url);
      }
    }

    await broadcast({
      type: 'OFFLINE_PROGRESS',
      cached,
      total,
      done: missing.length === 0,
      syncing: missing.length > 0,
    });
    if (missing.length === 0) return;

    const BATCH_SIZE = 8;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (url) => {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              await imgCache.put(url, resp);
              cached += 1;
            }
          } catch (_) {
            // Jeśli utracono sieć w trakcie, zachowaj dotychczasowy postęp
          }
        })
      );
      await broadcast({
        type: 'OFFLINE_PROGRESS',
        cached,
        total,
        done: cached >= total,
        syncing: cached < total && i + BATCH_SIZE < missing.length,
      });
    }
  } finally {
    isCachingImages = false;
    const finalStatus = await getOfflineStatus();
    await broadcast({ type: 'OFFLINE_PROGRESS', ...finalStatus, syncing: false });
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'CACHE_ALL_IMAGES') {
    event.waitUntil(cacheAllImagesInBatches());
  } else if (data.type === 'GET_OFFLINE_STATUS') {
    event.waitUntil(
      getOfflineStatus().then((status) =>
        broadcast({ type: 'OFFLINE_PROGRESS', ...status, syncing: isCachingImages })
      )
    );
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. Nawigacja strony (otwarcie ikony z ekranu głównego iPhone'a offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CORE_CACHE).then(async (cache) => {
        const cached = (await cache.match('./index.html')) || (await cache.match('./'));
        const networkFetch = fetch(req)
          .then((res) => {
            if (res.ok) {
              cache.put('./index.html', res.clone());
            }
            return res;
          })
          .catch(() => cached || new Response('Brak połączenia z internetem.', { status: 503 }));
        return cached || networkFetch;
      })
    );
    return;
  }

  // 2. Zdjęcia potraw — Cache-First (błyskawicznie z pamięci telefonu)
  if (url.pathname.includes('/images/')) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            cache.put(req, res.clone());
          }
          return res;
        } catch (_) {
          return new Response('', { status: 404 });
        }
      })
    );
    return;
  }

  // 3. Zasoby aplikacji i baza JSON — Stale-While-Revalidate
  event.respondWith(
    caches.open(CORE_CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached || new Response('', { status: 503 }));
      return cached || fetchPromise;
    })
  );
});
