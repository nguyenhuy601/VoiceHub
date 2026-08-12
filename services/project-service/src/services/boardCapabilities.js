/**
 * Board RBAC capabilities + Kanban done-list policy (chuẩn vàng P0).
 * canCreateTask (org scope) ≈ PM / TL / head / owner / admin.
 */

const DONE_LIST_TITLES = new Set([
  'xong',
  'done',
  'completed',
  'hoàn thành',
  'hoan thanh',
]);

function normalizeListTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isDoneListTitle(title) {
  const n = normalizeListTitle(title);
  if (!n) return false;
  if (DONE_LIST_TITLES.has(n)) return true;
  return n === 'xong' || n.endsWith(' xong') || n.startsWith('done');
}

/**
 * @param {object} opts
 * @param {boolean} opts.isCreator
 * @param {boolean} opts.isOrgAdmin
 * @param {boolean} opts.canCreateTask
 * @param {boolean} opts.inWorkspaceScope
 * @param {boolean} opts.memberCanView
 * @param {boolean} opts.memberCanEdit
 */
function buildBoardCapabilities({
  isCreator = false,
  isOrgAdmin = false,
  canCreateTask = false,
  inWorkspaceScope = false,
  memberCanView = false,
  memberCanEdit = false,
} = {}) {
  const elevated = Boolean(isCreator || isOrgAdmin || canCreateTask);
  const canView = Boolean(elevated || inWorkspaceScope || memberCanView);
  /** Quản lý board: đóng dự án, archive list */
  const canManageBoard = Boolean(isCreator || isOrgAdmin);
  /** Tạo/sửa list & cột — PM/TL/head + admin */
  const canManageLists = elevated;
  /** Tạo thẻ + gán — PM/TL (không phải mọi viewer) */
  const canCreateCards = elevated;
  const canAssign = elevated;
  /** Sửa nội dung thẻ (title/due/assignee) */
  const canEditCards = elevated || Boolean(memberCanEdit && canCreateTask);
  /** Kéo thẻ / đổi cột — cần quyền change_status (P2.1); viewer-only không kéo */
  const canMoveCards = elevated || Boolean(memberCanEdit);
  const canMoveToDone = elevated;
  const canUseAiConfirm = elevated;

  return {
    canView,
    canManageBoard,
    canManageLists,
    canCreateCards,
    canEditCards,
    canAssign,
    canMoveCards,
    canMoveToDone,
    canUseAiConfirm,
    canManageMembers: canManageBoard,
    canUpdateSettings: canManageBoard,
    canViewFiles: canView,
    canViewRepository: canManageBoard,
  };
}

module.exports = {
  DONE_LIST_TITLES,
  normalizeListTitle,
  isDoneListTitle,
  buildBoardCapabilities,
};
