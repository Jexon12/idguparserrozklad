import { inject } from '/js/vendor/vercel-analytics.mjs?v=c3026b63c92a';

// Page visits only; schedule selections and URL parameters are not analytics data.
const localHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
if (location.protocol === 'https:' && !localHosts.includes(location.hostname) &&
    !location.hostname.endsWith('.localhost') && !location.hostname.endsWith('.local') &&
    navigator.doNotTrack !== '1') {
    inject({
        mode: 'production',
        beforeSend(event) {
            if (event.type !== 'pageview') return null;
            try {
                const url = new URL(event.url);
                url.search = '';
                url.hash = '';
                return { ...event, url: url.origin + url.pathname };
            } catch (_) { return null; }
        }
    });
}
