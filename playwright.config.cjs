const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/browser',
    testMatch: '**/*.e2e.cjs',
    fullyParallel: false,
    use: { baseURL: 'http://127.0.0.1:4020', trace: 'retain-on-failure' },
    webServer: { command: 'node server.js', env: { PORT: '4020' }, url: 'http://127.0.0.1:4020/api/health', reuseExistingServer: false },
    projects: [
        { name: 'phone-360', use: { viewport: { width: 360, height: 800 } } },
        { name: 'phone-dark', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
        { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
        { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
    ]
});
