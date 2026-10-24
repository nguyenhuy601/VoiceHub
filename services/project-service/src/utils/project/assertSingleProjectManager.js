/**
 * RULE: at most one active project_manager membership per project.
 */

const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

const PM_KEY = String(DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER || 'project_manager').toLowerCase();

function normalizeRoleKey(k) {
  return String(k || '').trim().toLowerCase();
}

function roleKeysIncludePm(keys = []) {
  return (Array.isArray(keys) ? keys : []).some((k) => normalizeRoleKey(k) === PM_KEY);
}

/**
 * @param {object} opts
 * @param {string} opts.userId — member receiving roles
 * @param {string[]} opts.nextRoleKeys — roles about to be written
 * @param {{ userId: string, projectRoleKeys?: string[] }[]} [opts.existingMembers] — other members on project
 * @returns {{ ok: true } | { ok: false, errorCode: string, message: string, existingPmUserId: string }}
 */
function assertSingleProjectManager({ userId, nextRoleKeys, existingMembers = [] } = {}) {
  if (!roleKeysIncludePm(nextRoleKeys)) {
    return { ok: true };
  }
  const uid = String(userId || '').trim();
  for (const row of existingMembers || []) {
    const otherId = String(row?.userId || '').trim();
    if (!otherId || otherId === uid) continue;
    if (!roleKeysIncludePm(row.projectRoleKeys || row.roleKeys || [])) continue;
    return {
      ok: false,
      errorCode: 'PROJECT_PM_ALREADY_ASSIGNED',
      message:
        'Dự án đã có Project Manager. Gỡ vai trò project_manager của người hiện tại trước khi gán PM mới.',
      existingPmUserId: otherId,
    };
  }
  return { ok: true };
}

/**
 * After bootstrap merges: strip project_manager from everyone except solePmUserId.
 * @param {Map<string, { keys: Set<string> }>} roleAssignments
 * @param {string} solePmUserId
 * @param {string} [fallbackRoleKey]
 */
function stripExtraProjectManagerKeys(roleAssignments, solePmUserId, fallbackRoleKey = 'observer') {
  const sole = String(solePmUserId || '').trim();
  const pm = PM_KEY;
  if (!sole) return;
  if (!roleAssignments || typeof roleAssignments.entries !== 'function') return;
  for (const [memberUserId, row] of roleAssignments.entries()) {
    if (!row?.keys || typeof row.keys.delete !== 'function') continue;
    const hasPm = [...row.keys].some((k) => normalizeRoleKey(k) === pm);
    if (!hasPm) continue;
    if (String(memberUserId) === sole) continue;
    for (const k of [...row.keys]) {
      if (normalizeRoleKey(k) === pm) row.keys.delete(k);
    }
    if (!row.keys.size && fallbackRoleKey) row.keys.add(fallbackRoleKey);
  }
}

module.exports = {
  PM_KEY,
  roleKeysIncludePm,
  assertSingleProjectManager,
  stripExtraProjectManagerKeys,
};
