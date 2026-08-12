/**
 * Pure helpers — normalize createBoard seed members + delegation template.
 */

const ALLOWED_DELEGATION_TEMPLATES = Object.freeze(['product', 'outsourcing', 'startup']);

const VIEWER_ONLY_ROLE_KEYS = new Set(['watcher', 'reviewer']);

function isCreateBoardSeedEnabled() {
  return String(process.env.CREATE_BOARD_SEED_MEMBERS || '1').trim() !== '0';
}

function normalizeDelegationTemplateId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return ALLOWED_DELEGATION_TEMPLATES.includes(id) ? id : 'product';
}

/**
 * Infer legacy board ACL role from project role keys.
 * @param {string[]} projectRoleKeys
 * @returns {'editor'|'viewer'}
 */
function inferBoardRoleFromProjectKeys(projectRoleKeys = []) {
  const keys = (projectRoleKeys || []).map((k) => String(k || '').trim().toLowerCase()).filter(Boolean);
  if (!keys.length) return 'editor';
  if (keys.every((k) => VIEWER_ONLY_ROLE_KEYS.has(k))) return 'viewer';
  return 'editor';
}

/**
 * @param {unknown[]} members
 * @param {{ creatorUserId?: string }} [opts]
 * @returns {{ userId: string, projectRoleKeys: string[], boardRole: 'editor'|'viewer' }[]}
 */
function normalizeSeedMembers(members, { creatorUserId } = {}) {
  const creator = String(creatorUserId || '').trim();
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(members) ? members : []) {
    const userId = String(raw?.userId || raw?.id || '').trim();
    if (!userId || (creator && userId === creator) || seen.has(userId)) continue;
    seen.add(userId);

    const projectRoleKeys = [
      ...new Set(
        (Array.isArray(raw?.projectRoleKeys) ? raw.projectRoleKeys : [])
          .map((k) => String(k || '').trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
    if (!projectRoleKeys.length) continue;

    let boardRole = String(raw?.boardRole || '').trim().toLowerCase();
    if (boardRole === 'owner' || !['editor', 'viewer'].includes(boardRole)) {
      boardRole = inferBoardRoleFromProjectKeys(projectRoleKeys);
    }

    out.push({ userId, projectRoleKeys, boardRole });
  }

  return out;
}

module.exports = {
  ALLOWED_DELEGATION_TEMPLATES,
  isCreateBoardSeedEnabled,
  normalizeDelegationTemplateId,
  inferBoardRoleFromProjectKeys,
  normalizeSeedMembers,
};
