/**
 * Create / reuse / load AI Analysis Snapshots (pin SRS + system datasets).
 */

const AiAnalysisSnapshot = require('../models/AiAnalysisSnapshot');
const RequirementPack = require('../models/RequirementPack');
const { assertRequirementPermission } = require('./requirementAccess.service');
const { buildPackContentHash } = require('../utils/aiAnalysis/aiAnalysisCompactPolicy');
const { buildSnapshotPayload } = require('../utils/aiAnalysis/pipeline/buildPipeline');
const {
  isSnapshotPipelineEnabled,
  SKILL_CATALOG_VERSION,
} = require('../utils/aiAnalysis/pipeline/pipelineConstants');

const DEFAULT_POOL_LIMIT = 200;

function toMeta(snapshot) {
  if (!snapshot) return null;
  const doc = typeof snapshot.toObject === 'function' ? snapshot.toObject() : snapshot;
  return {
    snapshotId: String(doc._id),
    packId: String(doc.packId),
    packContentHash: doc.packContentHash,
    packVersionNumber: doc.packVersionNumber,
    templateVersion: doc.templateVersion || '',
    versions: doc.versions || {},
    status: doc.status,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    pipelineVersion: doc.pipelineVersion,
    reused: Boolean(doc._reused),
  };
}

async function loadPackOrThrow({ packId, organizationId }) {
  const pack = await RequirementPack.findOne({
    _id: packId,
    organizationId,
    isActive: true,
  });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    err.errorCode = 'PACK_NOT_FOUND';
    throw err;
  }
  return pack;
}

async function loadLivePoolAndCalendar({
  organizationId,
  userId,
  packId,
}) {
  const { listOrgResourcePool } = require('./orgResourcePool.service');
  const { fetchOrgWorkingCalendar } = require('./governance.service');

  let pool;
  try {
    pool = await listOrgResourcePool({
      organizationId,
      actorUserId: userId,
      requirementPackId: String(packId),
      skipCapacityAuth: true,
      forAiPlanning: true,
      limit: DEFAULT_POOL_LIMIT,
    });
  } catch (windowErr) {
    if (windowErr.errorCode !== 'PLANNING_WINDOW_INCOMPLETE') {
      const err = new Error(
        windowErr.message || 'Failed to load organization resource pool for snapshot'
      );
      err.statusCode = windowErr.statusCode || 502;
      err.errorCode = windowErr.errorCode || 'POOL_LOAD_FAILED';
      err.cause = windowErr;
      throw err;
    }
    pool = await listOrgResourcePool({
      organizationId,
      actorUserId: userId,
      skipCapacityAuth: true,
      forAiPlanning: true,
      limit: DEFAULT_POOL_LIMIT,
    });
  }

  const poolItems = Array.isArray(pool?.items)
    ? pool.items
    : Array.isArray(pool)
      ? pool
      : [];

  let calendar = { workingCalendar: {}, holidays: [] };
  try {
    calendar = await fetchOrgWorkingCalendar(organizationId);
  } catch {
    calendar = { workingCalendar: {}, holidays: [] };
  }

  return { poolItems, calendar };
}

/**
 * Default skill catalog pin (registry off) — names from projected staffing + whitelist stub.
 */
function buildSkillCatalogStub(pack) {
  const names = new Set();
  for (const s of pack?.staffingPlan?.requiredSkills || []) {
    if (s?.name) names.add(String(s.name).trim());
  }
  for (const s of pack?.requirementSkills || []) {
    const n = s.skillNameSnapshot || s.rawInput;
    if (n) names.add(String(n).trim());
  }
  return {
    version: SKILL_CATALOG_VERSION,
    skills: [...names].filter(Boolean).slice(0, 200),
  };
}

/**
 * Create or reuse active snapshot for packContentHash.
 */
async function createOrReuseAiAnalysisSnapshot({
  userId,
  organizationId,
  packId,
  force = false,
}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const pack = await loadPackOrThrow({ packId, organizationId });
  const packObj = typeof pack.toObject === 'function' ? pack.toObject() : pack;
  const packContentHash = buildPackContentHash(packObj);

  if (!force) {
    const existing = await AiAnalysisSnapshot.findOne({
      organizationId,
      packId,
      packContentHash,
      status: 'active',
    }).sort({ createdAt: -1 });

    if (existing) {
      if (String(pack.aiAnalysisActiveSnapshotId || '') !== String(existing._id)) {
        pack.aiAnalysisActiveSnapshotId = existing._id;
        pack.aiAnalysisSnapshotMeta = toMeta(existing);
        pack.markModified('aiAnalysisSnapshotMeta');
        await pack.save();
      }
      const lean = existing.toObject();
      lean._reused = true;
      return { snapshot: existing, meta: { ...toMeta(lean), reused: true } };
    }
  }

  const { poolItems, calendar } = await loadLivePoolAndCalendar({
    organizationId,
    userId,
    packId,
  });
  const skillCatalog = buildSkillCatalogStub(packObj);
  const payload = buildSnapshotPayload({
    pack: packObj,
    poolItems,
    calendar,
    skillCatalog,
    packContentHash,
    packStatus: pack.status,
  });

  // Supersede other active snapshots for this pack
  await AiAnalysisSnapshot.updateMany(
    { organizationId, packId, status: 'active' },
    { $set: { status: 'superseded', supersededAt: new Date() } }
  );

  const snapshot = await AiAnalysisSnapshot.create({
    organizationId,
    packId,
    packContentHash: payload.packContentHash,
    packVersionNumber: payload.packVersionNumber,
    templateVersion: payload.templateVersion,
    versions: payload.versions,
    sourcesResolved: payload.sourcesResolved,
    projected: payload.projected,
    canonical: payload.canonical,
    merged: payload.merged,
    commonFiltered: payload.commonFiltered,
    preparedByJob: payload.preparedByJob,
    ingestionValidation: payload.ingestionValidation,
    pipelineVersion: payload.pipelineVersion,
    status: 'active',
    createdBy: userId,
  });

  pack.aiAnalysisActiveSnapshotId = snapshot._id;
  pack.aiAnalysisSnapshotMeta = toMeta(snapshot);
  pack.markModified('aiAnalysisSnapshotMeta');

  // Recipe tools (Group A) — additive Baseline Facts; soft-fail never blocks snapshot
  try {
    const {
      isRequirementToolsRecipeEnabled,
      tryBuildRequirementToolsAnalysis,
    } = require('../utils/tools');
    const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
    if (isRequirementToolsRecipeEnabled()) {
      const snapObj = typeof snapshot.toObject === 'function' ? snapshot.toObject() : snapshot;
      const built = tryBuildRequirementToolsAnalysis({
        pack: packObj,
        snapshot: snapObj,
        aiAnalysis: pack.aiAnalysis,
      });
      const container = ensureAiAnalysisContainer(pack.aiAnalysis);
      container.analyses.requirementTools = built.analysis;
      pack.aiAnalysis = container;
      pack.markModified('aiAnalysis');
    }
  } catch {
    // ignore — snapshot already created
  }

  await pack.save();

  return { snapshot, meta: { ...toMeta(snapshot), reused: false } };
}

async function getActiveAiAnalysisSnapshotMeta({ userId, organizationId, packId }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:view',
  });

  const pack = await loadPackOrThrow({ packId, organizationId });
  const activeId = pack.aiAnalysisActiveSnapshotId;
  if (!activeId) {
    return null;
  }

  const snapshot = await AiAnalysisSnapshot.findOne({
    _id: activeId,
    organizationId,
    packId,
  }).select(
    'packContentHash packVersionNumber templateVersion versions status createdAt createdBy pipelineVersion packId'
  );

  if (!snapshot) return null;
  return toMeta(snapshot);
}

async function loadActiveSnapshotDocument({ organizationId, packId, pack }) {
  const activeId = pack?.aiAnalysisActiveSnapshotId;
  if (!activeId) return null;
  return AiAnalysisSnapshot.findOne({
    _id: activeId,
    organizationId,
    packId,
    status: 'active',
  });
}

function assertSnapshotRequired(snapshot) {
  if (snapshot) return;
  if (!isSnapshotPipelineEnabled()) return;
  const err = new Error(
    'Analysis Snapshot bắt buộc trước khi chạy AI — hãy Start lại (snapshot sẽ được tạo tự động)'
  );
  err.statusCode = 422;
  err.errorCode = 'AI_SNAPSHOT_REQUIRED';
  throw err;
}

/**
 * Load active snapshot or create/reuse one — pack already known; no pack re-select.
 * @returns {{ pack, snapshotDoc, snapshotId, meta }}
 */
async function ensureActiveAiAnalysisSnapshot({
  userId,
  organizationId,
  packId,
  pack: packIn = null,
}) {
  let pack = packIn;
  if (!pack) {
    pack = await loadPackOrThrow({ packId, organizationId });
  }

  if (!isSnapshotPipelineEnabled()) {
    const id = pack.aiAnalysisActiveSnapshotId
      ? String(pack.aiAnalysisActiveSnapshotId)
      : null;
    return { pack, snapshotDoc: null, snapshotId: id, meta: null };
  }

  let snapshotDoc = await loadActiveSnapshotDocument({
    organizationId,
    packId,
    pack,
  });
  if (snapshotDoc) {
    return {
      pack,
      snapshotDoc,
      snapshotId: String(snapshotDoc._id),
      meta: toMeta(snapshotDoc),
    };
  }

  const created = await createOrReuseAiAnalysisSnapshot({
    userId,
    organizationId,
    packId,
  });
  // Reload pack — createOrReuse mutates aiAnalysisActiveSnapshotId
  pack = await loadPackOrThrow({ packId, organizationId });
  snapshotDoc = await loadActiveSnapshotDocument({
    organizationId,
    packId,
    pack,
  });
  if (!snapshotDoc) {
    assertSnapshotRequired(null);
  }
  return {
    pack,
    snapshotDoc,
    snapshotId: String(snapshotDoc._id),
    meta: created?.meta || toMeta(snapshotDoc),
  };
}

module.exports = {
  createOrReuseAiAnalysisSnapshot,
  getActiveAiAnalysisSnapshotMeta,
  loadActiveSnapshotDocument,
  assertSnapshotRequired,
  ensureActiveAiAnalysisSnapshot,
  toMeta,
  buildSkillCatalogStub,
  isSnapshotPipelineEnabled,
};
