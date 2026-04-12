const http = require('http');

const PORT = 3999;
let server;
let apiHandler;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'localhost',
            port: PORT,
            path,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    json = null;
                }
                resolve({ status: res.statusCode, data, json, headers: res.headers });
            });
        });

        req.on('error', reject);

        if (options.body !== undefined) {
            req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }

        req.end();
    });
}

function startServer() {
    return new Promise((resolve) => {
        apiHandler = require('../api/index.js');

        server = http.createServer(async (req, res) => {
            res.status = (code) => {
                res.statusCode = code;
                return res;
            };
            res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
            };
            res.send = (data) => {
                res.end(data);
                return res;
            };

            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                let body = '';
                await new Promise((done) => {
                    req.on('data', (chunk) => {
                        body += chunk;
                    });
                    req.on('end', done);
                });

                if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                    try {
                        req.body = JSON.parse(body);
                    } catch (e) {
                        req.body = body;
                    }
                } else {
                    req.body = body;
                }
            }

            try {
                await apiHandler(req, res);
            } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });

        server.listen(PORT, resolve);
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (!server) {
            resolve();
            return;
        }
        server.close(resolve);
    });
}

describe('API routing', () => {
    beforeAll(async () => {
        await startServer();
    });

    beforeEach(() => {
        if (apiHandler.__resetInternalsForTests) {
            apiHandler.__resetInternalsForTests();
        }
    });

    afterAll(async () => {
        await stopServer();
    });

    test('GET /api/times returns 200 and JSON', async () => {
        const res = await makeRequest('/api/times');
        expect(res.status).toBe(200);
        expect(res.json).not.toBeNull();
    });

    test('POST /api/times without password returns auth error', async () => {
        const res = await makeRequest('/api/times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { times: {} }
        });
        expect([401, 403]).toContain(res.status);
    });

    test('POST /api/times with wrong password returns 403', async () => {
        const res = await makeRequest('/api/times', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { password: 'wrong_password_12345', times: {} }
        });
        expect(res.status).toBe(403);
    });

    test('GET /api/links returns 200 and JSON', async () => {
        const res = await makeRequest('/api/links');
        expect(res.status).toBe(200);
        expect(res.json).not.toBeNull();
    });

    test('GET /api/search without q returns 400', async () => {
        const res = await makeRequest('/api/search');
        expect(res.status).toBe(400);
    });

    test('GET /api/search with short query returns 400', async () => {
        const res = await makeRequest('/api/search?q=a');
        expect(res.status).toBe(400);
    });

    test('GET /api/search with valid query returns array', async () => {
        const res = await makeRequest('/api/search?q=test');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.json)).toBe(true);
    });

    test('GET /api/occupancy without date returns 400', async () => {
        const res = await makeRequest('/api/occupancy');
        expect(res.status).toBe(400);
    });

    test('GET /api/occupancy with date returns JSON', async () => {
        const res = await makeRequest('/api/occupancy?date=2025-01-15');
        expect(res.status).toBe(200);
        expect(res.json).not.toBeNull();
    });

    test('GET /api/monitor returns snapshot', async () => {
        const res = await makeRequest('/api/monitor');
        expect(res.status).toBe(200);
        expect(res.json).not.toBeNull();
        expect(res.json.status).toBe('ok');
    });

    test('GET /api/audit returns list', async () => {
        const res = await makeRequest('/api/audit?limit=10');
        expect(res.status).toBe(200);
        expect(res.json).not.toBeNull();
        expect(Array.isArray(res.json.items)).toBe(true);
    });

    test('GET /api/versions returns list', async () => {
        const res = await makeRequest('/api/versions?scope=session');
        expect(res.status).toBe(200);
        expect(res.json).not.toBeNull();
        expect(Array.isArray(res.json.items)).toBe(true);
    });

    test('OPTIONS /api/times returns 204', async () => {
        const res = await makeRequest('/api/times', { method: 'OPTIONS' });
        expect(res.status).toBe(204);
    });

    test('POST /api/occupancy accepts empty results array', async () => {
        const res = await makeRequest('/api/occupancy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { date: '2026-04-08', results: [] }
        });
        expect([200, 500]).toContain(res.status);
    });

    test('POST /api/times is rate-limited after many requests', async () => {
        const requests = [];
        for (let i = 0; i < 25; i++) {
            requests.push(makeRequest('/api/times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { password: 'wrong_password_12345', times: {} }
            }));
        }

        const responses = await Promise.all(requests);
        const has429 = responses.some((r) => r.status === 429);
        expect(has429).toBe(true);
    });

    test('Report job success path provides download URL and XLSX file', async () => {
        apiHandler.__setFetchForTests(async () => ({
            json: async () => ({
                d: [
                    {
                        full_date: '10.03.2026',
                        study_time_begin: '10:00',
                        discipline: 'Тестова дисципліна',
                        study_type: 'Лекції',
                        study_hours: 2,
                        contingent: '121У'
                    }
                ]
            })
        }));

        const startRes = await makeRequest('/api/report/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                teacherId: 'T123',
                teacherName: 'Test Teacher',
                monthStart: '2026-03',
                monthEnd: '2026-03'
            }
        });

        expect(startRes.status).toBe(200);
        expect(startRes.json).not.toBeNull();
        expect(typeof startRes.json.jobId).toBe('string');

        const jobId = startRes.json.jobId;
        let statusRes = null;

        for (let i = 0; i < 40; i++) {
            statusRes = await makeRequest(`/api/report/status?jobId=${encodeURIComponent(jobId)}`);
            if (statusRes.status === 200 && statusRes.json && statusRes.json.done) {
                break;
            }
            await sleep(25);
        }

        expect(statusRes.status).toBe(200);
        expect(statusRes.json.status).toBe('done');
        expect(statusRes.json.done).toBe(true);
        expect(statusRes.json.error).toBeNull();
        expect(statusRes.json.downloadUrl).toBe(`/api/report/download?jobId=${jobId}`);

        const downloadRes = await makeRequest(`/api/report/download?jobId=${encodeURIComponent(jobId)}`);
        expect(downloadRes.status).toBe(200);
        expect(downloadRes.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(downloadRes.headers['content-disposition']).toContain('.xlsx');
        expect(downloadRes.data.length).toBeGreaterThan(100);
    });

    test('Report job error state does not expose download URL and blocks download', async () => {
        apiHandler.__setFetchForTests(async () => {
            throw new Error('forced network failure');
        });

        const startRes = await makeRequest('/api/report/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                teacherId: 'T123',
                teacherName: 'Test Teacher',
                monthStart: '2026-03',
                monthEnd: '2026-03'
            }
        });

        expect(startRes.status).toBe(200);
        expect(startRes.json).not.toBeNull();
        expect(typeof startRes.json.jobId).toBe('string');

        const jobId = startRes.json.jobId;
        let statusRes = null;

        for (let i = 0; i < 30; i++) {
            statusRes = await makeRequest(`/api/report/status?jobId=${encodeURIComponent(jobId)}`);
            if (statusRes.status === 200 && statusRes.json && statusRes.json.done) {
                break;
            }
            await sleep(25);
        }

        expect(statusRes.status).toBe(200);
        expect(statusRes.json.status).toBe('error');
        expect(statusRes.json.done).toBe(true);
        expect(statusRes.json.error).toBeTruthy();
        expect(statusRes.json.downloadUrl).toBeNull();

        const downloadRes = await makeRequest(`/api/report/download?jobId=${encodeURIComponent(jobId)}`);
        expect(downloadRes.status).toBe(404);
    });
});
