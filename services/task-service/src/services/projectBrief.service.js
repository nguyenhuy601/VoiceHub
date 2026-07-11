const ProjectBrief = require('../models/ProjectBrief');
const {
  fetchTaskWorkspaceScope,
} = require('./taskWorkspaceScope');

function isOrgAdminRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

async function createBrief({
  userId,
  organizationId,
  departmentId,
  title,
  body,
  projectCode,
  dueDate,
  assigneePmId,
}) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!scope || !isOrgAdminRole(scope.membershipRole)) {
    throw new Error('Chỉ Owner/Admin (BGĐ) mới được tạo Brief và chỉ định PM');
  }
  if (!String(title || '').trim()) throw new Error('title là bắt buộc');
  if (!assigneePmId) throw new Error('assigneePmId (PM) là bắt buộc');

  let due = null;
  if (dueDate) {
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) throw new Error('dueDate không hợp lệ');
    due = parsed;
  }

  const row = await ProjectBrief.create({
    organizationId,
    departmentId: departmentId || null,
    title: String(title).trim(),
    body: String(body || '').trim(),
    projectCode: String(projectCode || '').trim(),
    dueDate: due,
    assigneePmId,
    createdBy: userId,
    status: 'open',
  });
  return row.toObject();
}

async function listBriefs({ userId, organizationId, status }) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!scope) throw new Error('Không có quyền xem Brief');

  const filter = { organizationId };
  if (status) filter.status = String(status);
  else filter.status = { $in: ['open', 'accepted'] };

  if (isOrgAdminRole(scope.membershipRole)) {
    // BGĐ/Admin: mọi brief trong org
  } else {
    // PM được chỉ định (và các role khác): chỉ brief giao cho mình
    filter.assigneePmId = userId;
  }

  return ProjectBrief.find(filter).sort({ createdAt: -1 }).lean();
}

async function getBrief({ userId, briefId }) {
  const row = await ProjectBrief.findById(briefId).lean();
  if (!row) throw new Error('Brief không tồn tại');
  const scope = await fetchTaskWorkspaceScope(userId, row.organizationId);
  if (!scope) throw new Error('Không có quyền xem Brief');
  const admin = isOrgAdminRole(scope.membershipRole);
  const isPm = String(row.assigneePmId) === String(userId);
  if (!admin && !isPm) throw new Error('Không có quyền xem Brief này');
  return row;
}

async function markBriefAccepted({ userId, briefId, boardId }) {
  const row = await ProjectBrief.findById(briefId);
  if (!row) throw new Error('Brief không tồn tại');
  const isPm = String(row.assigneePmId) === String(userId);
  const scope = await fetchTaskWorkspaceScope(userId, row.organizationId);
  const admin = isOrgAdminRole(scope?.membershipRole);
  if (!isPm && !admin) throw new Error('Chỉ PM được chỉ định mới xác nhận Brief');
  row.status = 'accepted';
  if (boardId) row.boardId = boardId;
  await row.save();
  return row.toObject();
}

async function cancelBrief({ userId, briefId }) {
  const row = await ProjectBrief.findById(briefId);
  if (!row) throw new Error('Brief không tồn tại');
  const scope = await fetchTaskWorkspaceScope(userId, row.organizationId);
  if (!isOrgAdminRole(scope?.membershipRole)) {
    throw new Error('Chỉ Owner/Admin mới hủy Brief');
  }
  row.status = 'cancelled';
  await row.save();
  return row.toObject();
}

module.exports = {
  createBrief,
  listBriefs,
  getBrief,
  markBriefAccepted,
  cancelBrief,
};
