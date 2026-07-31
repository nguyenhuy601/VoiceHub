const ProjectMember = require('../models/ProjectMember');
const {
  normalizeAllocationSegments,
  computeAllocationStatus,
} = require('../utils/allocationOverlap');

function asOid(raw) {
  return String(raw || '').trim();
}

function hasAllocationPayload(body = {}) {
  return (
    body.allocations !== undefined ||
    body.joinDate !== undefined ||
    body.leaveDate !== undefined ||
    body.billable !== undefined ||
    body.status !== undefined
  );
}

/**
 * Upsert ProjectMember resource allocation for one user on a project.
 * Cho phép lưu khi overallocated — chỉ đánh dấu allocationStatus.
 */
async function upsertProjectMemberAllocation({
  organizationId,
  projectId,
  userId,
  body = {},
  updatedBy = null,
}) {
  const orgId = asOid(organizationId);
  const pid = asOid(projectId);
  const uid = asOid(userId);
  if (!orgId || !pid || !uid) {
    const err = new Error('organizationId/projectId/userId bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const patch = {};
  if (body.status !== undefined) {
    const st = String(body.status || '').trim().toLowerCase();
    if (!['active', 'inactive'].includes(st)) {
      const err = new Error('status phải là active|inactive');
      err.statusCode = 400;
      throw err;
    }
    patch.status = st;
  }
  if (body.billable !== undefined) {
    patch.billable = Boolean(body.billable);
  }
  if (body.joinDate !== undefined) {
    patch.joinDate = body.joinDate ? new Date(body.joinDate) : null;
    if (body.joinDate && Number.isNaN(patch.joinDate.getTime())) {
      const err = new Error('joinDate không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
  }
  if (body.leaveDate !== undefined) {
    patch.leaveDate = body.leaveDate ? new Date(body.leaveDate) : null;
    if (body.leaveDate && Number.isNaN(patch.leaveDate.getTime())) {
      const err = new Error('leaveDate không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
  }
  if (body.allocations !== undefined) {
    const norm = normalizeAllocationSegments(body.allocations);
    if (!norm.ok) {
      const err = new Error(norm.message);
      err.statusCode = 400;
      throw err;
    }
    patch.allocations = norm.segments;
  }

  const existing = await ProjectMember.findOne({ projectId: pid, userId: uid });
  const nextDoc = {
    organizationId: orgId,
    projectId: pid,
    userId: uid,
    status: patch.status || existing?.status || 'active',
    billable: patch.billable !== undefined ? patch.billable : Boolean(existing?.billable),
    joinDate:
      patch.joinDate !== undefined
        ? patch.joinDate
        : existing?.joinDate || (patch.allocations ? new Date() : null),
    leaveDate: patch.leaveDate !== undefined ? patch.leaveDate : existing?.leaveDate || null,
    allocations:
      patch.allocations !== undefined
        ? patch.allocations
        : existing?.allocations || [],
    updatedBy: updatedBy || null,
  };

  // Compute overallocated across ALL projects for this user (including this draft).
  const others = await ProjectMember.find({
    userId: uid,
    status: 'active',
    projectId: { $ne: pid },
  })
    .select('projectId allocations status')
    .lean();

  const draftRow = {
    projectId: pid,
    allocations: nextDoc.allocations,
    status: nextDoc.status,
  };
  const peers = nextDoc.status === 'active' ? [...others, draftRow] : others;
  nextDoc.allocationStatus = computeAllocationStatus(peers);

  // Chỉ $set — không $setOnInsert trùng path (Mongo conflict trên upsert insert).
  const saved = await ProjectMember.findOneAndUpdate(
    { projectId: pid, userId: uid },
    { $set: nextDoc },
    { upsert: true, new: true }
  ).lean();

  // Refresh allocationStatus on other active projects for this user (same sweep).
  if (others.length) {
    const allActive = await ProjectMember.find({ userId: uid, status: 'active' })
      .select('projectId allocations')
      .lean();
    const status = computeAllocationStatus(allActive);
    await ProjectMember.updateMany(
      { userId: uid, status: 'active' },
      { $set: { allocationStatus: status } }
    );
    saved.allocationStatus = status;
  }

  return saved;
}

/**
 * Map projectId+userId → ProjectMember lean docs for list enrichment.
 */
async function mapProjectMembersByUser(projectId) {
  const pid = asOid(projectId);
  if (!pid) return new Map();
  const rows = await ProjectMember.find({ projectId: pid }).lean();
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.userId), row);
  }
  return map;
}

module.exports = {
  hasAllocationPayload,
  upsertProjectMemberAllocation,
  mapProjectMembersByUser,
  normalizeAllocationSegments,
  computeAllocationStatus,
};
