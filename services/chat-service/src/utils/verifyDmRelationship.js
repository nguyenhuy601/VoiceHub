const axios = require('axios');
const { getRedisClient } = require('@enterprise/shared');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const FRIEND_SERVICE_URL = String(process.env.FRIEND_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!FRIEND_SERVICE_URL) throw new Error('Thiếu biến môi trường: FRIEND_SERVICE_URL');

const CACHE_TTL_SEC = Number(process.env.DM_RELATIONSHIP_CACHE_TTL_SEC || 90);

function relationshipCacheKey(senderId, peerId) {
  const a = String(senderId || '').trim();
  const b = String(peerId || '').trim();
  return `dm:rel:v1:${a}:${b}`;
}

function isLazyEnsureEnabled() {
  return String(process.env.DM_LAZY_ENSURE_FRIENDSHIP || 'true').toLowerCase() !== 'false';
}

async function readRelationshipCache(senderId, peerId) {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(relationshipCacheKey(senderId, peerId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Chỉ cache blocked — không cache `none` (chặn lazy heal / auto-friend trễ). */
async function writeRelationshipCache(senderId, peerId, rel) {
  const redis = getRedisClient();
  if (!redis || !rel || rel.status !== 'blocked') return;
  try {
    await redis.setex(
      relationshipCacheKey(senderId, peerId),
      CACHE_TTL_SEC,
      JSON.stringify({ status: rel.status, blockerId: rel.blockerId || null })
    );
  } catch {
    /* ignore cache errors */
  }
}

async function clearRelationshipCache(senderId, peerId) {
  const redis = getRedisClient();
  if (!redis) return;
  const a = String(senderId || '').trim();
  const b = String(peerId || '').trim();
  if (!a || !b) return;
  try {
    await redis.del(relationshipCacheKey(a, b), relationshipCacheKey(b, a));
  } catch {
    /* ignore */
  }
}

function throwFromRelationshipStatus(rel, peerId) {
  const st = rel?.status || 'none';

  if (st === 'accepted') {
    return rel;
  }

  if (st === 'blocked') {
    const err = new Error('Cannot send message to this user');
    err.statusCode = 403;
    err.code = 'dm_blocked';
    err.blockerId = rel?.blockerId ? String(rel.blockerId) : null;
    throw err;
  }

  const err = new Error('Can only message accepted friends');
  err.statusCode = 403;
  err.code = 'dm_not_friends';
  void peerId;
  throw err;
}

/**
 * Heal Friendship khi auto-friend lúc xếp phòng bị miss (Directory DM).
 * Không ghi đè blocked (friend-service ensureAccepted).
 */
async function tryLazyEnsureFriendship(senderId, peerId) {
  if (!isLazyEnsureEnabled()) return false;
  const sid = String(senderId || '').trim();
  const fid = String(peerId || '').trim();
  const token = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (!sid || !fid || !token) return false;

  try {
    const resp = await axios.post(
      `${FRIEND_SERVICE_URL}/api/friends/internal/ensure-accepted`,
      { userId: sid, peerUserIds: [fid], source: 'dm_lazy_heal' },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-internal-token': token,
        },
        timeout: Number(process.env.DM_LAZY_ENSURE_TIMEOUT_MS || 8000),
        validateStatus: () => true,
      }
    );
    return resp.status >= 200 && resp.status < 300;
  } catch {
    return false;
  }
}

async function fetchRelationship({ peerId, authorizationHeader, senderId }) {
  const fid = String(peerId || '').trim();
  const sid = String(senderId || '').trim();
  const auth = authorizationHeader && String(authorizationHeader).trim();
  const headers = {};
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    headers.Authorization = auth;
  } else if (sid) {
    Object.assign(headers, buildTrustedGatewayHeaders(sid));
  } else {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    err.code = 'dm_auth_required';
    throw err;
  }

  const url = `${FRIEND_SERVICE_URL}/api/friends/${encodeURIComponent(fid)}/relationship`;
  const resp = await axios.get(url, {
    headers,
    timeout: Number(process.env.FRIEND_RELATIONSHIP_TIMEOUT_MS || 12000),
    validateStatus: () => true,
  });

  if (resp.status === 401) {
    const err = new Error(resp.data?.message || 'Unauthorized');
    err.statusCode = 401;
    err.code = 'dm_auth_required';
    throw err;
  }

  if (resp.status >= 500) {
    const err = new Error('Friend service temporarily unavailable');
    err.statusCode = 503;
    err.code = 'dm_friend_service_unavailable';
    throw err;
  }

  return resp.data?.data || { status: 'none' };
}

/**
 * Chỉ cho phép gửi DM khi quan hệ accepted (friend-service).
 * Lazy ensure khi chưa accepted (trừ blocked) — bù auto-friend miss.
 * @param {{ peerId: string, authorizationHeader?: string, senderId?: string }} opts
 * @throws {{ statusCode, code, message, blockerId? }}
 */
async function assertDmCanSend({ peerId, authorizationHeader, senderId }) {
  if (String(process.env.DM_REQUIRE_FRIENDSHIP || 'true').toLowerCase() === 'false') {
    return { status: 'accepted', skipped: true };
  }

  const fid = String(peerId || '').trim();
  const sid = String(senderId || '').trim();
  if (!fid) {
    const err = new Error('receiverId is required');
    err.statusCode = 400;
    err.code = 'dm_invalid_peer';
    throw err;
  }

  if (sid) {
    const cached = await readRelationshipCache(sid, fid);
    // Chỉ tin cache blocked. Không tin cache none — để lazy heal chạy được.
    if (cached && cached.status === 'blocked') {
      return throwFromRelationshipStatus(cached, fid);
    }
  }

  let rel = await fetchRelationship({ peerId: fid, authorizationHeader, senderId: sid });

  if (sid && rel.status !== 'accepted' && rel.status !== 'blocked') {
    const healed = await tryLazyEnsureFriendship(sid, fid);
    if (healed) {
      await clearRelationshipCache(sid, fid);
      rel = await fetchRelationship({ peerId: fid, authorizationHeader, senderId: sid });
    }
  }

  if (sid) {
    await writeRelationshipCache(sid, fid, rel);
  }
  return throwFromRelationshipStatus(rel, fid);
}

function dmErrorToJson(err) {
  return {
    success: false,
    message: err.message || 'Forbidden',
    code: err.code || 'dm_forbidden',
    ...(err.blockerId ? { blockerId: err.blockerId } : {}),
  };
}

module.exports = {
  assertDmCanSend,
  dmErrorToJson,
  isLazyEnsureEnabled,
  clearRelationshipCache,
};
