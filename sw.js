const CACHE_NAME = 'schedule-8769cd923a8d';
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
    '/js/lesson-numbering.js',
    '/js/app-shell.js',
    '/js/staff-portal.js',
    '/js/schedule-model.js',
    '/js/reliability.js',
    '/js/components/schedule-status-badges.js',
    '/js/components/app-modal-shell.js',
    '/js/schedule-analytics.js',
    '/js/session-import.js',
    '/js/session-domain.js',
    '/js/workers/session-conflicts-worker.js',
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
            .then((cache) => cache.addAll([...new Set([...STATIC_ASSETS, ...VERSIONED_ASSETS])]))
    );
});
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key.startsWith('schedule-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

const VERSIONED_ASSETS = [
  "/css/campus.css?v=b3bd24e84eff",
  "/css/styles.css?v=ba40711332ed",
  "/css/tailwind.generated.css?v=a35e94436fcc",
  "/css/ui-kit.css?v=b0580bc1a952",
  "/js/admin.js?v=aa2eeae6d900",
  "/js/api.js?v=98d2faac2c8d",
  "/js/app-shell.js?v=b5cbf8bdc9a7",
  "/js/app-updates.js?v=759bcf41962e",
  "/js/app.js?v=f9b40f241bcf",
  "/js/builder.js?v=e134a26545ac",
  "/js/campus-schedule.js?v=4546cf9912f2",
  "/js/components/app-modal-shell.js?v=1d43109ecd59",
  "/js/components/current-lesson-banner.js?v=24bb9ebcc3cc",
  "/js/components/schedule-status-badges.js?v=050e17e61698",
  "/js/course-live.js?v=7ab16bdb51ef",
  "/js/i18n.js?v=6a86b9c091b8",
  "/js/lesson-numbering.js?v=6b98381091bd",
  "/js/monitor.js?v=b3abc3883244",
  "/js/notes.js?v=1fa00ed3dbcf",
  "/js/occupancy.js?v=0cf19107a717",
  "/js/personal-data.js?v=88a1f71d733e",
  "/js/reliability.js?v=8919b07a36bd",
  "/js/schedule-analytics.js?v=49e3959d2d38",
  "/js/schedule-catalog.js?v=8a290252c5ad",
  "/js/schedule-model.js?v=db7f6f2c8ceb",
  "/js/search.js?v=103e7bdf53fa",
  "/js/session-admin.js?v=ca7cb5ab61be",
  "/js/session-calendar.js?v=eb890fbabe56",
  "/js/session-constructor.js?v=9bd1db408fa9",
  "/js/session-domain.js?v=5d3f5b9a04a6",
  "/js/session-import-preview.js?v=92c520c7c86b",
  "/js/session-import-ui.js?v=06fcc8d39daa",
  "/js/session-import.js?v=3dd1ff1cef17",
  "/js/session-page.js?v=0b3322e3a0e7",
  "/js/session-workspace.js?v=59deda4537d9",
  "/js/staff-client.js?v=c322f1f46b55",
  "/js/staff-portal.js?v=36b36c88f7ad",
  "/js/staff-settings.js?v=46e1d84e12ce",
  "/js/utils.js?v=46456b71272e",
  "/js/vendor/jszip.min.js?v=acc7e41455a8",
  "/js/vendor/lucide.min.js?v=3411692820cb",
  "/js/vendor/vercel-analytics.mjs?v=c3026b63c92a",
  "/js/vendor/vue.global.prod.js?v=4963101441de",
  "/js/web-analytics.js?v=b852ccdc0a1d",
  "/js/week-planner.js?v=a5ff12f18152"
];

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
                    try {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(event.request, response.clone());
                    } catch (_) { /* Storage quota must not break an online response. */ }
                }
                return response;
            })
            .catch(async () => {
                const cache = await caches.open(CACHE_NAME);
                const exact = await cache.match(event.request);
                const navigation = event.request.mode === 'navigate' ? await cache.match(url.pathname) : null;
                return exact || navigation || new Response('Offline: resource not cached', { status: 503 });
            })
    );
});
