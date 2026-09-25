const { logger } = require('@enterprise/shared');
const mongoose = require('../db');
const RequirementPack = require('../models/RequirementPack');
const { VALID_STATUS_TRANSITIONS } = require('../constants/requirementLifecycle');
const {
  attachPlanningReadiness,
  assertPackReadyForSubmit,
  pickPlanningReadinessSummary,
} = require('../utils/requirement/requirementPlanningReadiness');
const {
  queryRequirementPackList,
  mapRequirementPackList,
  ensurePlanningReadinessOnListRows,
  PACK_WIZARD_SELECT,
  hasStoredReadiness,
  toRequirementPackWizardItem,
} = require('../utils/requirement/requirementPackList');
const { mapPackConstraintsToProject } = require('../utils/requirement/mapPackConstraintsToProject');
const { clampOverviewForPack } = require('../utils/requirement/requirementOverviewClamp');
const { assertRequirementPermission } = require('./requirementAccess.service');
const { createProject } = require('./project.service');
const objectStorage = require('../utils/common/objectStorage');
const { XLSX_MIME } = require('../utils/requirement/requirementExcelPreview');
const { ensurePackPreviewViews } = require('../utils/requirement/requirementPackPreviewFallback');
const { assertCanSoftDeleteRequirementPack } = require('../utils/requirement/requirementPackDelete');
const {
  importRequirementPackWorkItems,
  seedProjectMembersFromAssignees,
} = require('./requirementPackWorkImport.service');
const { normalizeCreatePackLeafAssignments } = require('../utils/requirement/requirementPackWorkImport.utils');

/** Intake roster so createProject assertIntakeLeadRoster passes (edit later in Hub). */
const CREATE_FROM_PACK_ROSTER_KEYS = Object.freeze([
  'product_owner',
  'project_manager',
  'business_analyst',
  'developer',
]);

async function listRequirementPacks({ userId, organizationId, status }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:view' });
  const filter = { organizationId, isActive: true };
  if (status) filter.status = String(status);
  const rows = await queryRequirementPackList(RequirementPack, filter);
  const ensured = await ensurePlanningReadinessOnListRows(RequirementPack, rows);
  return mapRequirementPackList(ensured);
}

function normalizePackView(view) {
  const v = String(view || 'full').trim().toLowerCase();
  return v === 'wizard' ? 'wizard' : 'full';
}

/**
 * Wizard projection: overview + readiness. No FR / excelPreview.
 * Backfills planningReadiness from FR once if legacy pack thiếu field.
 */
async function getRequirementPackWizard({ packId, organizationId }) {
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true })
    .select(PACK_WIZARD_SELECT)
    .lean();
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (!hasStoredReadiness(pack)) {
    const frDoc = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true })
      .select('functionalRequirements staffingPlan overview.deadline overview.platform')
      .lean();
    const summary = pickPlanningReadinessSummary({
      overview: { ...(pack.overview || {}), ...(frDoc?.overview || {}) },
      functionalRequirements: frDoc?.functionalRequirements || [],
      staffingPlan: frDoc?.staffingPlan || {},
    });
    pack.planningReadiness = summary;
    RequirementPack.updateOne(
      { _id: packId },
      { $set: { planningReadiness: summary } }
    ).catch(() => {});
  }

  return toRequirementPackWizardItem(pack);
}

/**
 * @param {{ userId: string, organizationId: string, packId: string, view?: string }} args
 * @param {string} [args.view='full'] `full` (default) | `wizard`
 */
async function getRequirementPack({ userId, organizationId, packId, view = 'full' }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:view' });
  if (normalizePackView(view) === 'wizard') {
    return getRequirementPackWizard({ packId, organizationId });
  }
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true }).lean();
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return attachPlanningReadiness(ensurePackPreviewViews(pack));
}

/**
 * Resolve source xlsx stream for download. Returns metadata + readable body.
 */
async function getRequirementPackSourceFile({ userId, organizationId, packId }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:view' });
  const pack = await RequirementPack.findOne({
    _id: packId,
    organizationId,
    isActive: true,
  })
    .select('sourceFileId sourceFileName')
    .lean();
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const sourceFileId = String(pack.sourceFileId || '').trim();
  if (!sourceFileId) {
    const err = new Error('Gói không có file Excel gốc');
    err.statusCode = 404;
    err.errorCode = 'REQ_SOURCE_FILE_MISSING';
    throw err;
  }
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage chưa cấu hình');
    err.statusCode = 503;
    err.errorCode = 'REQ_STORAGE_UNAVAILABLE';
    throw err;
  }
  const exists = await objectStorage.objectExists(sourceFileId);
  if (!exists) {
    const err = new Error('File Excel gốc không tìm thấy trên storage');
    err.statusCode = 404;
    err.errorCode = 'REQ_SOURCE_FILE_NOT_FOUND';
    throw err;
  }
  const body = await objectStorage.getObjectStream(sourceFileId);
  const fileName = String(pack.sourceFileName || 'requirement.xlsx').slice(0, 255);
  return {
    body,
    fileName,
    contentType: XLSX_MIME,
  };
}

function assertTransition(current, next) {
  const allowed = VALID_STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    const err = new Error(`Không thể chuyển trạng thái ${current} → ${next}`);
    err.statusCode = 409;
    err.errorCode = 'REQ_INVALID_STATUS_TRANSITION';
    throw err;
  }
}

async function submitRequirementPack({ userId, organizationId, packId }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:submit' });
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  assertTransition(pack.status, 'under_review');
  assertPackReadyForSubmit(pack);
  pack.status = 'under_review';
  pack.submittedBy = userId;
  pack.submittedAt = new Date();
  await pack.save();
  return attachPlanningReadiness(pack.toObject());
}

async function approveRequirementPack({
  userId,
  organizationId,
  packId,
  forceApprove = false,
  overrideReason = '',
}) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:approve' });
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  assertTransition(pack.status, 'approved');

  const { assertRequirementGate1Approve } = require('../utils/tools/assertRequirementGate1Approve');
  const gate1 = assertRequirementGate1Approve({
    pack: pack.toObject ? pack.toObject() : pack,
    forceApprove,
    overrideReason,
  });

  pack.status = 'approved';
  pack.approvedBy = userId;
  pack.approvedAt = new Date();

  // G6: freeze SRS version on pack.aiAnalysis (Mixed) after Gate1
  {
    const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
    const shell = ensureAiAnalysisContainer(pack.aiAnalysis);
    const frozen = String(
      pack.versionNumber ?? pack.version ?? shell.approvedSrsVersion ?? '1'
    );
    shell.approvedSrsVersion = frozen;
    pack.aiAnalysis = shell;
    pack.markModified('aiAnalysis');
  }

  // G4 Gate1: materialize FR + mark phase_what approved for HOW unlock
  {
    const {
      isWhatG4Enabled,
      markPhaseWhatGate1Approved,
      hasReadyG4Understanding,
    } = require('../utils/aiAnalysis/whatG4Policy');
    const { materializeG4IntoPack } = require('../utils/aiAnalysis/materializeG4IntoPack');
    const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
    if (isWhatG4Enabled() && hasReadyG4Understanding(pack)) {
      const g4 = pack.aiAnalysis?.analyses?.g4Understanding;
      const { pack: seeded, meta } = materializeG4IntoPack(
        pack.toObject ? pack.toObject() : pack,
        g4
      );
      if (!meta.skipped && Array.isArray(seeded.functionalRequirements)) {
        pack.functionalRequirements = seeded.functionalRequirements;
        pack.markModified('functionalRequirements');
      }
      let container = ensureAiAnalysisContainer(pack.aiAnalysis);
      container = markPhaseWhatGate1Approved(container, {
        source: 'g4_gate1',
        at: new Date().toISOString(),
      });
      pack.aiAnalysis = container;
      pack.markModified('aiAnalysis');
      logger.info('[requirement] Gate1 G4 mark phase_what approved', {
        packId: String(packId),
        seededFr: meta.seededFr,
      });
    }
  }

  if (gate1.override) {
    const shell = pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : {};
    shell.gate1Override = {
      forceApprove: true,
      reason: gate1.override.reason,
      missingGateA: Boolean(gate1.override.missingGateA),
      gateA: gate1.gateA,
      conflictAmbiguity: gate1.override.conflictAmbiguity || null,
      by: userId,
      at: new Date().toISOString(),
    };
    pack.aiAnalysis = shell;
    pack.markModified('aiAnalysis');
    logger.warn('[requirement] Gate1 forceApprove', {
      packId: String(packId),
      userId: String(userId),
      missingGateA: gate1.override.missingGateA,
      conflictAmbiguity: Boolean(gate1.override.conflictAmbiguity),
      reasonLen: String(gate1.override.reason || '').length,
    });
  }

  await pack.save();
  return attachPlanningReadiness(pack.toObject());
}

async function rejectRequirementPack({ userId, organizationId, packId, reason = '' }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:approve' });
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  assertTransition(pack.status, 'rejected');
  pack.status = 'rejected';
  pack.rejectedBy = userId;
  pack.rejectedAt = new Date();
  pack.rejectionReason = String(reason || '').slice(0, 2000);
  await pack.save();
  return attachPlanningReadiness(pack.toObject());
}

/**
 * Create Project from an approved pack: copy constraints, link pack → project_linked.
 */
async function createProjectFromRequirementPack({
  userId,
  organizationId,
  packId,
  title: titleOverride = '',
  startDate: startDateOverride,
  dueDate: dueDateOverride,
  importWorkItems = false,
  leafAssignments = [],
  applyAssignees = true,
  taskIds = null,
  forceApprove = false,
  overrideReason = '',
  idempotencyKey = null,
}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:create-project',
  });

  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  if (pack.status !== 'approved') {
    const err = new Error('Pack phải ở trạng thái approved trước khi tạo dự án');
    err.statusCode = 409;
    err.errorCode = 'REQ_INVALID_STATUS_TRANSITION';
    throw err;
  }

  const { assertGate2ProjectPlanConfirmed } = require('../utils/tools/assertGate2ProjectPlanConfirmed');
  assertGate2ProjectPlanConfirmed(pack.toObject ? pack.toObject() : pack);

  const {
    assertGate2FeasibilityOrOverride,
  } = require('../utils/tools/assertGate2FeasibilityOrOverride');
  const g13Gate = assertGate2FeasibilityOrOverride({
    pack: pack.toObject ? pack.toObject() : pack,
    forceApprove,
    overrideReason,
  });
  if (g13Gate.override) {
    const shell =
      pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : {};
    shell.gate2Override = {
      forceApprove: true,
      reason: g13Gate.override.reason,
      missingFeasibility: Boolean(g13Gate.override.missingFeasibility),
      failures: g13Gate.override.failures || null,
      by: userId,
      at: new Date().toISOString(),
    };
    pack.aiAnalysis = shell;
    pack.markModified('aiAnalysis');
    const { logger } = require('@enterprise/shared');
    logger.warn('[requirement] Gate2 G13 forceApprove (create-project)', {
      packId: String(packId),
      userId: String(userId),
      reasonLen: String(g13Gate.override.reason || '').length,
    });
    await pack.save();
  }

  // 1A: pack already bound to draft project → promote instead of second create.
  if (pack.projectId) {
    const { promoteProjectFromGate2 } = require('./projectPromoteFromGate2.service');
    return promoteProjectFromGate2({
      userId,
      organizationId,
      packId,
      importWorkItems,
      applyAssignees,
      leafAssignments,
      taskIds,
      forceApprove,
      overrideReason,
      idempotencyKey,
    });
  }

  assertTransition(pack.status, 'project_linked');

  const mapped = mapPackConstraintsToProject(pack.toObject(), {
    titleOverride: String(titleOverride || '').trim(),
    startDateOverride:
      startDateOverride !== undefined ? startDateOverride : undefined,
    dueDateOverride: dueDateOverride !== undefined ? dueDateOverride : undefined,
  });

  const project = await createProject({
    userId,
    organizationId,
    title: mapped.title,
    description: mapped.description,
    startDate: mapped.startDate,
    expectedEndDate: mapped.expectedEndDate,
    dueDate: mapped.dueDate,
    requiredProjectRoles: mapped.requiredProjectRoles,
    budgetStub: mapped.budgetStub,
    members: [
      {
        userId,
        projectRoleKeys: [...CREATE_FROM_PACK_ROSTER_KEYS],
      },
    ],
  });

  const projectId = project?._id || project?.projectId;
  const boardId = project?.defaultBoardId || project?.board?._id;

  const normalizedLeafAssignments = normalizeCreatePackLeafAssignments(leafAssignments);
  const shouldImport = Boolean(importWorkItems);

  let importStats = null;
  if (shouldImport) {
    importStats = await importRequirementPackWorkItems({
      userId,
      organizationId,
      pack: pack.toObject(),
      project,
      boardId,
      leafAssignments: normalizedLeafAssignments,
      applyAssignees,
      taskIds,
    });
    await seedProjectMembersFromAssignees({
      userId,
      projectId,
      boardId,
      pack: pack.toObject(),
      leafAssignments: normalizedLeafAssignments,
    });
  }

  const linked = await RequirementPack.findOneAndUpdate(
    {
      _id: packId,
      organizationId,
      status: 'approved',
      isActive: true,
    },
    {
      $set: {
        status: 'project_linked',
        projectId,
      },
    },
    { new: true }
  );

  if (!linked) {
    logger.warn(
      '[requirement] create-from-pack race: project=%s pack=%s already linked or not approved',
      String(projectId),
      String(packId)
    );
    const err = new Error('Pack không còn ở trạng thái approved (có thể đã gắn dự án)');
    err.statusCode = 409;
    err.errorCode = 'REQ_INVALID_STATUS_TRANSITION';
    err.details = { projectId: String(projectId) };
    throw err;
  }

  let analysisSeed = null;
  try {
    const { seedArtifactsFromRequirementPack, linkPackDocumentsToProject } = require('./analysis.service');
    analysisSeed = await seedArtifactsFromRequirementPack({
      userId,
      projectId,
      pack: linked.toObject(),
    });
    const linkedDocs = await linkPackDocumentsToProject({
      organizationId,
      packId,
      projectId,
    });
    analysisSeed = {
      ...(analysisSeed && typeof analysisSeed === 'object' ? analysisSeed : {}),
      linkedDocumentCount: linkedDocs.modified,
    };
  } catch (seedErr) {
    logger.warn(
      '[requirement] analysis artifact seed failed project=%s pack=%s: %s',
      String(projectId),
      String(packId),
      seedErr?.message || seedErr
    );
  }

  return {
    pack: attachPlanningReadiness(linked.toObject()),
    project,
    importStats,
    analysisSeed,
    linkedDocumentCount: analysisSeed?.linkedDocumentCount ?? 0,
  };
}

/**
 * Soft-delete an approved pack (not yet linked to a project).
 */
async function deleteRequirementPack({ userId, organizationId, packId }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:approve' });
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true });
  const gate = assertCanSoftDeleteRequirementPack(pack);
  if (!gate.ok) {
    const err = new Error(gate.message);
    err.statusCode = gate.statusCode;
    err.errorCode = gate.errorCode;
    throw err;
  }
  pack.isActive = false;
  pack.deletedBy = userId;
  pack.deletedAt = new Date();
  await pack.save();
  return { deleted: true, packId: String(pack._id) };
}

/**
 * Wizard HITL intake — create draft pack; optional bind to Project draft (1A).
 * Does NOT set status project_linked (that happens after Gate 2 promote).
 */
async function createIntakeDraftPack({
  userId,
  organizationId,
  title = '',
  description = '',
  customerName = '',
  startDate = null,
  dueDate = null,
  priority = 'Medium',
  sourceFileName = '',
  importSessionId = null,
  analysisMode = '',
  projectId = null,
}) {
  const {
    assertRequirementImportOrCreateProjectScope,
  } = require('./requirementAccess.service');
  await assertRequirementImportOrCreateProjectScope({ userId, organizationId });

  const name = String(title || '').trim().slice(0, 240);
  if (!name) {
    const err = new Error('title bắt buộc');
    err.statusCode = 400;
    err.errorCode = 'REQ_INTAKE_TITLE_REQUIRED';
    throw err;
  }

  const overview = clampOverviewForPack({
    requirementName: name,
    projectObjective: String(description || '').trim().slice(0, 4000),
    businessScope: customerName
      ? `Customer: ${String(customerName).trim().slice(0, 200)}`
      : '',
    startDate: startDate || null,
    deadline: dueDate || null,
    priority: String(priority || 'Medium').trim().slice(0, 32) || 'Medium',
  });

  const boundProjectId = (() => {
    const s = String(projectId || '').trim();
    return mongoose.Types.ObjectId.isValid(s) ? s : null;
  })();

  if (boundProjectId) {
    const Project = require('../models/Project');
    const project = await Project.findOne({
      _id: boundProjectId,
      organizationId,
      isArchived: { $ne: true },
    })
      .select('_id')
      .lean();
    if (!project) {
      const err = new Error('Project không tồn tại trong organization');
      err.statusCode = 404;
      err.errorCode = 'REQ_INTAKE_PROJECT_NOT_FOUND';
      throw err;
    }
  }

  const mode = ['manual', 'ai'].includes(String(analysisMode || '').toLowerCase())
    ? String(analysisMode).toLowerCase()
    : '';

  const pack = await RequirementPack.create({
    organizationId,
    createdBy: userId,
    status: 'draft',
    templateVersion: '1.1-raw',
    sourceFileName: String(sourceFileName || '').trim().slice(0, 255),
    importSessionId: importSessionId || null,
    projectId: boundProjectId,
    overview: mode
      ? { ...overview, analysisMode: mode }
      : overview,
    functionalRequirements: [],
    nonFunctionalRequirements: [],
  });

  return attachPlanningReadiness(pack.toObject());
}

module.exports = {
  listRequirementPacks,
  getRequirementPack,
  getRequirementPackSourceFile,
  submitRequirementPack,
  approveRequirementPack,
  rejectRequirementPack,
  createProjectFromRequirementPack,
  deleteRequirementPack,
  createIntakeDraftPack,
};
