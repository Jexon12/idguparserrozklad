'use strict';
const crypto = require('crypto');
const script = "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {n, redis.call('PTTL', KEYS[1])}";
async function checkStaffRate(db, bucket, key, config) {
  const digest = crypto.createHash('sha256').update(String(key)).digest('hex');
  const redisKey = `staff-rate:${bucket}:${digest}`;
  const values = db.type === 'redis'
    ? await db.client.eval(script, { keys: [redisKey], arguments: [String(config.windowMs)] })
    : await db.client.eval(script, [redisKey], [String(config.windowMs)]);
  const count = Number(values[0]), ttl = Number(values[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttl) || ttl < 0) throw new Error('Staff rate limit unavailable');
  return { allowed: count <= config.max, remaining: Math.max(0, config.max - count), resetAt: Date.now() + ttl };
}
module.exports = { checkStaffRate };
