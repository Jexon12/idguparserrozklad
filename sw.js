const CACHE_NAME = 'schedule-v60';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/index2.html',
    '/session.html',
    '/staff.html',
    '/session-admin.html',
    '/css/tailwind.generated.css',
    '/css/styles.css',
    '/js/utils.js',
    '/js/app-shell.js',
    '/js/staff-portal.js',
    '/js/schedule-model.js',
    '/js/reliability.js',
    '/js/components/schedule-status-badges.js',
    '/js/components/app-modal-shell.js',
    '/js/schedule-analytics.js',
    '/js/session-import.js',
    '/js/schedule-catalog.js',
    '/js/api.js',
    '/js/search.js',
    '/js/occupancy.js',
    '/js/workers/occupancy-worker.js',
    '/js/notes.js',
    '/js/admin.js',
    '/js/app.js',
    '/js/session-page.js',
    '/js/session-admin.js',
    '/data/session-2025-26.json',
    '/data/demo-schedule.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

// Network-first only for known same-origin static assets. API responses and
// generated downloads must never accumulate in Cache Storage.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    const isStatic = STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/');
    if (!isStatic) return;

    event.respondWith(
        fetch(event.request)
            .then(async (response) => {
                if (response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(url.pathname, response.clone());
                }
                return response;
            })
            .catch(() => caches.match(url.pathname))
    );
});
