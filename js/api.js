/**
 * Schedule Viewer - API Layer
 * Handles all communication with the backend proxy.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    const inflight = new Map();
    const memoryCache = new Map();
    const CACHE_TTL_MS = 60 * 1000;
    const MAX_CACHE_ENTRIES = 200;

    const getCacheKey = (urlObj) => urlObj.toString().replace(/([?&])_=\d+/, '$1_=');

    const getCached = (key) => {
        const hit = memoryCache.get(key);
        if (!hit) return null;
        if (Date.now() > hit.expiresAt) {
            memoryCache.delete(key);
            return null;
        }
        return hit.value;
    };

    const setCached = (key, value) => {
        while (memoryCache.size >= MAX_CACHE_ENTRIES) {
            memoryCache.delete(memoryCache.keys().next().value);
        }
        memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    };

    /**
     * Fetch data from the schedule API via the proxy.
     * @param {string} action - API action name (e.g., 'GetScheduleDataX')
     * @param {Object} params - Query parameters
     * @param {Object} options - { silent: boolean } suppress error alerts
     * @returns {Promise<any>} Parsed response data
     */
    SA.fetchApi = async (action, params = {}, options = {}) => {
        const url = new URL(SA.API_PROXY + action, window.location.origin);

        url.searchParams.append('aVuzID', SA.VUZ_ID);

        if (action === 'GetStudyGroups') {
            url.searchParams.append('aGiveStudyTimes', 'false');
        } else if (!action.startsWith('GetScheduleData') && action !== 'GetEmployees') {
            url.searchParams.append('aGiveStudyTimes', 'true');
        }

        // #12: Removed stale JSONP callback param - we use plain fetch, not script injection
        url.searchParams.append('_', Date.now()); // cache-buster only

        // Add remaining params, quoting string values for the API
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null || value === '') {
                url.searchParams.append(key, '');
            } else if (typeof value === 'string' && !value.startsWith('"')) {
                url.searchParams.append(key, `"${value}"`);
            } else {
                url.searchParams.append(key, value);
            }
        }

        const dedupeKey = getCacheKey(url);
        if (options.useCache !== false) {
            const cached = getCached(dedupeKey);
            if (cached !== null) {
                SA.DataFreshness?.mark('cache');
                return cached;
            }
        }

        const runRequest = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            try {
                const res = await fetch(url, { signal: controller.signal });
                const text = await res.text();

                if (!res.ok) {
                    let message = text || `HTTP ${res.status}`;
                    try {
                        const errorBody = JSON.parse(text);
                        message = errorBody.error || message;
                    } catch (_) { /* keep response text */ }
                    const error = new Error(message);
                    error.status = res.status;
                    throw error;
                }

                // Parse potential JSONP wrapper: callbackName( { ... } )
                let json;
                const jsonpMatch = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
                if (jsonpMatch) {
                    json = JSON.parse(jsonpMatch[1]);
                } else {
                    json = JSON.parse(text);
                }

                const data = Object.prototype.hasOwnProperty.call(json || {}, 'd') ? json.d : json;
                if (options.useCache !== false) {
                    setCached(dedupeKey, data);
                }
                SA.DataFreshness?.mark('api');
                return data;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        try {
            if (inflight.has(dedupeKey)) {
                return await inflight.get(dedupeKey);
            }

            const p = runRequest().finally(() => inflight.delete(dedupeKey));
            inflight.set(dedupeKey, p);
            return await p;
        } catch (e) {
            SA.DataFreshness?.mark(navigator.onLine ? 'error' : 'offline');
            if (!options.silent) {
                console.error('API Error:', action, e);
                // Use a global error handler if provided
                if (SA._onError) SA._onError('Помилка завантаження даних. Спробуйте оновити сторінку.');
            }
            return null;
        }
    };
})(window.ScheduleApp);
