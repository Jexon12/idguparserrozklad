const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../js/web-analytics.js'), 'utf8').replace(/^import .*;\s*/,'');
function init(hostname = 'idguparserrozklad.vercel.app', protocol = 'https:', doNotTrack = null) {
    const inject = jest.fn();
    vm.runInNewContext(source, { inject, location: { hostname, protocol }, navigator: { doNotTrack }, URL });
    return inject;
}
test('enables production page analytics and redacts schedule state', () => {
    const inject = init();
    expect(inject).toHaveBeenCalledTimes(1);
    const config = inject.mock.calls[0][0];
    expect(config.mode).toBe('production');
    const filtered = config.beforeSend({ type: 'pageview', url: 'https://idguparserrozklad.vercel.app/index.html?teacher=private#entities=private' });
    expect(filtered.url).toBe('https://idguparserrozklad.vercel.app/index.html');
    expect(config.beforeSend({ type: 'event', url: 'https://example.org/' })).toBeNull();
    expect(config.beforeSend({ type: 'pageview', url: 'bad-url' })).toBeNull();
});
test('does not track development or Do Not Track visitors', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'test.localhost', 'test.local']) expect(init(host)).not.toHaveBeenCalled();
    expect(init('example.org', 'http:')).not.toHaveBeenCalled();
    expect(init('example.org', 'https:', '1')).not.toHaveBeenCalled();
});
test('each application page includes the analytics module exactly once', () => {
    for (const page of ['index', 'session', 'staff', 'builder', 'course-live', 'session-admin', 'session-constructor']) {
        const html = fs.readFileSync(require.resolve(`../${page}.html`), 'utf8');
        expect((html.match(/src="\/js\/web-analytics\.js(?:\?[^\"]*)?"/g) || []).length).toBe(1);
    }
});
