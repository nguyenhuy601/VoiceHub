/**
 * FE capability envelope (Wave B) — UI hint only; BE still enforces.
 */

export const PROJECT_CREATE_GRANT = 'project.project.create';

/** Tạo dự án không có scope: không có dự án cá nhân, chỉ kiểm tra mã quyền. */
export function isScopeLessGrant(code) {
  return String(code || '').trim().toLowerCase() === PROJECT_CREATE_GRANT;
}

/** @typedef {'grant' | 'grants_error' | null} CreateProjectDenyReason */

/**
 * @param {{
 *   canCreateProject?: boolean,
 *   canCreateTask?: boolean,
 *   grantScopes?: Record<string, string> | null,
 *   grantsError?: boolean,
 * } | null | undefined} input
 */
export function buildWorkspaceCapabilities(input = {}) {
  const scope = input && typeof input === 'object' ? input : {};

  // RULE-03: fail closed when RPS grants query failed.
  if (scope.grantsError) {
    const canCreateTask = Boolean(scope.canCreateTask);
    return {
      project: { create: false, denyReason: /** @type {CreateProjectDenyReason} */ ('grants_error') },
      task: { create: canCreateTask },
      workspace: { planning: canCreateTask },
    };
  }

  const scopesProvided =
    scope.grantScopes && typeof scope.grantScopes === 'object' && !Array.isArray(scope.grantScopes);
  const grants = scopesProvided
    ? Object.keys(scope.grantScopes).map((g) => String(g || '').trim().toLowerCase()).filter(Boolean)
    : [];
  // Chưa có grantScopes (đang tải / thiếu org) → từ chối. Không dùng cờ placement cũ.
  const hasCreateGrant = Boolean(scopesProvided && grants.includes(PROJECT_CREATE_GRANT));

  const canCreateTask = Boolean(scope.canCreateTask);
  const create = hasCreateGrant;

  /** @type {CreateProjectDenyReason} */
  let denyReason = null;
  if (!create) denyReason = 'grant';

  return {
    project: {
      create,
      denyReason,
    },
    task: {
      create: canCreateTask,
    },
    workspace: {
      planning: canCreateTask,
    },
  };
}

/**
 * @param {ReturnType<typeof buildWorkspaceCapabilities> | null | undefined} capabilities
 */
export function canCreateProjectUi(capabilities) {
  return Boolean(capabilities?.project?.create);
}

/**
 * i18n key for Create Project deny toast (grant vs placement scope).
 * @param {ReturnType<typeof buildWorkspaceCapabilities> | null | undefined} capabilities
 * @returns {string}
 */
export function createProjectDeniedI18nKey(capabilities) {
  const reason = capabilities?.project?.denyReason;
  if (reason === 'grant' || reason === 'grants_error') {
    return 'taskBoard.createProjectDeniedGrant';
  }
  return 'taskBoard.createProjectDenied';
}
