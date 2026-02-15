const CACHE_NAME = 'schedule-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/utils.js',
    '/js/api.js',
    '/js/search.js',
    '/js/occupancy.js',
    '/js/notes.js',
    '/js/admin.js',
    '/js/app.js'
];

// Install — cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — Network-first for everything (ensures latest files are always served)
self.addEventListener('fetch', (event) => {
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
