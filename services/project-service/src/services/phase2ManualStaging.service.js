/**
 * Phase 2 Manual path: PM stages Backlog/Board preview → PO approve → advance.
 * Staging lives on Project.phase2ManualStaging (no new collection).
 */
const Project = require('../models/Project');
const PlanningArtifact = require('../models/PlanningArtifact');
const {
  whitelistRow,
  leafEstimateHours,
  overlayStagingRowsFromWbs,
  summarizeStaging,
  isManualStagingDisabled,
  stagingSubmitterStamp,
} = require('../utils/phase2ManualStagingUtils');
const { assertGateStampSoD } = require('../utils/phase1GatePolicy');

async function assertProjectMemberAccess({ projectId }) {
  const project = await Project.findById(projectId)
    .select('deliveryPhase methodology phase2ManualStaging organizationId name isActive')
    .lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return project;
}

async function assertDeliveryPhaseChange({ userId, projectId }) {
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && !hasPermission(resolved.permissions, 'delivery_phase:change')) {
    const err = new Error('Không có quyền chuyển deliveryPhase');
    err.statusCode = 403;
    throw err;
  }
  return resolved;
}

async function assertPlanningPoReview({ userId, projectId }) {
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && !hasPermission(resolved.permissions, 'planning:po_review')) {
    const err = new Error('Chỉ PO được duyệt chuyển Phase 2 thủ công');
    err.statusCode = 403;
    throw err;
  }
  return resolved;
}

async function loadApprovedWbs(projectId) {
  return PlanningArtifact.find({
    projectId,
    kind: 'WBS',
    status: 'approved',
    isActive: true,
  })
    .select('_id externalKey title estimateHours parentExternalKey structured')
    .lean();
}

/**
 * Build WBS leaf preview rows for Manual staging modal.
 * Person and start date are always refreshed from WBS structured.
 */
async function buildPhase2StagingPreview({ userId, projectId }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  const wbsAll = await loadApprovedWbs(projectId);

  const existing = project.phase2ManualStaging;
  if (
    existing &&
    Array.isArray(existing.rows) &&
    existing.rows.length &&
    ['draft', 'po_review', 'changes_requested'].includes(String(existing.status || ''))
  ) {
    const rows = overlayStagingRowsFromWbs(
      existing.rows.map((row, index) => whitelistRow(row, index)),
      wbsAll
    );
    return {
      projectId: String(projectId),
      methodology: existing.methodology || project.methodology || 'kanban',
      status: existing.status,
      rows,
      note: existing.note || '',
      reviewNote: existing.reviewNote || '',
      submittedAt: existing.submittedAt || null,
      submittedBy: existing.submittedBy ? String(existing.submittedBy) : null,
      fromExistingStaging: true,
    };
  }

  const usedAsParent = new Set(
    wbsAll.map((w) => String(w.parentExternalKey || '').trim()).filter(Boolean)
  );
  const leaves = wbsAll.filter((w) => {
    const key = String(w.externalKey || '').trim();
    if (!key) return true;
    return !usedAsParent.has(key);
  });

  const rows = overlayStagingRowsFromWbs(
    leaves.map((w, i) =>
      whitelistRow(
        {
          localId: `wbs_${String(w._id)}`,
          sourceArtifactId: String(w._id),
          externalKey: w.externalKey,
          title: w.title,
          estimateHours: leafEstimateHours(w),
          columnHint: 'Backlog',
          changeType: 'from_wbs',
        },
        i
      )
    ),
    leaves
  );

  return {
    projectId: String(projectId),
    methodology: project.methodology || 'kanban',
    status: 'draft',
    rows,
    note: '',
    submittedAt: null,
    submittedBy: null,
    fromExistingStaging: false,
  };
}

async function savePhase2StagingDraft({ userId, projectId, methodology, rows, note }) {
  await assertDeliveryPhaseChange({ userId, projectId });
  const projectDoc = await Project.findById(projectId);
  if (!projectDoc || projectDoc.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const phase = String(projectDoc.deliveryPhase || '').toLowerCase();
  if (phase !== 'delivery_planning') {
    const err = new Error('Chỉ staging khi đang Delivery Planning');
    err.statusCode = 400;
    throw err;
  }
  const list = Array.isArray(rows) ? rows.map((r, i) => whitelistRow(r, i)) : [];
  const activeRows = list.filter((r) => r.changeType !== 'removed');
  if (!activeRows.length) {
    const err = new Error('Cần ít nhất một dòng staging');
    err.statusCode = 400;
    throw err;
  }
  const m = String(methodology || projectDoc.methodology || 'kanban')
    .trim()
    .toLowerCase();
  projectDoc.phase2ManualStaging = {
    status: 'draft',
    methodology: ['scrum', 'kanban', 'waterfall'].includes(m) ? m : 'kanban',
    rows: list.slice(0, 500),
    note: String(note || '')
      .trim()
      .slice(0, 2000),
    submittedAt: null,
    submittedBy: null,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: new Date(),
    updatedBy: userId,
  };
  await projectDoc.save();
  return {
    projectId: String(projectId),
    status: 'draft',
    rowCount: list.length,
  };
}

async function submitPhase2ManualStaging({ userId, projectId, methodology, rows, note }) {
  if (isManualStagingDisabled()) {
    const analysisService = require('./analysis.service');
    return analysisService.advanceToPhase2({
      userId,
      projectId,
      mode: 'automation',
      methodology,
      publishWbs: true,
      seedBoardTasks: true,
    });
  }

  await assertDeliveryPhaseChange({ userId, projectId });
  const projectDoc = await Project.findById(projectId);
  if (!projectDoc || projectDoc.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (String(projectDoc.deliveryPhase || '').toLowerCase() !== 'delivery_planning') {
    const err = new Error('Chỉ gửi PO khi đang Delivery Planning');
    err.statusCode = 400;
    throw err;
  }

  const list = Array.isArray(rows) ? rows.map((r, i) => whitelistRow(r, i)) : [];
  const activeRows = list.filter((r) => r.changeType !== 'removed' && r.title);
  if (!activeRows.length) {
    const err = new Error('Cần ít nhất một dòng có tiêu đề để gửi PO');
    err.statusCode = 400;
    throw err;
  }

  const m = String(methodology || projectDoc.methodology || 'kanban')
    .trim()
    .toLowerCase();
  const now = new Date();
  projectDoc.phase2ManualStaging = {
    status: 'po_review',
    methodology: ['scrum', 'kanban', 'waterfall'].includes(m) ? m : 'kanban',
    rows: list.slice(0, 500),
    note: String(note || '')
      .trim()
      .slice(0, 2000),
    reviewNote: '',
    submittedAt: now,
    submittedBy: userId,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: now,
    updatedBy: userId,
  };
  // Stay on delivery_planning until PO approves
  await projectDoc.save();

  try {
    const { notifyNextGateReviewers } = require('../utils/phase1GatePolicy');
    await notifyNextGateReviewers({
      projectId,
      organizationId: projectDoc.organizationId,
      actorUserId: userId,
      nextPermission: 'planning:po_review',
      title: 'Duyệt chuyển Phase 2 (Thủ công)',
      content: `${projectDoc.name || 'Dự án'}: PM đã gửi bảng staging Phase 2 — cần PO duyệt trước khi Development.`,
      kind: 'phase2_manual_po_review',
      actionPath: 'phase1/planning-approval',
    });
  } catch {
    /* non-blocking */
  }

  return {
    projectId: String(projectId),
    deliveryPhase: projectDoc.deliveryPhase,
    status: 'po_review',
    rowCount: list.length,
    advanced: false,
  };
}

async function reviewPhase2ManualStaging({
  userId,
  projectId,
  decision,
  note,
}) {
  const decided = String(decision || '')
    .trim()
    .toLowerCase();
  if (!['approve', 'request_changes'].includes(decided)) {
    const err = new Error('decision phải là approve hoặc request_changes');
    err.statusCode = 400;
    throw err;
  }

  await assertPlanningPoReview({ userId, projectId });
  const projectDoc = await Project.findById(projectId);
  if (!projectDoc || projectDoc.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const staging = projectDoc.phase2ManualStaging;
  if (!staging || String(staging.status || '') !== 'po_review') {
    const err = new Error('Không có staging Phase 2 đang chờ PO');
    err.statusCode = 400;
    err.errorCode = 'PHASE2_STAGING_NOT_PENDING';
    throw err;
  }

  assertGateStampSoD({
    actorUserId: userId,
    priorStamps: stagingSubmitterStamp(staging.submittedBy),
    bypass: false,
  });

  if (decided === 'request_changes') {
    const reviewNote = String(note || '').trim().slice(0, 2000);
    if (!reviewNote) {
      const err = new Error('Cần ghi nội dung cần sửa trước khi gửi lại quản lý dự án');
      err.statusCode = 400;
      throw err;
    }
    staging.status = 'changes_requested';
    staging.reviewNote = reviewNote;
    staging.reviewedAt = new Date();
    staging.reviewedBy = userId;
    projectDoc.phase2ManualStaging = staging;
    projectDoc.markModified('phase2ManualStaging');
    await projectDoc.save();

    try {
      const { notifySystemKind, projectHubActionUrl } = require('../clients/notification.client');
      const submitter = staging.submittedBy ? String(staging.submittedBy) : null;
      if (submitter) {
        await notifySystemKind({
          userIds: [submitter],
          kind: 'phase2_manual_changes_requested',
          title: 'PO yêu cầu sửa staging Phase 2',
          content: reviewNote.slice(0, 500),
          data: {
            projectId: String(projectId),
            organizationId: String(projectDoc.organizationId || ''),
            kind: 'phase2_manual_changes_requested',
          },
          actionUrl: projectHubActionUrl({
            projectId,
            organizationId: projectDoc.organizationId,
            module: 'overview',
          }),
          excludeUserId: userId,
        });
      }
    } catch {
      /* non-blocking */
    }

    return {
      projectId: String(projectId),
      status: 'changes_requested',
      advanced: false,
    };
  }

  // approve → advance (map code path)
  staging.status = 'approved';
  staging.reviewedAt = new Date();
  staging.reviewedBy = userId;
  if (note) {
    staging.note = String(note)
      .trim()
      .slice(0, 2000);
  }
  projectDoc.phase2ManualStaging = staging;
  projectDoc.markModified('phase2ManualStaging');
  await projectDoc.save();

  const analysisService = require('./analysis.service');
  const advanced = await analysisService.advanceToPhase2({
    userId,
    projectId,
    mode: 'automation',
    methodology: staging.methodology || projectDoc.methodology,
    publishWbs: true,
    seedBoardTasks: true,
  });

  const after = await Project.findById(projectId);
  if (after?.phase2ManualStaging) {
    after.phase2ManualStaging.status = 'applied';
    after.markModified('phase2ManualStaging');
    await after.save();
  }

  return {
    ...advanced,
    stagingStatus: 'applied',
    advanced: true,
  };
}

module.exports = {
  whitelistRow,
  isManualStagingDisabled,
  buildPhase2StagingPreview,
  savePhase2StagingDraft,
  submitPhase2ManualStaging,
  reviewPhase2ManualStaging,
  summarizeStaging,
};
