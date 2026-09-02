/** Reliability helpers shared by the browser app and tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.ScheduleApp = root.ScheduleApp || {};
        root.ScheduleApp.Reliability = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const ERROR_LOG_KEY = 'schedule_client_errors_v1';

    const validateDateRange = (startValue, endValue, maxDays = 62) => {
        const start = new Date(`${startValue}T12:00:00`);
        const end = new Date(`${endValue}T12:00:00`);
        if (!startValue || !endValue || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return { valid: false, reason: 'Оберіть коректні дати', days: 0 };
        }
        const days = Math.floor((end - start) / 86400000) + 1;
        if (days < 1) return { valid: false, reason: 'Дата завершення має бути не раніше початку', days };
        if (days > maxDays) return { valid: false, reason: `Оберіть період не більше ${maxDays} днів`, days };
        return { valid: true, reason: '', days };
    };

    const sanitizeSchedule = (value, maxRows = 10000) => {
        if (!Array.isArray(value)) return { valid: false, rows: [], rejected: 1, reason: 'API повернув не список занять' };
        let rejected = 0;
        const rows = value.slice(0, maxRows).filter((row) => {
            const valid = row && typeof row === 'object' && !Array.isArray(row) &&
                typeof row.full_date === 'string' && typeof row.discipline === 'string';
            if (!valid) rejected += 1;
            return valid;
        });
        if (value.length > maxRows) rejected += value.length - maxRows;
        return { valid: rejected === 0, rows, rejected, reason: rejected ? `Відхилено пошкоджених записів: ${rejected}` : '' };
    };

    const readErrorLog = (storage) => {
        try {
            const parsed = JSON.parse(storage?.getItem(ERROR_LOG_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    };

    const recordClientError = (error, context = 'app', storage = typeof localStorage !== 'undefined' ? localStorage : null) => {
        if (!storage) return [];
        const entry = {
            at: new Date().toISOString(),
            context: String(context || 'app').slice(0, 80),
            message: String(error?.message || error || 'Unknown error').slice(0, 500),
            stack: String(error?.stack || '').slice(0, 1500)
        };
        const log = [entry, ...readErrorLog(storage)].slice(0, 100);
        try { storage.setItem(ERROR_LOG_KEY, JSON.stringify(log)); } catch (_) { /* storage unavailable */ }
        return log;
    };

    const installGlobalErrorLogging = (target = typeof window !== 'undefined' ? window : null) => {
        if (!target || target.__scheduleErrorLoggingInstalled) return;
        target.__scheduleErrorLoggingInstalled = true;
        target.addEventListener('error', (event) => recordClientError(event.error || event.message, 'window.error'));
        target.addEventListener('unhandledrejection', (event) => recordClientError(event.reason, 'unhandledrejection'));
    };

    return { ERROR_LOG_KEY, validateDateRange, sanitizeSchedule, readErrorLog, recordClientError, installGlobalErrorLogging };
});
