// Offline support: keeps a copy of the app's files on the phone. Raise VERSION whenever a file
// changes, so phones pick up the new version the next time the app opens.

const VERSION = 'v2';
const CACHE = `fitness-tracker-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'vendor/preact-htm.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/db.js',
  'js/domain.js',
  'js/seed.js',
  'js/repo.js',
  'js/ai.js',
  'js/backup.js',
  'js/ui/state.js',
  'js/ui/timer.js',
  'js/ui/kit.js',
  'js/ui/charts.js',
  'js/ui/today.js',
  'js/ui/workout.js',
  'js/ui/food.js',
  'js/ui/progress.js',
  'js/ui/photos.js',
  'js/ui/settings.js',
  'js/ui/setup.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The app's own files come from the cache, so it opens offline. Anything else (OpenAI) goes to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true })
      ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  })());
});
