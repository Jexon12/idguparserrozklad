/**
 * Schedule Viewer — API Layer
 * Handles all communication with the backend proxy.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
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

        const callbackName = 'jsonp' + Date.now();
        url.searchParams.append('callback', callbackName);
        url.searchParams.append('_', Date.now());

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

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            const text = await res.text();

            // Parse potential JSONP wrapper: callbackName( { ... } )
            let json;
            const jsonpMatch = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
            if (jsonpMatch) {
                json = JSON.parse(jsonpMatch[1]);
            } else {
                json = JSON.parse(text);
            }

            return json.d || json;
        } catch (e) {
            if (!options.silent) {
                console.error('API Error:', action, e);
                // Use a global error handler if provided
                if (SA._onError) SA._onError('Помилка завантаження даних. Спробуйте оновити сторінку.');
            }
            return null;
        }
    };
})(window.ScheduleApp);
