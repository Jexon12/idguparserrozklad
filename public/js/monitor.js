(function () {
    const MAX_EVENTS = 30;
    let sent = 0;

    function post(type, payload) {
        if (sent >= MAX_EVENTS) return;
        sent += 1;
        const body = JSON.stringify({
            type,
            payload,
            page: location.pathname,
            ts: new Date().toISOString()
        });
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/monitor/log', new Blob([body], { type: 'application/json' }));
                return;
            }
        } catch (e) { /* ignore */ }

        fetch('/api/monitor/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        }).catch(() => {});
    }

    window.addEventListener('error', (ev) => {
        post('frontend_error', {
            message: ev.message,
            file: ev.filename,
            line: ev.lineno,
            col: ev.colno
        });
    });

    window.addEventListener('unhandledrejection', (ev) => {
        post('frontend_rejection', {
            reason: String(ev.reason || 'unknown')
        });
    });

    window.addEventListener('load', () => {
        const nav = performance.getEntriesByType('navigation')[0];
        post('frontend_perf', {
            dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
            load: nav ? Math.round(nav.loadEventEnd) : null
        });
    });
})();

