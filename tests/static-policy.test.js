const path = require('path');
const { publicFile } = require('../static-policy');
const root = path.resolve(__dirname, '..');
test('serves public pages and assets', () => {
  expect(publicFile(root, '/staff.html')).toBe(path.join(root, 'staff.html'));
  expect(publicFile(root, '/js/session-domain.js')).toBe(path.join(root, 'js/session-domain.js'));
});
test.each(['/.env.local', '/db.json', '/package.json', '/api/index.js', '/node_modules/vue/package.json', '/.git/config', '/js/../server.js', '/js/%2e%2e/server.js', '/js/%5c..%5cserver.js'])('blocks private path %s', target => {
  expect(publicFile(root, target)).toBeNull();
});
