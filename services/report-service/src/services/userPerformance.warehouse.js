/**
 * Warehouse read/write + C2 fallback sang project-service.
 */

const axios = require('axios');
const { logger } = require('@enterprise/shared');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const {
  buildUserPerformanceRollup,
  calibrateEstimateHours,
} = require('@enterprise/shared/analytics/performanceMetrics');
const { connectAnalyticsDb, isAnalyticsDbReady } = require('../db/analyticsDb');
const UserPerformanceRollup = require('../models/UserPerformanceRollup');
const AnalyticsFact = require('../models/AnalyticsFact');

function projectServiceUrl() {
  return String(process.env.PROJECT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

async function upsertRollup(doc) {
  await connectAnalyticsDb();
  if (!isAnalyticsDbReady()) return null;
  const organizationId = String(doc.organizationId || '');
  const userId = String(doc.userId || '');
  const windowDays = Number(doc.windowDays) || 90;
  if (!organizationId || !userId) return null;
  return UserPerformanceRollup.findOneAndUpdate(
    { organizationId, userId, windowDays },
    {
      $set: {
        ...doc,
        organizationId,
        userId,
        windowDays,
        asOf: doc.asOf ? new Date(doc.asOf) : new Date(),
      },
    },
    { upsert: true, new: true }
  ).lean();
}

async function getRollupFromWarehouse({ organizationId, userId, windowDays = 90 }) {
  await connectAnalyticsDb();
  if (!isAnalyticsDbReady()) return null;
  return UserPerformanceRollup.findOne({
    organizationId: String(organizationId),
    userId: String(userId),
    windowDays: Number(windowDays) || 90,
  }).lean();
}

async function listRollupsFromWarehouse({ organizationId, windowDays = 90, limit = 50 }) {
  await connectAnalyticsDb();
  if (!isAnalyticsDbReady()) return null;
  return UserPerformanceRollup.find({
    organizationId: String(organizationId),
    windowDays: Number(windowDays) || 90,
  })
    .sort({ 'sampleSize.tasksCompleted': -1, updatedAt: -1 })
    .limit(Math.min(100, Number(limit) || 50))
    .lean();
}

async function fetchFromProjectService({
  path,
  organizationId,
  userId,
  query = {},
}) {
  const base = projectServiceUrl();
  if (!base) return null;
  const headers = buildTrustedGatewayHeaders(userId || 'report-service', {
    'x-organization-id': String(organizationId || ''),
  });
  headers['x-organization-id'] = String(organizationId || '');
  const url = `${base}${path}`;
  try {
    const res = await axios.get(url, {
      headers,
      params: { organizationId, ...query },
      timeout: Number(process.env.REPORT_C2_TIMEOUT_MS || 8000) || 8000,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300 && res.data?.success) {
      return res.data.data;
    }
    logger.warn('[performance] C2 project-service', res.status, res.data?.message);
    return null;
  } catch (err) {
    logger.warn('[performance] C2 failed', err.message);
    return null;
  }
}

async function getUserPerformance({
  organizationId,
  userId,
  actorUserId,
  windowDays = 90,
  asOf,
}) {
  const fromWh = await getRollupFromWarehouse({ organizationId, userId, windowDays });
  if (fromWh) {
    return { ...fromWh, source: fromWh.source || 'warehouse', asOf: fromWh.asOf };
  }
  const c2 = await fetchFromProjectService({
    path: `/api/projects/resources/performance/users/${encodeURIComponent(userId)}`,
    organizationId,
    userId: actorUserId,
    query: { windowDays, asOf },
  });
  if (c2) {
    void upsertRollup({ ...c2, source: 'c2_upsert' });
    return { ...c2, source: 'c2_api' };
  }
  return null;
}

async function listUserPerformance({
  organizationId,
  actorUserId,
  windowDays = 90,
  asOf,
  limit = 50,
}) {
  const fromWh = await listRollupsFromWarehouse({ organizationId, windowDays, limit });
  if (fromWh && fromWh.length) {
    return {
      organizationId: String(organizationId),
      windowDays: Number(windowDays) || 90,
      asOf: new Date().toISOString(),
      items: fromWh,
      source: 'warehouse',
    };
  }
  const c2 = await fetchFromProjectService({
    path: '/api/projects/resources/performance',
    organizationId,
    userId: actorUserId,
    query: { windowDays, asOf, limit },
  });
  if (c2) return { ...c2, source: 'c2_api' };
  return {
    organizationId: String(organizationId),
    windowDays: Number(windowDays) || 90,
    asOf: new Date().toISOString(),
    items: [],
    source: 'empty',
  };
}

async function getEstimateHints({
  organizationId,
  assigneeId,
  actorUserId,
  baselineHours,
  issueType,
  windowDays = 90,
}) {
  const profile = await getUserPerformance({
    organizationId,
    userId: assigneeId,
    actorUserId,
    windowDays,
  });
  if (!profile) {
    return {
      assigneeId: String(assigneeId),
      organizationId: String(organizationId),
      confidence: 'low',
      calibration: {
        suggestedHours: baselineHours != null ? Number(baselineHours) : null,
        multiplier: 1,
        applied: false,
        reason: 'no_profile',
      },
      userPerformanceHints: null,
    };
  }
  const base =
    baselineHours != null && Number.isFinite(Number(baselineHours))
      ? Number(baselineHours)
      : profile.estimation?.avgEstimateHours;
  const calibrated = calibrateEstimateHours({
    baselineHours: base,
    avgEstimateHours: profile.estimation?.avgEstimateHours,
    avgActualHours: profile.estimation?.avgActualHours,
    confidence: profile.confidence,
  });
  return {
    assigneeId: String(assigneeId),
    organizationId: String(organizationId),
    issueType: issueType || null,
    confidence: profile.confidence,
    sampleSize: profile.sampleSize,
    estimation: profile.estimation,
    calibration: calibrated,
    userPerformanceHints: {
      accuracyPct: profile.estimation?.accuracyPct,
      biasHours: profile.estimation?.biasHours,
      avgEstimateHours: profile.estimation?.avgEstimateHours,
      avgActualHours: profile.estimation?.avgActualHours,
      confidence: profile.confidence,
    },
    source: profile.source,
  };
}

/**
 * Ingest analytics envelope → facts; rebuild rollup khi đủ task facts cho user.
 */
async function ingestAnalyticsEnvelope(envelope) {
  await connectAnalyticsDb();
  if (!isAnalyticsDbReady()) return { applied: false, reason: 'db_unavailable' };
  const eventId = String(envelope?.eventId || '').trim();
  if (!eventId) return { applied: false, reason: 'missing_eventId' };
  try {
    await AnalyticsFact.create({
      eventId,
      type: envelope.type,
      organizationId: envelope.organizationId,
      projectId: envelope.projectId,
      occurredAt: envelope.occurredAt ? new Date(envelope.occurredAt) : new Date(),
      payload: envelope.payload || {},
    });
  } catch (err) {
    if (err?.code === 11000) return { applied: false, reason: 'duplicate' };
    throw err;
  }

  const payload = envelope.payload || {};
  const orgId = String(envelope.organizationId || payload.organizationId || '');
  const userIds = new Set();
  if (payload.assigneeId) userIds.add(String(payload.assigneeId));
  if (payload.userId) userIds.add(String(payload.userId));
  if (Array.isArray(payload.userIds)) payload.userIds.forEach((id) => userIds.add(String(id)));

  for (const uid of userIds) {
    if (!orgId || !uid) continue;
    await rebuildRollupFromFacts({ organizationId: orgId, userId: uid, windowDays: 90 });
  }
  return { applied: true };
}

async function rebuildRollupFromFacts({ organizationId, userId, windowDays = 90 }) {
  const end = new Date();
  const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const facts = await AnalyticsFact.find({
    organizationId: String(organizationId),
    occurredAt: { $gte: start, $lte: end },
    $or: [
      { 'payload.assigneeId': String(userId) },
      { 'payload.userId': String(userId) },
      { 'payload.userIds': String(userId) },
    ],
  })
    .sort({ occurredAt: 1 })
    .lean()
    .limit(5000);

  const taskMap = new Map();
  let totalHoursLogged = 0;
  const reworkTasks = new Set();
  const reopenTasks = new Set();

  for (const f of facts) {
    const p = f.payload || {};
    if (f.type && String(f.type).includes('worklog')) {
      totalHoursLogged += Number(p.hours) || 0;
      continue;
    }
    if (f.type && String(f.type).includes('status_transition')) {
      if (p.isRework && p.taskId) reworkTasks.add(String(p.taskId));
      if (p.isReopen && p.taskId) reopenTasks.add(String(p.taskId));
      continue;
    }
    if (p.doneDelta === 1 && p.taskId) {
      taskMap.set(String(p.taskId), {
        estimateHours: p.estimateHours,
        actualHours: 0,
        issueType: p.issueType,
        completedAt: p.completedAt,
        firstInProgressAt: p.firstInProgressAt,
        hadRework: reworkTasks.has(String(p.taskId)),
        hadReopen: reopenTasks.has(String(p.taskId)),
      });
    }
  }

  // Attach worklog hours to tasks when possible
  for (const f of facts) {
    if (!(f.type && String(f.type).includes('worklog'))) continue;
    const tid = String(f.payload?.taskId || '');
    if (tid && taskMap.has(tid)) {
      const row = taskMap.get(tid);
      row.actualHours = (row.actualHours || 0) + (Number(f.payload.hours) || 0);
    }
  }

  for (const tid of reworkTasks) {
    if (taskMap.has(tid)) taskMap.get(tid).hadRework = true;
  }
  for (const tid of reopenTasks) {
    if (taskMap.has(tid)) taskMap.get(tid).hadReopen = true;
  }

  const rollup = buildUserPerformanceRollup({
    organizationId,
    userId,
    windowDays,
    asOf: end,
    completedTasks: [...taskMap.values()],
    totalHoursLogged,
  });
  rollup.source = 'etl';
  await upsertRollup(rollup);
  return rollup;
}

module.exports = {
  upsertRollup,
  getRollupFromWarehouse,
  listRollupsFromWarehouse,
  getUserPerformance,
  listUserPerformance,
  getEstimateHints,
  ingestAnalyticsEnvelope,
  rebuildRollupFromFacts,
};
