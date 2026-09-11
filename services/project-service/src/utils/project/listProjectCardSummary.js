/**
 * Additive card summary for GET /projects list (progress / health / PM).
 * Batch only — no N+1 Task queries.
 */
const mongoose = require('../../db');
const ProjectMembership = require('../../models/ProjectMembership');
const ProjectRole = require('../../models/ProjectRole');
const { logger } = require('@enterprise/shared');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const { loadProjectCardProgress } = require('../../services/projectHealthRollup.service');
const {
  classifyProjectHealth,
  withProgressPercents,
} = require('../governance/directorHealth');
const { fetchProfilesByUserIds } = require('../../clients/userProfilesBatch.client');

const PM_ROLE_KEY = String(DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER || 'project_manager');

function listProjectsTimingEnabled() {
  const raw = String(process.env.LIST_PROJECTS_TIMING || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function lookupProgressMap(progressByProjectId, projectId) {
  const pid = String(projectId || '');
  if (!pid || !progressByProjectId) return null;
  if (typeof progressByProjectId.get === 'function') return progressByProjectId.get(pid) || null;
  return progressByProjectId[pid] || null;
}

/**
 * @param {object|null} progress — raw or withProgressPercents output
 * @returns {number|null} 0–100
 */
function progressPercentFromProgress(progress) {
  if (!progress) return null;
  const prog = withProgressPercents(progress);
  if (prog.percentDoneCards == null) return null;
  return Math.round(Number(prog.percentDoneCards) * 100);
}

/**
 * @param {object} project
 * @param {object|null} progress
 * @param {{ userId: string, displayName: string }|null} pm
 * @param {Date} [asOf]
 */
function buildCardSummaryFields(project, progress, pm, asOf = new Date()) {
  return {
    progressPercent: progressPercentFromProgress(progress),
    health: classifyProjectHealth(project, asOf, progress),
    pm: pm && pm.userId ? { userId: String(pm.userId), displayName: String(pm.displayName || '').trim() || '—' } : null,
  };
}

function profileDisplayName(profile, userId) {
  const uid = String(userId || '').trim();
  if (!profile) return uid ? uid.slice(-6) : '—';
  return (
    String(profile.displayName || profile.fullName || profile.name || '').trim() ||
    (uid ? uid.slice(-6) : '—')
  );
}

/**
 * Resolve PM map from membership rows + role docs (no DB).
 * @param {object[]} memberships
 * @param {object[]} roleDocs
 * @returns {Map<string, string>} projectId → userId
 */
function pmUserIdMapFromMemberships(memberships, roleDocs) {
  const map = new Map();
  const pmRoleIds = new Set(
    (roleDocs || [])
      .filter((r) => String(r?.key || '').trim().toLowerCase() === PM_ROLE_KEY)
      .map((r) => String(r._id))
  );
  if (!pmRoleIds.size) return map;

  for (const row of memberships || []) {
    const pid = String(row?.projectId || '');
    const uid = String(row?.userId || '').trim();
    const rid = String(row?.projectRoleId || '');
    if (!pid || !uid || !pmRoleIds.has(rid)) continue;
    if (!map.has(pid)) map.set(pid, uid);
  }
  return map;
}

/**
 * Load ProjectRole docs for project_manager (org default + optional project-scoped).
 * @returns {Promise<object[]|null>} null → caller should fall back to $in roleIds
 */
async function findPmRoleDocsByKey(organizationId, projectOids, findRoles) {
  const oid = String(organizationId || '').trim();
  if (!oid || !mongoose.isValidObjectId(oid)) return null;

  const orgOid = new mongoose.Types.ObjectId(oid);
  const filter = {
    organizationId: orgOid,
    key: PM_ROLE_KEY,
  };
  if (projectOids.length) {
    filter.$or = [{ projectId: null }, { projectId: { $in: projectOids } }];
  } else {
    filter.projectId = null;
  }

  return findRoles(filter, '_id key');
}

/**
 * First project_manager membership per projectId.
 * Prefers one ProjectRole query by key when organizationId is set.
 *
 * @param {string[]} projectIds
 * @param {object} [deps]
 * @param {object[]} [deps.memberships] — preloaded rows with projectId, userId, projectRoleId
 * @param {string} [deps.organizationId]
 * @returns {Promise<Map<string, string>>} projectId → userId
 */
async function loadPmUserIdByProject(projectIds, deps = {}) {
  const findMemberships =
    deps.findMemberships ||
    ((filter, projection) => ProjectMembership.find(filter).select(projection).lean());
  const findRoles =
    deps.findRoles || ((filter, projection) => ProjectRole.find(filter).select(projection).lean());

  const ids = (projectIds || [])
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.isValidObjectId(id));
  const map = new Map();
  if (!ids.length) return map;

  const idSet = new Set(ids);
  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  let memberships = Array.isArray(deps.memberships) ? deps.memberships : null;
  if (!memberships) {
    memberships = await findMemberships(
      { projectId: { $in: oids } },
      'projectId userId projectRoleId'
    );
  } else {
    memberships = memberships.filter((row) => idSet.has(String(row?.projectId || '')));
  }

  if (!(memberships || []).length) return map;

  let roleDocs = await findPmRoleDocsByKey(deps.organizationId, oids, findRoles);
  if (!roleDocs || !roleDocs.length) {
    const roleIds = [
      ...new Set(
        (memberships || [])
          .map((row) => String(row?.projectRoleId || '').trim())
          .filter(Boolean)
      ),
    ];
    if (!roleIds.length) return map;
    const roleQueryIds = roleIds.filter((id) => mongoose.isValidObjectId(id));
    roleDocs = await findRoles(
      roleQueryIds.length
        ? { _id: { $in: roleQueryIds.map((id) => new mongoose.Types.ObjectId(id)) } }
        : { _id: { $in: roleIds } },
      '_id key'
    );
  }

  return pmUserIdMapFromMemberships(memberships, roleDocs);
}

/**
 * Mutates each list item with progressPercent, health, pm (additive).
 * Failures are non-fatal — fields null / health from status only.
 *
 * @param {object[]} projects
 * @param {string} organizationId
 * @param {object} [deps]
 * @param {object[]} [deps.memberships] — preloaded ProjectMembership rows (incl. projectRoleId)
 * @param {'card'|'full'} [deps.progressMode]
 * @param {object} [deps.timingOut] — mutated with progressMs / pmMs / profilesMs when timing on
 * @returns {Promise<object[]>}
 */
async function attachListProjectCardSummaries(projects, organizationId, deps = {}) {
  const list = Array.isArray(projects) ? projects : [];
  if (!list.length) return list;

  const log = deps.logger || logger;
  const loadProgress = deps.loadProgress || loadProjectCardProgress;
  const fetchProfiles = deps.fetchProfiles || fetchProfilesByUserIds;
  const asOf = deps.asOf instanceof Date ? deps.asOf : new Date();
  const progressMode = deps.progressMode === 'card' ? 'card' : 'full';
  const wantTiming = listProjectsTimingEnabled() || Boolean(deps.timingOut);

  const projectIds = list
    .map((p) => String(p?._id || p?.projectId || '').trim())
    .filter(Boolean);

  const pmDeps = { ...deps, organizationId: String(organizationId || deps.organizationId || '') };
  if (Array.isArray(deps.memberships)) {
    pmDeps.memberships = deps.memberships;
  }

  let progressByProjectId = new Map();
  let pmUserByProject = new Map();
  let progressMs = 0;
  let pmMs = 0;

  const [progressResult, pmResult] = await Promise.all([
    (async () => {
      const t0 = Date.now();
      try {
        return await loadProgress({
          organizationId,
          projectIds,
          asOf,
          mode: progressMode,
        });
      } catch (err) {
        log.warn?.('[listProjectCardSummary] progress load failed: %s', err?.message || err);
        return new Map();
      } finally {
        progressMs = Date.now() - t0;
      }
    })(),
    (async () => {
      const t0 = Date.now();
      try {
        return await loadPmUserIdByProject(projectIds, pmDeps);
      } catch (err) {
        log.warn?.('[listProjectCardSummary] pm membership load failed: %s', err?.message || err);
        return new Map();
      } finally {
        pmMs = Date.now() - t0;
      }
    })(),
  ]);

  progressByProjectId = progressResult || new Map();
  pmUserByProject = pmResult || new Map();

  const pmUserIds = [...new Set([...pmUserByProject.values()].filter(Boolean))];
  let profiles = new Map();
  const tProfiles = Date.now();
  try {
    if (pmUserIds.length) profiles = await fetchProfiles(pmUserIds);
  } catch (err) {
    log.warn?.('[listProjectCardSummary] profile batch failed: %s', err?.message || err);
    profiles = new Map();
  }
  const profilesMs = Date.now() - tProfiles;

  if (wantTiming && deps.timingOut && typeof deps.timingOut === 'object') {
    deps.timingOut.progressMs = progressMs;
    deps.timingOut.pmMs = pmMs;
    deps.timingOut.profilesMs = profilesMs;
  }

  for (const item of list) {
    const pid = String(item?._id || item?.projectId || '').trim();
    const progress = lookupProgressMap(progressByProjectId, pid);
    const pmUserId = pmUserByProject.get(pid) || '';
    const pm = pmUserId
      ? {
          userId: pmUserId,
          displayName: profileDisplayName(
            typeof profiles.get === 'function' ? profiles.get(pmUserId) : profiles[pmUserId],
            pmUserId
          ),
        }
      : null;
    const summary = buildCardSummaryFields(item, progress, pm, asOf);
    item.progressPercent = summary.progressPercent;
    item.health = summary.health;
    item.pm = summary.pm;
  }

  return list;
}

module.exports = {
  progressPercentFromProgress,
  buildCardSummaryFields,
  profileDisplayName,
  loadPmUserIdByProject,
  pmUserIdMapFromMemberships,
  findPmRoleDocsByKey,
  attachListProjectCardSummaries,
  listProjectsTimingEnabled,
  PM_ROLE_KEY,
};
