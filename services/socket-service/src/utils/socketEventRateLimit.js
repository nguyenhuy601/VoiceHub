const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

function windowSecFromMs(ms) {
  return Math.max(1, Math.ceil(Number(ms) / 1000));
}

/**
 * Rate limit theo userId (+ optional IP) — Redis sliding window; fallback allow nếu Redis down.
 */
async function isSocketEventRateLimited(eventKey, userId, socket, { limit, windowMs }) {
  const uid = String(userId || '').trim();
  if (!uid) return true;

  const ip = String(socket?.handshake?.address || '').trim();
  const key = ip ? `socket:rl:${eventKey}:${uid}:${ip}` : `socket:rl:${eventKey}:${uid}`;

  const { allowed } = await checkRateLimit({
    key,
    limit,
    windowSec: windowSecFromMs(windowMs),
  });
  return !allowed;
}

module.exports = { isSocketEventRateLimited };
