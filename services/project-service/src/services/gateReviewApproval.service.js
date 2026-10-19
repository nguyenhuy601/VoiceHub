/**
 * Xác nhận cổng: nếu dự án đã lưu gateReviewPolicy thì chỉ vai trò Tổng duyệt được chốt.
 * Dự án cũ không có policy giữ nguyên kiểm tra quyền PO.
 */

async function enforceGateFinalApprover({ userId, projectId, gate }) {
  const pid = String(projectId || '').trim();
  const which = gate === 'how' ? 'how' : 'what';
  if (!pid) return { enforced: false };
  const Project = require('../models/Project');
  const project = await Project.findById(pid).select('gateReviewPolicy').lean();
  const plan = project?.gateReviewPolicy?.[which];
  const finalRoleKey = String(plan?.finalRoleKey || '').trim().toLowerCase();
  if (!finalRoleKey) return { enforced: false };

  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId: pid });
  if (resolved.isOrgAdmin) return { enforced: true, finalRoleKey };
  const keys = (Array.isArray(resolved.roles) ? resolved.roles : [])
    .map((role) => String(role?.key || '').trim().toLowerCase())
    .filter(Boolean);
  if (!keys.includes(finalRoleKey)) {
    const err = new Error('Chỉ vai trò Tổng duyệt mới xác nhận cổng này.');
    err.statusCode = 403;
    err.errorCode = 'GATE_FINAL_APPROVER_REQUIRED';
    err.details = { gate: which, finalRoleKey };
    throw err;
  }
  return { enforced: true, finalRoleKey };
}

module.exports = { enforceGateFinalApprover };
