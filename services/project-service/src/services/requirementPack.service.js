const { logger } = require('@enterprise/shared');
const RequirementPack = require('../models/RequirementPack');
const { VALID_STATUS_TRANSITIONS } = require('../constants/requirementLifecycle');
const {
  attachPlanningReadiness,
  attachPlanningReadinessList,
  assertPackReadyForSubmit,
} = require('../utils/requirementPlanningReadiness');
const { mapPackConstraintsToProject } = require('../utils/mapPackConstraintsToProject');
const { assertRequirementPermission } = require('./requirementAccess.service');
const { createProject } = require('./project.service');
const objectStorage = require('../utils/objectStorage');
const { XLSX_MIME } = require('../utils/requirementExcelPreview');
const { ensurePackPreviewViews } = require('../utils/requirementPackPreviewFallback');

/** Minimal 3-band roster so createProject assertDeliveryRoster passes (edit later in Hub). */
const CREATE_FROM_PACK_ROSTER_KEYS = Object.freeze([
  'product_owner',
  'project_manager',
  'developer',
]);

async function listRequirementPacks({ userId, organizationId, status }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:view' });
  const filter = { organizationId, isActive: true };
  if (status) filter.status = String(status);
  const rows = await RequirementPack.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  return attachPlanningReadinessList(rows);
}

async function getRequirementPack({ userId, organizationId, packId }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:view' });
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

async function approveRequirementPack({ userId, organizationId, packId }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:approve' });
  const pack = await RequirementPack.findOne({ _id: packId, organizationId, isActive: true });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  assertTransition(pack.status, 'approved');
  pack.status = 'approved';
  pack.approvedBy = userId;
  pack.approvedAt = new Date();
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

  assertTransition(pack.status, 'project_linked');

  const mapped = mapPackConstraintsToProject(pack.toObject(), {
    titleOverride: String(titleOverride || '').trim(),
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

  return {
    pack: attachPlanningReadiness(linked.toObject()),
    project,
  };
}

module.exports = {
  listRequirementPacks,
  getRequirementPack,
  getRequirementPackSourceFile,
  submitRequirementPack,
  approveRequirementPack,
  rejectRequirementPack,
  createProjectFromRequirementPack,
};
