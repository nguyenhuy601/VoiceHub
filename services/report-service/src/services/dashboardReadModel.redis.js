const { getRedisClient, logger } = require('@enterprise/shared');
const {
  dashboardReadModelKey,
  dashboardReadModelEventsKey,
} = require('@enterprise/shared/messaging/dashboardProjectionEvents');
const {
  emptyDashboardSummary,
  upsertDashboardSummary,
  applyTaskFactPatch,
  toPublicDashboardSummary,
} = require('./dashboardReadModel.store');

const memory = new Map();
const RM_TTL_SEC = Math.max(3600, Number(process.env.DASHBOARD_RM_TTL_SEC || 86400) || 86400);
const EVENT_TTL_SEC = Math.max(3600, Number(process.env.DASHBOARD_RM_EVENT_TTL_SEC || 172800) || 172800);

function useMemoryFallback() {
  return String(process.env.DASHBOARD_RM_MEMORY || '').toLowerCase() === 'true' || !getRedisClient();
}

async function readRaw(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  if (useMemoryFallback()) {
    return memory.get(uid) || null;
  }
  const redis = getRedisClient();
  const raw = await redis.get(dashboardReadModelKey(uid));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeRaw(userId, doc) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  if (useMemoryFallback()) {
    memory.set(uid, doc);
    return;
  }
  const redis = getRedisClient();
  await redis.set(dashboardReadModelKey(uid), JSON.stringify(doc), 'EX', RM_TTL_SEC);
}

async function hasProcessedEvent(userId, eventId) {
  const uid = String(userId || '').trim();
  const eid = String(eventId || '').trim();
  if (!uid || !eid) return false;
  if (useMemoryFallback()) {
    const doc = memory.get(uid);
    return Boolean(doc?.processedEventIds?.includes(eid));
  }
  const redis = getRedisClient();
  const n = await redis.sismember(dashboardReadModelEventsKey(uid), eid);
  return Number(n) === 1;
}

async function markProcessedEvent(userId, eventId) {
  const uid = String(userId || '').trim();
  const eid = String(eventId || '').trim();
  if (!uid || !eid) return;
  if (useMemoryFallback()) return;
  const redis = getRedisClient();
  const key = dashboardReadModelEventsKey(uid);
  await redis.sadd(key, eid);
  await redis.expire(key, EVENT_TTL_SEC);
}

async function getDashboardSummary(userId) {
  const doc = await readRaw(userId);
  return toPublicDashboardSummary(doc);
}

async function saveSnapshot(userId, patch, eventId) {
  const current = (await readRaw(userId)) || emptyDashboardSummary(userId);
  if (eventId && (await hasProcessedEvent(userId, eventId))) {
    return { applied: false, doc: current };
  }
  const { next, applied } = upsertDashboardSummary(current, {
    userId,
    eventId,
    patch,
    asOf: patch?.asOf,
  });
  if (applied) {
    await writeRaw(userId, next);
    await markProcessedEvent(userId, eventId);
  }
  return { applied, doc: next };
}

async function applyTaskFact(userId, payload, eventId) {
  const current = (await readRaw(userId)) || emptyDashboardSummary(userId);
  if (eventId && (await hasProcessedEvent(userId, eventId))) {
    return { applied: false, doc: current };
  }
  const patched = applyTaskFactPatch(current, payload);
  const { next, applied } = upsertDashboardSummary(current, {
    userId,
    eventId,
    patch: {
      taskDone: patched.taskDone,
      partial: patched.partial,
    },
    asOf: new Date().toISOString(),
  });
  if (applied) {
    await writeRaw(userId, next);
    await markProcessedEvent(userId, eventId);
  }
  return { applied, doc: next };
}

function clearMemoryStore() {
  memory.clear();
}

module.exports = {
  getDashboardSummary,
  saveSnapshot,
  applyTaskFact,
  readRaw,
  clearMemoryStore,
  logger,
};
