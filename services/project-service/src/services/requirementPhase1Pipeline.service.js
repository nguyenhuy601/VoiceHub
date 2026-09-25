/**
 * Phase 1 tool-first pipeline — 2 stages (no 4 WHAT jobs).
 * Stage1: input readiness (corpus/prefill/snapshot).
 * Stage2: requirement tools → AI context → 1 projection prompt → materialize draft artifacts.
 */

const RequirementPack = require('../models/RequirementPack');
const {
  prepareUnderstandingOnly,
  materializeWhatToArtifacts,
} = require('./whatRequirementPhase.service');
const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');

function countSheetRows(pack) {
  const fr = Array.isArray(pack?.functionalRequirements)
    ? pack.functionalRequirements.length
    : 0;
  const nfr = Array.isArray(pack?.nonFunctionalRequirements || pack?.nfrs)
    ? (pack.nonFunctionalRequirements || pack.nfrs).length
    : 0;
  const bg = Array.isArray(pack?.businessGoals) ? pack.businessGoals.length : 0;
  const scope = Array.isArray(pack?.scope) ? pack.scope.length : 0;
  return { fr, nfr, bg, scope };
}

/**
 * Readiness checklist for Stage 1 (no corpus text).
 * system_supplement_partial only when skill catalog stub was never wired.
 */
function buildPhase1Readiness(pack, stage1Meta = {}) {
  const missing = [];
  const docsCount = Number(stage1Meta.excerptsCount != null
    ? // prefer docs from inputDocuments when present
      Array.isArray(pack?.aiAnalysis?.inputDocuments)
        ? pack.aiAnalysis.inputDocuments.length
        : stage1Meta.excerptsCount
    : Array.isArray(pack?.aiAnalysis?.inputDocuments)
      ? pack.aiAnalysis.inputDocuments.length
      : 0);
  const intakeCorpusChars =
    Number(stage1Meta.intakeCorpusChars) ||
    Number(pack?.aiAnalysis?.intakeCorpus?.totalChars) ||
    0;
  const snapshotId = pack?.aiAnalysisActiveSnapshotId
    ? String(pack.aiAnalysisActiveSnapshotId)
    : stage1Meta.snapshotId
      ? String(stage1Meta.snapshotId)
      : null;
  const sheets = countSheetRows(pack);
  const prefillApplied = sheets.fr + sheets.nfr + sheets.bg + sheets.scope > 0;

  if (docsCount <= 0) missing.push('no_customer_documents');
  if (intakeCorpusChars <= 0) missing.push('empty_intake_corpus');
  if (!snapshotId) missing.push('no_analysis_snapshot');
  if (!prefillApplied && intakeCorpusChars > 0) {
    missing.push('no_structured_sheets_yet');
  }

  // System supplement: Part 2 wires skillCatalogStub (may be empty skills[]).
  const sources = pack?.aiAnalysis?.sources || pack?.aiAnalysis?.projectAllSources || null;
  const stub = pack?.aiAnalysis?.skillCatalogStub;
  const systemSourcesPresent = Boolean(
    sources?.skill_catalog ||
      sources?.skillCatalog ||
      (stub && typeof stub === 'object' && Array.isArray(stub.skills))
  );
  // Do not treat empty stub skills as "missing" — full org/calendar supplement is out of scope.
  if (!systemSourcesPresent) missing.push('system_supplement_partial');

  return {
    docsCount,
    intakeCorpusChars,
    excerptsCount: Number(stage1Meta.excerptsCount) || 0,
    skippedCount: Number(stage1Meta.skippedCount) || 0,
    prefillApplied,
    sheetCounts: sheets,
    systemSourcesPresent,
    skillCatalogSkillCount: Array.isArray(stub?.skills) ? stub.skills.length : 0,
    snapshotId,
    missing,
    packStatus: String(pack?.status || stage1Meta.status || ''),
  };
}

/**
 * Persist skill catalog stub on pack so Stage1 readiness / Knowledge can use it.
 */
async function ensureStage1SkillCatalogStub(pack) {
  if (!pack) return null;
  const { buildSkillCatalogStub } = require('./aiAnalysisSnapshot.service');
  const packObj = pack.toObject ? pack.toObject() : pack;
  const stub = buildSkillCatalogStub(packObj);
  const container = ensureAiAnalysisContainer(pack.aiAnalysis);
  container.skillCatalogStub = stub;
  // Soft pin under sources for readiness checks
  container.sources = {
    ...(container.sources && typeof container.sources === 'object' ? container.sources : {}),
    skillCatalog: {
      version: stub.version,
      skillCount: Array.isArray(stub.skills) ? stub.skills.length : 0,
    },
  };
  pack.aiAnalysis = container;
  pack.markModified('aiAnalysis');
  await pack.save();
  return stub;
}

/**
 * Stage 1 — prepare input (reuse Understanding). No LLM stage-2 projection.
 */
async function runPhase1Stage1PrepareInput({ userId, organizationId, packId }) {
  const base = await prepareUnderstandingOnly({
    userId,
    organizationId,
    packId,
  });

  let pack = await RequirementPack.findOne({ _id: packId, organizationId });
  if (pack) {
    try {
      await ensureStage1SkillCatalogStub(pack);
      pack = await RequirementPack.findOne({ _id: packId, organizationId });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[phase1] stage1 skillCatalogStub soft-fail', {
        packId: String(packId),
        message: err.message,
      });
    }
  }

  const readiness = buildPhase1Readiness(pack, base);

  // eslint-disable-next-line no-console
  console.info('[phase1] stage1 ready', {
    packId: String(packId),
    intakeCorpusChars: readiness.intakeCorpusChars,
    docsCount: readiness.docsCount,
    systemSourcesPresent: readiness.systemSourcesPresent,
    missing: readiness.missing,
  });

  return {
    prepared: true,
    mode: 'prepare_only',
    stage: 1,
    packId: String(packId),
    status: readiness.packStatus,
    intakeCorpusChars: readiness.intakeCorpusChars,
    excerptsCount: readiness.excerptsCount,
    skippedCount: readiness.skippedCount,
    toolsRan: Boolean(base.toolsRan),
    snapshotId: readiness.snapshotId,
    readiness,
    httpStatus: 200,
  };
}

/**
 * Stage 2 — tools first, then one projection prompt, then seed draft artifacts.
 */
async function runPhase1Stage2ToolsThenPropose({
  userId,
  organizationId,
  packId,
  force = false,
  feedback = '',
  generateJsonFn = null,
}) {
  const { assertRequirementPermission } = require('./requirementAccess.service');
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const {
    assemblePhase1KnowledgeContext,
    toPersistedKnowledgeMeta,
    sanitizePhase1Feedback,
    isPhase1KnowledgeStubEnabled,
  } = require('../utils/aiAnalysis/phase1KnowledgeContext');
  const feedbackClean = sanitizePhase1Feedback(feedback);
  if (feedbackClean) {
    // eslint-disable-next-line no-console
    console.info('[phase1] loop1 feedbackChars=%d', feedbackClean.length);
  }

  let pack = await RequirementPack.findOne({ _id: packId, organizationId });
  if (!pack) {
    const err = new Error('RequirementPack không tồn tại');
    err.statusCode = 404;
    err.errorCode = 'PACK_NOT_FOUND';
    throw err;
  }

  const {
    ensureActiveAiAnalysisSnapshot,
    buildSkillCatalogStub,
  } = require('./aiAnalysisSnapshot.service');
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

  // Ensure corpus exists (Stage1 may have been skipped)
  const corpus = pack.aiAnalysis?.intakeCorpus;
  if (!corpus || !Array.isArray(corpus.excerpts) || !corpus.excerpts.length) {
    const { prepareIntakeCorpusAndPrefill } = require('./whatRequirementPhase.service');
    await prepareIntakeCorpusAndPrefill({ pack, organizationId, packId });
    pack = await RequirementPack.findOne({ _id: packId, organizationId });
  }

  let toolsRan = false;
  let requirementTools = null;
  try {
    const {
      isRequirementToolsRecipeEnabled,
      tryBuildRequirementToolsAnalysis,
    } = require('../utils/tools');
    if (isRequirementToolsRecipeEnabled() && pack) {
      const packObj = pack.toObject ? pack.toObject() : pack;
      const built = tryBuildRequirementToolsAnalysis({
        pack: packObj,
        snapshot: null,
        aiAnalysis: pack.aiAnalysis,
      });
      if (built?.ok && built.analysis) {
        const container = ensureAiAnalysisContainer(pack.aiAnalysis);
        container.analyses = container.analyses || {};
        container.analyses.requirementTools = built.analysis;
        pack.aiAnalysis = container;
        pack.markModified('aiAnalysis');
        await pack.save();
        toolsRan = true;
        requirementTools = built.analysis;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[phase1] stage2 tools soft-fail', {
      packId: String(packId),
      message: err.message,
    });
  }

  pack = await RequirementPack.findOne({ _id: packId, organizationId });
  requirementTools =
    requirementTools || pack?.aiAnalysis?.analyses?.requirementTools || null;

  // On-demand evidence (ambiguity/gap) — tools only
  let extras = {};
  try {
    const { ensureRequirementEvidence } = require('../utils/tools/ensureRequirementEvidence');
    const evidence = ensureRequirementEvidence({
      pack: pack.toObject ? pack.toObject() : pack,
      requirementTools,
      need: ['ambiguity', 'gap'],
    });
    extras = evidence.extras || {};
    if (Array.isArray(evidence.results?.gap?.data?.items)) {
      extras.gapItems = evidence.results.gap.data.items;
    }
    if (evidence.requirementTools) {
      requirementTools = evidence.requirementTools;
      const container = ensureAiAnalysisContainer(pack.aiAnalysis);
      container.analyses = container.analyses || {};
      container.analyses.requirementTools = requirementTools;
      pack.aiAnalysis = container;
      pack.markModified('aiAnalysis');
      await pack.save();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[phase1] stage2 evidence soft-fail', {
      packId: String(packId),
      message: err.message,
    });
  }

  const packObj = pack.toObject ? pack.toObject() : pack;
  const skillCatalog = buildSkillCatalogStub(packObj);

  // Wave A — evidence spans from intake corpus
  const {
    extractEvidenceSpans,
    toPersistedEvidenceSpans,
  } = require('../utils/tools/evidence/evidenceSpanExtract');
  const extracted = extractEvidenceSpans(packObj);
  const evidenceSpans = extracted.spans || [];

  // Wave C — retrieve top-K over spans (stub keyword; off → first-K)
  const {
    retrieveEvidenceContext,
    getPhase1RagMode,
  } = require('../utils/aiAnalysis/phase1EvidenceRetrieve');
  const retrieveQuery = [
    String(packObj?.overview?.requirementName || ''),
    String(packObj?.overview?.projectObjective || ''),
    String(feedbackClean || ''),
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
  const retrieved = retrieveEvidenceContext({
    query: retrieveQuery || 'requirement',
    spans: evidenceSpans,
    topK: 8,
  });
  const retrievedSpans = retrieved.spans || [];

  const knowledge = isPhase1KnowledgeStubEnabled()
    ? assemblePhase1KnowledgeContext({
        pack: packObj,
        skillCatalog,
        evidenceSpans,
        retrievedSpans: getPhase1RagMode() === 'stub' ? retrievedSpans : null,
      })
    : null;

  let semanticSummary = null;
  try {
    const { projectCanonicalBundle } = require('../utils/tools/projectCanonicalBundle');
    const { semanticMerge } = require('../utils/aiAnalysis/pipeline/semanticMerge');
    const bundle = projectCanonicalBundle({
      pack: packObj,
      snapshot: null,
      aiAnalysis: pack.aiAnalysis,
    });
    const merged = semanticMerge({
      fr: Array.isArray(bundle.fr) ? bundle.fr : [],
      requirementSkills: Array.isArray(bundle.capabilities)
        ? bundle.capabilities.map((c) => ({
            externalId: c.id || c.frId,
            skillCanonicalId: c.skillId || c.name,
          }))
        : [],
      technology: [],
    });
    const links = Array.isArray(merged.links) ? merged.links : [];
    const frWithLinks = new Set(links.map((l) => l.from).filter(Boolean)).size;
    semanticSummary = { linkCount: links.length, frWithLinks };
  } catch {
    semanticSummary = { linkCount: 0, frWithLinks: 0 };
  }

  const {
    runPhase1ProjectionPrompt,
  } = require('../utils/aiAnalysis/runPhase1ProjectionPrompt');
  const { buildRequirementAiContext } = require('../utils/tools/buildRequirementAiContext');
  // RULE-11: Stage2 local path is heuristic-only (no Ollama). Prefer remote phase_what.
  const prevPropose = process.env.PHASE1_TOOLS_PROPOSE;
  process.env.PHASE1_TOOLS_PROPOSE = '0';
  let projection;
  try {
    projection = await runPhase1ProjectionPrompt({
      pack: packObj,
      requirementTools,
      extras,
      knowledge,
      semanticSummary,
      feedback: feedbackClean,
      evidenceSpans,
    });
  } finally {
    if (prevPropose === undefined) delete process.env.PHASE1_TOOLS_PROPOSE;
    else process.env.PHASE1_TOOLS_PROPOSE = prevPropose;
  }

  // Wave B — grounding check before materialize (skip when no spans — cannot ground)
  const {
    applyGroundingToSeedRows,
    getPhase1GroundingMode,
  } = require('../utils/tools/evidence/claimGroundingCheck');
  let seedFrList = Array.isArray(projection.seedFrList)
    ? projection.seedFrList
    : null;
  let groundingPassCount = 0;
  let groundingFailCount = 0;
  let seededSkippedGrounding = 0;
  const groundingMode = getPhase1GroundingMode();
  const canGround = groundingMode !== 'off' && evidenceSpans.length > 0;
  if (seedFrList && canGround) {
    const grounded = applyGroundingToSeedRows(seedFrList, evidenceSpans, {
      mode: groundingMode,
    });
    seedFrList = grounded.rows;
    groundingPassCount = grounded.passCount;
    groundingFailCount = grounded.failCount;
    seededSkippedGrounding = grounded.skippedGrounding;
  }

  const requirementAiContext =
    projection.requirementAiContext ||
    buildRequirementAiContext({
      pack: packObj,
      requirementTools,
      extras,
      knowledge,
      semanticSummary,
    });

  {
    const container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container.analyses = container.analyses || {};
    container.analyses.requirementInsights = projection.insights;
    container.analyses.proposedSrs = projection.proposedSrs;
    container.analyses.requirementAiContext = requirementAiContext;
    container.analyses.phase1Knowledge = toPersistedKnowledgeMeta(knowledge);
    container.analyses.evidenceSpans = toPersistedEvidenceSpans(evidenceSpans);
    container.analyses.phase1EvidenceRetrieve = {
      mode: retrieved.mode,
      count: Number(retrieved.count) || 0,
      ids: (retrieved.ids || []).slice(0, 20),
    };
    if (seedFrList && seedFrList.length) {
      container.analyses.phase1SeedFr = seedFrList;
    }
    if (projection.hierarchy) {
      const prev = container.analyses.hierarchy || {};
      let proposedRequirements = (projection.hierarchy.proposedRequirements || []).map(
        (r) => ({
          ...r,
          status: 'accepted',
        })
      );
      if (groundingMode !== 'off' && evidenceSpans.length > 0 && proposedRequirements.length) {
        const g = applyGroundingToSeedRows(
          proposedRequirements.map((r) => ({
            ...r,
            level: 'Requirement',
            description: r.description || r.title,
          })),
          evidenceSpans,
          { mode: groundingMode }
        );
        groundingPassCount += g.passCount;
        groundingFailCount += g.failCount;
        seededSkippedGrounding += g.skippedGrounding;
        proposedRequirements = g.rows.map(({ level, ...rest }) => rest);
      }
      container.analyses.hierarchy = {
        ...prev,
        proposedFeatures: (projection.hierarchy.proposedFeatures || []).map((f) => ({
          ...f,
          status: 'accepted',
        })),
        proposedRequirements,
      };
    }
    container.phaseRuns = container.phaseRuns || {};
    container.phaseRuns.phase_what = {
      ...(container.phaseRuns.phase_what || {}),
      status: 'ready',
      mode: 'tools_propose',
      completedAt: new Date().toISOString(),
      force: Boolean(force),
      skippedLlm: Boolean(projection.skippedLlm),
      llmError: projection.llmError ? String(projection.llmError).slice(0, 120) : null,
      feedbackApplied: Boolean(projection.feedbackApplied),
      citationCount: Number(knowledge?.citationCount) || 0,
      evidenceSpanCount: evidenceSpans.length,
      retrievedSpanCount: Number(retrieved.count) || 0,
      groundingMode,
      groundingPassCount,
      groundingFailCount,
      seededSkippedGrounding,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  }

  const materialize = await materializeWhatToArtifacts({ userId, pack });
  const seededSkippedNoCite = Number(materialize?.meta?.seededSkippedNoCite) || 0;

  const gateAPassed = requirementTools?.gateA?.passed === true;
  const factsCount =
    requirementTools?.facts && typeof requirementTools.facts === 'object'
      ? Object.keys(requirementTools.facts).length
      : 0;
  const proposedDeltaCount = Array.isArray(projection.proposedSrs?.deltas)
    ? projection.proposedSrs.deltas.length
    : 0;
  const citationCount = Number(knowledge?.citationCount) || 0;
  const feedbackApplied = Boolean(projection.feedbackApplied);
  const llmError = projection.llmError ? String(projection.llmError).slice(0, 120) : null;

  // eslint-disable-next-line no-console
  console.info('[phase1] stage2 context', {
    packId: String(packId),
    toolsRan,
    gateAPassed,
    factsCount,
    proposedDeltaCount,
    seeded: materialize?.seeded || 0,
    skippedLlm: Boolean(projection.skippedLlm),
    llmError,
    citationCount,
    feedbackApplied,
    evidenceSpanCount: evidenceSpans.length,
    seededSkippedNoCite,
    groundingPassCount,
    groundingFailCount,
    seededSkippedGrounding,
    retrievedSpanCount: Number(retrieved.count) || 0,
  });

  return {
    prepared: true,
    mode: 'tools_propose',
    stage: 2,
    packId: String(packId),
    status: String(pack.status || ''),
    toolsRan,
    gateAPassed,
    factsCount,
    proposedDeltaCount,
    seededArtifactCount: Number(materialize?.seeded) || 0,
    skippedLlm: Boolean(projection.skippedLlm),
    llmError,
    citationCount,
    requirementAiContextPersisted: true,
    feedbackApplied,
    evidenceSpanCount: evidenceSpans.length,
    seededSkippedNoCite,
    groundingPassCount,
    groundingFailCount,
    seededSkippedGrounding,
    retrievedSpanCount: Number(retrieved.count) || 0,
    snapshotId: pack.aiAnalysisActiveSnapshotId
      ? String(pack.aiAnalysisActiveSnapshotId)
      : null,
    httpStatus: 200,
  };
}

module.exports = {
  buildPhase1Readiness,
  ensureStage1SkillCatalogStub,
  runPhase1Stage1PrepareInput,
  runPhase1Stage2ToolsThenPropose,
};
