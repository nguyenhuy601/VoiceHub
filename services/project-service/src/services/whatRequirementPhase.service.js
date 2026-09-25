/**
 * Orchestrate AI Requirement WHAT phase on project-service (serial jobs + materialize).
 * Returns 202 immediately; work continues in background via setImmediate.
 */

const { AI_ANALYSIS_WHAT_JOBS } = require('../constants/aiAnalysisJobs.constants');
const {
  ensureAiAnalysisContainer,
} = require('../utils/aiAnalysis/aiAnalysisContainer');
const {
  applyProposedSrsToPack,
  acceptAllHierarchyProposals,
} = require('../utils/aiAnalysis/applyProposedSrsToPack');
const CustomerDocument = require('../models/CustomerDocument');
const RequirementPack = require('../models/RequirementPack');

function isHitlAutoWhatEnabled() {
  // Wave 1 hướng B: default OFF — Understanding deterministic before Gate 1.
  const raw = String(process.env.HITL_AUTO_WHAT ?? '0').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== '';
}

function isAutoWhatConfirmEnabled() {
  const raw = String(process.env.AUTO_WHAT_CONFIRM ?? '0').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== '';
}

/**
 * Pure helper — WHAT job order for tests / policy.
 */
function getWhatJobOrder() {
  return [...AI_ANALYSIS_WHAT_JOBS];
}

/**
 * List intake docs for WHAT corpus metadata (filenames only in snapshot).
 */
async function loadInputDocumentsForPack({ organizationId, packId, projectId }) {
  const filter = {
    organizationId,
    isActive: true,
    $or: [{ packId }, ...(projectId ? [{ projectId }] : [])],
  };
  const rows = await CustomerDocument.find(filter)
    .select('_id filename docClass packId projectId')
    .sort({ createdAt: 1 })
    .lean();
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const id = String(row._id);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      documentId: id,
      filename: String(row.filename || '').slice(0, 260),
      docClass: String(row.docClass || '').slice(0, 64) || undefined,
    });
  }
  return items;
}

function patchPhaseWhat(container, patch) {
  const next = ensureAiAnalysisContainer(container);
  next.phaseRuns = {
    ...(next.phaseRuns || {}),
    phase_what: {
      ...(next.phaseRuns?.phase_what || {}),
      ...patch,
    },
  };
  return next;
}

/**
 * Persist pack sheets from applyProposedSrsToPack + seed AnalysisArtifacts.
 */
async function materializeWhatToArtifacts({ userId, pack }) {
  const projectId = pack.projectId ? String(pack.projectId) : '';
  if (!projectId) {
    return { seeded: 0, skipped: true, reason: 'no_projectId' };
  }

  const { pack: mapped, meta } = applyProposedSrsToPack(
    pack.toObject ? pack.toObject() : pack,
    pack.aiAnalysis
  );

  pack.overview = mapped.overview || pack.overview;
  pack.scope = mapped.scope || pack.scope;
  pack.businessGoals = mapped.businessGoals || pack.businessGoals;
  pack.businessRules = mapped.businessRules || pack.businessRules;
  pack.businessProcesses = mapped.businessProcesses || pack.businessProcesses;
  pack.functionalRequirements = mapped.functionalRequirements || pack.functionalRequirements;
  pack.useCases = mapped.useCases || pack.useCases;
  pack.nonFunctionalRequirements =
    mapped.nonFunctionalRequirements || pack.nonFunctionalRequirements;
  pack.aiAnalysis = mapped.aiAnalysis || pack.aiAnalysis;

  pack.markModified('overview');
  pack.markModified('scope');
  pack.markModified('businessGoals');
  pack.markModified('businessRules');
  pack.markModified('businessProcesses');
  pack.markModified('functionalRequirements');
  pack.markModified('useCases');
  pack.markModified('nonFunctionalRequirements');
  pack.markModified('aiAnalysis');
  await pack.save();

  const { seedArtifactsFromRequirementPack } = require('./analysis.service');
  const seeded = await seedArtifactsFromRequirementPack({
    userId,
    projectId,
    pack: pack.toObject ? pack.toObject() : pack,
  });

  return {
    seeded: seeded?.seeded || 0,
    byKind: seeded?.byKind || null,
    meta,
  };
}

/**
 * Load MinIO buffers → extract corpus + optional Raw xlsx prefill; persist on pack.
 */
async function prepareIntakeCorpusAndPrefill({ pack, organizationId, packId }) {
  const { buildIntakeCorpus } = require('../utils/aiAnalysis/buildIntakeCorpus');
  const {
    prefillPackFromRawWorkbook,
  } = require('../utils/aiAnalysis/prefillPackFromRawWorkbook');
  const { clampOverviewForPack } = require('../utils/requirement/requirementOverviewClamp');

  const filter = {
    organizationId,
    isActive: true,
    $or: [
      { packId },
      ...(pack.projectId ? [{ projectId: pack.projectId }] : []),
    ],
  };
  const docs = await CustomerDocument.find(filter)
    .select('_id filename docClass mimeType storageKey packId projectId')
    .sort({ createdAt: 1 })
    .lean();

  // Prefill from first customer_raw xlsx when possible
  const rawDoc = docs.find(
    (d) =>
      String(d.docClass || '') === 'customer_raw' &&
      /\.xlsx?$/i.test(String(d.filename || ''))
  );
  if (rawDoc?.storageKey) {
    try {
      const objectStorage = require('../utils/common/objectStorage');
      if (objectStorage.isEnabled()) {
        const buf = await objectStorage.getObjectBuffer(rawDoc.storageKey);
        const { pack: merged, meta } = prefillPackFromRawWorkbook(
          pack.toObject ? pack.toObject() : pack,
          buf,
          { filename: rawDoc.filename }
        );
        if (meta.applied) {
          pack.overview = merged.overview || pack.overview;
          pack.scope = merged.scope || pack.scope;
          pack.functionalRequirements =
            merged.functionalRequirements || pack.functionalRequirements;
          pack.nonFunctionalRequirements =
            merged.nonFunctionalRequirements || pack.nonFunctionalRequirements;
          pack.businessGoals = merged.businessGoals || pack.businessGoals;
          pack.businessRules = merged.businessRules || pack.businessRules;
          pack.businessProcesses = merged.businessProcesses || pack.businessProcesses;
          pack.useCases = merged.useCases || pack.useCases;
          pack.markModified('overview');
          pack.markModified('scope');
          pack.markModified('functionalRequirements');
          pack.markModified('nonFunctionalRequirements');
          pack.markModified('businessGoals');
          pack.markModified('businessRules');
          pack.markModified('businessProcesses');
          pack.markModified('useCases');
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[phase_what] raw prefill skipped', {
        packId: String(packId),
        message: err.message,
      });
    }
  }

  const corpus = await buildIntakeCorpus(docs);
  let container = ensureAiAnalysisContainer(pack.aiAnalysis);
  // Staging for future WHAT prompt inject — do NOT copy into overview.businessScope
  // (schema maxlength 4000; corpus lives only on aiAnalysis.intakeCorpus).
  container.intakeCorpus = {
    schemaVersion: corpus.schemaVersion,
    excerpts: corpus.excerpts,
    totalChars: corpus.totalChars,
    skipped: corpus.skipped,
    builtAt: corpus.builtAt,
    durationMs: corpus.durationMs,
  };
  container.inputDocuments = docs.map((d) => ({
    documentId: String(d._id),
    filename: String(d.filename || '').slice(0, 260),
    docClass: String(d.docClass || '').slice(0, 64) || undefined,
  }));

  // Prefill/overview may exceed schema caps — clamp before save.
  if (pack.overview && typeof pack.overview === 'object') {
    pack.overview = clampOverviewForPack(pack.overview);
    pack.markModified('overview');
  }

  pack.aiAnalysis = container;
  pack.markModified('aiAnalysis');
  await pack.save();

  // eslint-disable-next-line no-console
  console.info('[phase_what] intakeCorpus built', {
    packId: String(packId),
    excerpts: corpus.excerpts.length,
    totalChars: corpus.totalChars,
    skipped: corpus.skipped.length,
    durationMs: corpus.durationMs,
  });

  return { corpus };
}

/**
 * Ensure hierarchy proposals accepted + capability has at least one stub item.
 */
async function prepareAutoConfirm(pack, job) {
  let container = ensureAiAnalysisContainer(pack.aiAnalysis);
  if (job === 'hierarchyDecomposition') {
    container = acceptAllHierarchyProposals(container);
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  }
  if (job === 'capabilityAnalysis') {
    const items = container.analyses?.capability?.items;
    if (!Array.isArray(items) || items.length === 0) {
      container.analyses = container.analyses || {};
      container.analyses.capability = {
        ...(container.analyses.capability || {}),
        items: [
          {
            id: 'CAP-AUTO-001',
            name: 'General capability',
            description: 'Auto-stub for empty capabilityAnalysis (WHAT auto-confirm)',
          },
        ],
        status: 'ready',
      };
      if (container.jobs?.capabilityAnalysis) {
        container.jobs.capabilityAnalysis = {
          ...container.jobs.capabilityAnalysis,
          status: 'ready',
          error: null,
        };
      }
      pack.aiAnalysis = container;
      pack.aiAnalysisStatus = 'ready';
      pack.markModified('aiAnalysis');
      await pack.save();
    }
  }
}

/**
 * Background runner — REMOVED job-by-job WHAT loop (RULE-JJ-01).
 * Legacy entry marks phase_what failed; use phase_what G4 remote instead.
 */
async function runWhatRequirementPhaseBackground({
  userId,
  organizationId,
  packId,
  runId,
}) {
  void userId;
  const startedAt = Date.now();
  let pack = await RequirementPack.findOne({ _id: packId, organizationId });
  if (!pack) {
    return { ok: false, error: 'PACK_NOT_FOUND' };
  }

  let container = ensureAiAnalysisContainer(pack.aiAnalysis);
  container = patchPhaseWhat(container, {
    status: 'failed',
    remoteRunId: runId || container.phaseRuns?.phase_what?.remoteRunId || null,
    finishedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - startedAt),
    error: {
      code: 'JOB_BY_JOB_REMOVED',
      message: 'Legacy WHAT job loop removed — use phase_what G4 via phase-run',
    },
  });
  pack.aiAnalysis = container;
  pack.aiAnalysisStatus = 'failed';
  pack.markModified('aiAnalysis');
  await pack.save();
  return { ok: false, error: 'JOB_BY_JOB_REMOVED' };
}

/**
 * Start WHAT phase — removed job-by-job loop (RULE-JJ-01).
 * Use startPhaseAiPlanningRun({ phase: 'what' }) / phase-run instead.
 */
async function startWhatRequirementPhase({
  userId,
  organizationId,
  packId,
  force = false,
}) {
  void userId;
  void organizationId;
  void packId;
  void force;
  if (!isHitlAutoWhatEnabled()) {
    const err = new Error('HITL auto WHAT is disabled (HITL_AUTO_WHAT=0)');
    err.statusCode = 503;
    err.errorCode = 'HITL_AUTO_WHAT_DISABLED';
    throw err;
  }
  const err = new Error(
    'Legacy auto WHAT job loop removed — use phase_what via POST …/ai-analysis/phase-run'
  );
  err.statusCode = 410;
  err.errorCode = 'JOB_BY_JOB_REMOVED';
  throw err;
}

/**
 * Understanding prepare only (hướng B Wave 1): prefill + intakeCorpus + snapshot + tools.
 * Does NOT run LLM WHAT jobs or materialize artifacts as baseline.
 */
async function prepareUnderstandingOnly({ userId, organizationId, packId }) {
  const { assertRequirementPermission } = require('./requirementAccess.service');
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  let pack = await RequirementPack.findOne({ _id: packId, organizationId });
  if (!pack) {
    const err = new Error('RequirementPack không tồn tại');
    err.statusCode = 404;
    err.errorCode = 'PACK_NOT_FOUND';
    throw err;
  }

  const { ensureActiveAiAnalysisSnapshot } = require('./aiAnalysisSnapshot.service');
  await ensureActiveAiAnalysisSnapshot({
    userId,
    organizationId,
    packId,
    pack,
  });
  pack = await RequirementPack.findOne({ _id: packId, organizationId });
  if (!pack) {
    const err = new Error('RequirementPack không tồn tại');
    err.statusCode = 404;
    err.errorCode = 'PACK_NOT_FOUND';
    throw err;
  }

  const { corpus } = await prepareIntakeCorpusAndPrefill({
    pack,
    organizationId,
    packId,
  });
  pack = await RequirementPack.findOne({ _id: packId, organizationId });

  let toolsRan = false;
  try {
    const {
      isRequirementToolsRecipeEnabled,
      tryBuildRequirementToolsAnalysis,
    } = require('../utils/tools');
    const { ensureAiAnalysisContainer: ensureContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
    if (isRequirementToolsRecipeEnabled() && pack) {
      const packObj = pack.toObject ? pack.toObject() : pack;
      const built = tryBuildRequirementToolsAnalysis({
        pack: packObj,
        snapshot: null,
        aiAnalysis: pack.aiAnalysis,
      });
      if (built?.ok && built.analysis) {
        const container = ensureContainer(pack.aiAnalysis);
        container.analyses = container.analyses || {};
        container.analyses.requirementTools = built.analysis;
        pack.aiAnalysis = container;
        pack.markModified('aiAnalysis');
        await pack.save();
        toolsRan = true;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[understanding] tools soft-fail', {
      packId: String(packId),
      message: err.message,
    });
  }

  const excerptsCount = Array.isArray(corpus?.excerpts) ? corpus.excerpts.length : 0;
  const skippedCount = Array.isArray(corpus?.skipped) ? corpus.skipped.length : 0;
  const intakeCorpusChars = Number(corpus?.totalChars) || 0;

  // eslint-disable-next-line no-console
  console.info('[understanding] prepared', {
    packId: String(packId),
    intakeCorpusChars,
    excerptsCount,
    toolsRan,
  });

  return {
    prepared: true,
    mode: 'prepare_only',
    packId: String(packId),
    status: String(pack?.status || ''),
    intakeCorpusChars,
    excerptsCount,
    skippedCount,
    toolsRan,
    snapshotId: pack?.aiAnalysisActiveSnapshotId
      ? String(pack.aiAnalysisActiveSnapshotId)
      : null,
    httpStatus: 200,
  };
}

module.exports = {
  isHitlAutoWhatEnabled,
  isAutoWhatConfirmEnabled,
  getWhatJobOrder,
  loadInputDocumentsForPack,
  startWhatRequirementPhase,
  runWhatRequirementPhaseBackground,
  materializeWhatToArtifacts,
  prepareIntakeCorpusAndPrefill,
  prepareUnderstandingOnly,
  patchPhaseWhat,
};
