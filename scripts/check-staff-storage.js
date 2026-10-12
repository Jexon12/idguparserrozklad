'use strict';
// Probe only a fresh, expiring key; never change application accounts or schedules.
require('dotenv').config({ path: '.env.local', quiet: true });
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
async function probe(client, type) {
  const key = `schedule:staff-probe:${crypto.randomUUID()}`;
  const value = { nonce: crypto.randomUUID() };
  try {
    if (type === 'redis') await client.set(key, JSON.stringify(value), { EX: 60, NX: true });
    else await client.set(key, value, { ex: 60, nx: true });
    const raw = await client.get(key);
    const loaded = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (loaded?.nonce !== value.nonce) throw Object.assign(new Error('Read mismatch'), { code: 'READ_MISMATCH' });
    return { type, status: 'ok', writeReadVerified: true };
  } finally { try { await client.del(key); } catch (_) { /* The fresh key also expires in 60 seconds. */ } }
}
async function main() {
  let client, type;
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      type = 'kv'; client = require('@vercel/kv').createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    } else if (process.env.REDIS_URL) {
      type = 'redis'; client = require('redis').createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: () => false } });
      client.on('error', () => {}); await client.connect();
    } else {
      console.log(JSON.stringify({ type: 'local-db', status: 'remote-not-configured', message: 'Persistent local storage is covered by tests/staff-workflow.test.js' }));
      return;
    }
    console.log(JSON.stringify(await probe(client, type)));
  } catch (error) {
    console.log(JSON.stringify({ type: type || 'unavailable', status: 'unavailable', errorCode: error.code || 'CONNECTION_FAILED' }));
    process.exitCode = 1;
  } finally { if (type === 'redis' && client?.isOpen) client.destroy(); }
}
main();
