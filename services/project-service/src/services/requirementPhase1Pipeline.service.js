/**
 * Phase 1 prepare pipeline — Stage1 input readiness only (corpus/prefill/snapshot).
 * Projection / LLM runs on APS phase_what (LangGraph).
 */

const RequirementPack = require('../models/RequirementPack');
const {
  prepareUnderstandingOnly,
} = require('./whatRequirementPhase.service');
const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
const { isRequirementReady } = require('../utils/requirement/workbookDiagnostic');

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
 * system_supplement_partial when skill catalog is unwired or missing a non-empty version.
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
  if (!snapshotId) missing.push('no_analysis_snapshot');
  if (!prefillApplied && intakeCorpusChars > 0) {
    missing.push('no_structured_sheets_yet');
  }

  // System supplement: stub/sources must be wired AND carry a catalog version string.
  const sources = pack?.aiAnalysis?.sources || pack?.aiAnalysis?.projectAllSources || null;
  const stub = pack?.aiAnalysis?.skillCatalogStub;
  const stubWired = Boolean(stub && typeof stub === 'object' && Array.isArray(stub.skills));
  const catalogVersion = String(
    stub?.version ||
      sources?.skill_catalog?.version ||
      sources?.skillCatalog?.version ||
      ''
  ).trim();
  const systemSourcesPresent = Boolean(
    catalogVersion &&
      (stubWired || sources?.skill_catalog || sources?.skillCatalog)
  );
  // Empty skills[] with a version is OK — org/calendar full pin is snapshot-time.
  if (!systemSourcesPresent) missing.push('system_supplement_partial');

  const workbookDiagnostic = pack?.aiAnalysis?.workbookDiagnostic || null;
  const workbookDiagnostics = Array.isArray(pack?.aiAnalysis?.workbookDiagnostics)
    ? pack.aiAnalysis.workbookDiagnostics
    : [];
  const customerRawRows = pack?.aiAnalysis?.customerRawRows || null;
  const formValidation = pack?.aiAnalysis?.formValidation || null;
  const documentReadiness = workbookDiagnostic
    ? (workbookDiagnostic.status === 'FAILED' ? 'NOT_READY' : 'READY')
    : (docsCount > 0 || intakeCorpusChars > 0 ? 'READY' : 'NOT_READY');
  // RULE-FORM-01 / RULE-NO-FR-HIERARCHY-RAW-01: Raw form OK ⇒ READY (ignore validFr)
  const { isCustomerRawIntakePack } = require('../utils/requirement/workbookDiagnostic');
  const requirementReadiness =
    formValidation?.ok === true || isCustomerRawIntakePack(pack)
      ? 'READY'
      : isRequirementReady(workbookDiagnostic)
        ? 'READY'
        : 'NOT_READY';

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
    documentReadiness,
    requirementReadiness,
    functionalRequirementCount: Number(workbookDiagnostic?.rows?.validFr) || sheets.fr,
    nfrCount: sheets.nfr,
    businessRequestCount: Array.isArray(customerRawRows?.businessRequests)
      ? customerRawRows.businessRequests.length
      : 0,
    referenceCount: Array.isArray(customerRawRows?.references)
      ? customerRawRows.references.length
      : 0,
    workbookDiagnostic,
    workbookDiagnostics,
    formValidation,
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

  if (pack) {
    const { ensureActiveAiAnalysisSnapshot } = require('./aiAnalysisSnapshot.service');
    await ensureActiveAiAnalysisSnapshot({
      userId,
      organizationId,
      packId,
      pack,
      refreshOnFrDrift: true,
    });
    pack = await RequirementPack.findOne({ _id: packId, organizationId });
  }

  const frCount = Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements.length : 0;
  const nfrCount = Array.isArray(pack?.nonFunctionalRequirements)
    ? pack.nonFunctionalRequirements.length
    : 0;
  // eslint-disable-next-line no-console
  console.info(
    '[phase1] stage1 intake counts fr=%d nfr=%d snapId=%s',
    frCount,
    nfrCount,
    pack?.aiAnalysisActiveSnapshotId ? String(pack.aiAnalysisActiveSnapshotId) : ''
  );

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

module.exports = {
  buildPhase1Readiness,
  ensureStage1SkillCatalogStub,
  runPhase1Stage1PrepareInput,
};
