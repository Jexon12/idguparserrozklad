/**
 * Basic API Routing Tests
 * Run: node tests/api.test.js
 * Requires the server to NOT be running (tests start their own).
 */
const http = require('http');

// -- Configuration --
const PORT = 3999; // Use a different port to avoid conflicts
let server;
let apiHandler;

// -- Test Framework --
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        results.push(`  ✓ ${message}`);
    } else {
        failed++;
        results.push(`  ✗ ${message}`);
    }
}

async function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (e) { }
                resolve({ status: res.statusCode, data, json, headers: res.headers });
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

// -- Setup Test Server --
function startServer() {
    return new Promise((resolve) => {
        apiHandler = require('../api/index.js');

        server = http.createServer(async (req, res) => {
            // Minimal shim matching server.js behavior
            res.status = (code) => { res.statusCode = code; return res; };
            res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
            };
            res.send = (data) => { res.end(data); };

            // Parse body for POST
            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                let body = '';
                await new Promise((r) => {
                    req.on('data', chunk => body += chunk);
                    req.on('end', r);
                });
                try { req.body = JSON.parse(body); } catch (e) { req.body = {}; }
            }

            try {
                await apiHandler(req, res);
            } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });

        server.listen(PORT, () => {
            console.log(`Test server started on port ${PORT}`);
            resolve();
        });
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (server) server.close(resolve);
        else resolve();
    });
}

// -- Tests --
async function runTests() {
    console.log('\n🧪 API Routing Tests\n');

    // Test 1: GET /api/times returns JSON
    try {
        const res = await makeRequest('/api/times');
        assert(res.status === 200, 'GET /api/times returns 200');
        assert(res.json !== null, 'GET /api/times returns valid JSON');
    } catch (e) {
        assert(false, `GET /api/times: ${e.message}`);
    }

    // Test 2: POST /api/times without password should fail
    try {
        const res = await makeRequest('/api/times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { times: {} }
        });
        assert(res.status === 403 || res.status === 401, 'POST /api/times without password returns 401/403');
    } catch (e) {
        assert(false, `POST /api/times auth test: ${e.message}`);
    }

    // Test 3: POST /api/times with wrong password should fail
    try {
        const res = await makeRequest('/api/times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { password: 'wrong_password_12345', times: {} }
        });
        assert(res.status === 403, 'POST /api/times with wrong password returns 403');
    } catch (e) {
        assert(false, `POST /api/times wrong password test: ${e.message}`);
    }

    // Test 4: GET /api/links returns JSON
    try {
        const res = await makeRequest('/api/links');
        assert(res.status === 200, 'GET /api/links returns 200');
        assert(res.json !== null, 'GET /api/links returns valid JSON');
    } catch (e) {
        assert(false, `GET /api/links: ${e.message}`);
    }

    // Test 5: GET /api/search requires query
    try {
        const res = await makeRequest('/api/search');
        assert(res.status === 400, 'GET /api/search without q returns 400');
    } catch (e) {
        assert(false, `GET /api/search: ${e.message}`);
    }

    // Test 6: GET /api/search with short query
    try {
        const res = await makeRequest('/api/search?q=a');
        assert(res.status === 400, 'GET /api/search with 1-char query returns 400');
    } catch (e) {
        assert(false, `GET /api/search short query: ${e.message}`);
    }

    // Test 7: GET /api/search with valid query returns array
    try {
        const res = await makeRequest('/api/search?q=test');
        assert(res.status === 200, 'GET /api/search?q=test returns 200');
        assert(Array.isArray(res.json), 'GET /api/search returns array');
    } catch (e) {
        assert(false, `GET /api/search valid: ${e.message}`);
    }

    // Test 8: GET /api/occupancy requires date
    try {
        const res = await makeRequest('/api/occupancy');
        assert(res.status === 400, 'GET /api/occupancy without date returns 400');
    } catch (e) {
        assert(false, `GET /api/occupancy: ${e.message}`);
    }

    // Test 9: GET /api/occupancy with date returns JSON
    try {
        const res = await makeRequest('/api/occupancy?date=2025-01-15');
        assert(res.status === 200, 'GET /api/occupancy?date=... returns 200');
        assert(res.json !== null, 'GET /api/occupancy returns valid JSON');
    } catch (e) {
        assert(false, `GET /api/occupancy with date: ${e.message}`);
    }

    // Test 10: OPTIONS request returns 204 (CORS preflight)
    try {
        const res = await makeRequest('/api/times', { method: 'OPTIONS' });
        assert(res.status === 204, 'OPTIONS /api/times returns 204');
    } catch (e) {
        assert(false, `OPTIONS CORS preflight: ${e.message}`);
    }
}

// -- Runner --
(async () => {
    try {
        await startServer();
        await runTests();
    } catch (e) {
        console.error('Test runner error:', e);
    } finally {
        await stopServer();

        console.log('\n' + results.join('\n'));
        console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
        process.exit(failed > 0 ? 1 : 0);
    }
})();
