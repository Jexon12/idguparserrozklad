/**
 * Schedule Viewer - API Layer
 * Handles all communication with the backend proxy.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    const inflight = new Map();
    const latestControllers = new Map();
    const memoryCache = new Map();
    const CACHE_TTL_MS = 60 * 1000;
    const SCHEDULE_CACHE_TTL_MS = 15 * 60 * 1000;
    const MAX_CACHE_ENTRIES = 200;
    SA.ApiMetrics = SA.ApiMetrics || { networkRequests: 0, cacheHits: 0, retries: 0 };
    const saveMetrics = () => {
        try { localStorage.setItem('schedule_api_metrics_v1', JSON.stringify({ ...SA.ApiMetrics, at: new Date().toISOString() })); } catch (_) { /* optional */ }
    };

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

    const cacheStorageKey = (key) => {
        let hash = 2166136261;
        for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
        return `schedule_request_cache_v1_${hash >>> 0}`;
    };

    const getPersistentCached = (key) => {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(cacheStorageKey(key)) || 'null');
            if (!parsed || Date.now() > parsed.expiresAt) return null;
            return parsed.value;
        } catch (_) { return null; }
    };

    const setCached = (key, value, persistent = false) => {
        while (memoryCache.size >= MAX_CACHE_ENTRIES) {
            memoryCache.delete(memoryCache.keys().next().value);
        }
        const expiresAt = Date.now() + (persistent ? SCHEDULE_CACHE_TTL_MS : CACHE_TTL_MS);
        memoryCache.set(key, { value, expiresAt });
        if (persistent) {
            try { sessionStorage.setItem(cacheStorageKey(key), JSON.stringify({ value, expiresAt })); } catch (_) { /* cache is optional */ }
        }
    };

    const shouldRetry = (error) => !error || !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        const isScheduleRequest = action.startsWith('GetScheduleData');
        if (options.useCache !== false) {
            const cached = getCached(dedupeKey) ?? (isScheduleRequest ? getPersistentCached(dedupeKey) : null);
            if (cached !== null) {
                SA.ApiMetrics.cacheHits += 1;
                saveMetrics();
                SA.DataFreshness?.mark('cache');
                return cached;
            }
        }

        const runRequest = async () => {
            SA.ApiMetrics.networkRequests += 1;
            saveMetrics();
            const controller = new AbortController();
            if (options.latestKey) {
                latestControllers.get(options.latestKey)?.abort();
                latestControllers.set(options.latestKey, controller);
            }
            const abortFromCaller = () => controller.abort();
            options.signal?.addEventListener?.('abort', abortFromCaller, { once: true });
            const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
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

                let data = Object.prototype.hasOwnProperty.call(json || {}, 'd') ? json.d : json;
                if (isScheduleRequest && SA.Reliability) {
                    const checked = SA.Reliability.sanitizeSchedule(data);
                    if (!checked.valid && checked.rows.length === 0 && (!Array.isArray(data) || data.length > 0)) {
                        const error = new Error(checked.reason || 'Invalid schedule data');
                        error.status = 502;
                        throw error;
                    }
                    if (checked.rejected) SA.Reliability.recordClientError(checked.reason, `api.${action}.validation`);
                    data = checked.rows;
                }
                if (options.useCache !== false) {
                    setCached(dedupeKey, data, isScheduleRequest);
                }
                SA.DataFreshness?.mark('api');
                SA.lastApiFailure = null;
                return data;
            } finally {
                clearTimeout(timeoutId);
                options.signal?.removeEventListener?.('abort', abortFromCaller);
                if (options.latestKey && latestControllers.get(options.latestKey) === controller) latestControllers.delete(options.latestKey);
            }
        };

        const runWithRetry = async () => {
            const retries = Number.isInteger(options.retries) ? options.retries : 2;
            let lastError;
            for (let attempt = 0; attempt <= retries; attempt++) {
                try { return await runRequest(); } catch (error) {
                    lastError = error;
                    if (error?.name === 'AbortError' || attempt >= retries || !shouldRetry(error)) throw error;
                    SA.ApiMetrics.retries += 1;
                    saveMetrics();
                    await wait((options.retryDelayMs ?? 250) * (2 ** attempt));
                }
            }
            throw lastError;
        };

        try {
            if (inflight.has(dedupeKey)) {
                return await inflight.get(dedupeKey);
            }

            const p = runWithRetry().finally(() => inflight.delete(dedupeKey));
            inflight.set(dedupeKey, p);
            return await p;
        } catch (e) {
            if (e?.name === 'AbortError' && options.latestKey) return null;
            const online = typeof navigator === 'undefined' ? true : navigator.onLine;
            SA.lastApiFailure = { kind: online ? 'api-error' : 'offline', action, message: e?.message || String(e), at: Date.now() };
            SA.Reliability?.recordClientError(e, `api.${action}`);
            SA.DataFreshness?.mark(online ? 'error' : 'offline');
            if (!options.silent) {
                console.error('API Error:', action, e);
                // Use a global error handler if provided
                if (SA._onError) SA._onError(online
                    ? 'API розкладу тимчасово недоступний. Запит повторено автоматично — спробуйте ще раз пізніше.'
                    : 'Немає інтернету. Показуємо збережені дані, якщо вони доступні.');
            }
            return null;
        }
    };
})(window.ScheduleApp);
