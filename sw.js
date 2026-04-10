const CACHE_NAME = 'schedule-v23';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/index2.html',
    '/session.html',
    '/css/tailwind.generated.css',
    '/css/styles.css',
    '/js/utils.js',
    '/js/api.js',
    '/js/search.js',
    '/js/occupancy.js',
    '/js/workers/occupancy-worker.js',
    '/js/notes.js',
    '/js/admin.js',
    '/js/app.js',
    '/js/session-page.js',
    '/data/session-2025-26.json'
];

// Install - cache static assets, then activate immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting()) // #18: skipWaiting only after assets cached
    );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim()) // #23: clients.claim inside waitUntil
    );
});

// Fetch - Network-first for everything (ensures latest files are always served)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful GET responses
                if (event.request.method === 'GET' && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
















