// Compatibility entry point for deployments that route /api/session.js
// directly. The canonical implementation lives in api/index.js so session
// validation, authentication and storage behavior cannot drift.
const handler = require('./index');

module.exports = async function sessionCompatibilityHandler(req, res) {
    const originalUrl = String(req.url || '');
    req.url = originalUrl.replace(/^\/api\/session\.js(?=\?|$)/i, '/api/session');
    try {
        return await handler(req, res);
    } finally {
        req.url = originalUrl;
    }
};
