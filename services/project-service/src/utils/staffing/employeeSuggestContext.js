/**
 * Compact employee suggest context (Profile hints + Project/Task History).
 * Allowlist only — no experience.work, task titles, or activity payloads.
 */

const mongoose = require('../db');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const Worklog = require('../models/Worklog');

const CONTEXT_SOFT_MS = 15000;
const HISTORY_WINDOW_DAYS = 90;

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function normalizeRoleKey(roleKey) {
  return String(roleKey || '')
    .trim()
    .toLowerCase();
}

function emptyHistoryRow() {
  return { priorRoles: {} };
}

/**
 * @param {Array<{ userId: string, projectId: string, roleKey: string }>} membershipRows
 * @param {Array<{ userId: string, projectId: string, hours: number }>} worklogRows
 * @returns {Map<string, { priorRoles: Record<string, { projectCount: number, taskHours: number }> }>}
 */
function buildHistoryByUserId(membershipRows = [], worklogRows = []) {
  const byUser = new Map();
  /** @type {Map<string, Set<string>>} */
  const rolesOnProject = new Map();

  for (const row of membershipRows || []) {
    const uid = String(row.userId || '').trim();
    const pid = String(row.projectId || '').trim();
    const roleKey = normalizeRoleKey(row.roleKey);
    if (!uid || !pid || !roleKey) continue;

    if (!byUser.has(uid)) byUser.set(uid, emptyHistoryRow());
    const prior = byUser.get(uid).priorRoles;
    if (!prior[roleKey]) prior[roleKey] = { projectIds: new Set(), taskHours: 0 };
    prior[roleKey].projectIds.add(pid);

    const pk = `${uid}:${pid}`;
    if (!rolesOnProject.has(pk)) rolesOnProject.set(pk, new Set());
    rolesOnProject.get(pk).add(roleKey);
  }

  for (const log of worklogRows || []) {
    const uid = String(log.userId || '').trim();
    const pid = String(log.projectId || '').trim();
    const hours = Number(log.hours) || 0;
    if (!uid || !pid || hours <= 0) continue;
    const roleKeys = rolesOnProject.get(`${uid}:${pid}`);
    if (!roleKeys || !roleKeys.size) continue;
    if (!byUser.has(uid)) byUser.set(uid, emptyHistoryRow());
    const prior = byUser.get(uid).priorRoles;
    for (const roleKey of roleKeys) {
      if (!prior[roleKey]) prior[roleKey] = { projectIds: new Set(), taskHours: 0 };
      prior[roleKey].taskHours += hours;
    }
  }

  const out = new Map();
  for (const [uid, row] of byUser.entries()) {
    const priorRoles = {};
    for (const [roleKey, meta] of Object.entries(row.priorRoles || {})) {
      priorRoles[roleKey] = {
        projectCount: meta.projectIds instanceof Set ? meta.projectIds.size : Number(meta.projectCount) || 0,
        taskHours: Math.round((Number(meta.taskHours) || 0) * 100) / 100,
      };
    }
    out.set(uid, { priorRoles });
  }
  return out;
}

/**
 * Leaf-facing slice for shortlist / LLM (allowlist).
 */
function leafHistorySignals(historyRow, roleKey) {
  const key = normalizeRoleKey(roleKey);
  const meta = historyRow?.priorRoles?.[key] || null;
  const priorRoleMatch = Boolean(meta && (meta.projectCount > 0 || meta.taskHours > 0));
  return {
    priorRoleMatch,
    priorRoleProjects: meta ? Number(meta.projectCount) || 0 : 0,
    relevantTaskHours: meta ? Number(meta.taskHours) || 0 : 0,
  };
}

/**
 * Attach suggestContext onto pool items (mutates shallow copy of items).
 */
function attachHistoryToPoolItems(poolItems = [], historyByUserId = new Map()) {
  return (poolItems || []).map((item) => {
    const uid = String(item?.userId || '').trim();
    const history = historyByUserId.get(uid) || emptyHistoryRow();
    const priorRoles = {};
    for (const [k, v] of Object.entries(history.priorRoles || {})) {
      priorRoles[k] = {
        projectCount: Number(v.projectCount) || 0,
        taskHours: Number(v.taskHours) || 0,
      };
    }
    return {
      ...item,
      suggestContext: { priorRoles },
    };
  });
}

function assertAllowlistedLlmCandidate(candidate = {}) {
  const allowed = new Set([
    'userId',
    'displayName',
    'jobTitle',
    'seniorityBand',
    'matchedSkills',
    'availableHours',
    'priorRoleMatch',
    'priorRoleProjects',
    'perfConfidence',
    'accuracyPct',
    'reworkRate',
    'relevantTaskHours',
    'score',
  ]);
  for (const key of Object.keys(candidate)) {
    if (!allowed.has(key)) {
      const err = new Error(`llm candidate field not allowlisted: ${key}`);
      err.code = 'LLM_CANDIDATE_FIELD';
      throw err;
    }
  }
  if ('work' in (candidate.projectExperiences || {}) || candidate.work != null) {
    const err = new Error('llm candidate must not include experience work');
    err.code = 'LLM_CANDIDATE_FIELD';
    throw err;
  }
}

async function loadHistoryMapsFromDb(organizationId, userIds, { asOf, windowDays = HISTORY_WINDOW_DAYS } = {}) {
  const orgId = asOid(organizationId);
  const oids = (userIds || []).map(asOid).filter(Boolean);
  if (!orgId || !oids.length) return new Map();

  const end = asOf ? new Date(asOf) : new Date();
  const start = new Date(end.getTime() - Math.max(1, windowDays) * 24 * 3600 * 1000);

  const memberships = await ProjectMembership.find({
    organizationId: orgId,
    userId: { $in: oids },
  })
    .select('userId projectId projectRoleId')
    .lean();

  const roleIds = [
    ...new Set(
      memberships
        .map((m) => asOid(m.projectRoleId))
        .filter(Boolean)
    ),
  ];
  const roles = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key').lean()
    : [];
  const roleKeyById = new Map(roles.map((r) => [String(r._id), normalizeRoleKey(r.key)]));

  const membershipRows = memberships.map((m) => ({
    userId: String(m.userId),
    projectId: String(m.projectId),
    roleKey: roleKeyById.get(String(m.projectRoleId)) || '',
  }));

  const worklogs = await Worklog.find({
    organizationId: orgId,
    userId: { $in: oids },
    workDate: { $gte: start, $lte: end },
  })
    .select('userId projectId hours')
    .lean();

  const worklogRows = worklogs.map((w) => ({
    userId: String(w.userId),
    projectId: String(w.projectId),
    hours: Number(w.hours) || 0,
  }));

  return buildHistoryByUserId(membershipRows, worklogRows);
}

/**
 * Soft-budget load: on timeout returns empty map (shortlist still works on skills/capacity).
 */
async function buildForUserIds({
  organizationId,
  userIds,
  asOf,
  softMs = CONTEXT_SOFT_MS,
} = {}) {
  const fallback = new Map();
  const loadPromise = loadHistoryMapsFromDb(organizationId, userIds, { asOf }).catch(() => fallback);

  if (!softMs || softMs <= 0) return loadPromise;

  let timer;
  try {
    return await Promise.race([
      loadPromise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), softMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  CONTEXT_SOFT_MS,
  HISTORY_WINDOW_DAYS,
  buildHistoryByUserId,
  leafHistorySignals,
  attachHistoryToPoolItems,
  assertAllowlistedLlmCandidate,
  buildForUserIds,
  loadHistoryMapsFromDb,
  emptyHistoryRow,
  normalizeRoleKey,
};
