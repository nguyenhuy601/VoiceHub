/**
 * FE capability envelope (Wave B) — UI hint only; BE still enforces.
 */

const PROJECT_CREATE_GRANT = 'project.project.create';

/** @typedef {'grant' | 'scope' | 'grants_error' | null} CreateProjectDenyReason */

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
  const grantsProvided = scopesProvided;
  // Unknown (not yet resolved) → rely on scope flag alone; resolved empty → deny create.
  const hasCreateGrant = !grantsProvided
    ? true
    : grants.includes(PROJECT_CREATE_GRANT);

  const canCreateProjectScope = Object.prototype.hasOwnProperty.call(scope, 'canCreateProject')
    ? Boolean(scope.canCreateProject)
    : Boolean(scope.canCreateTask);

  const canCreateTask = Boolean(scope.canCreateTask);
  const create = Boolean(canCreateProjectScope && hasCreateGrant);

  /** Prefer grant message when pack missing; else placement/scope. */
  /** @type {CreateProjectDenyReason} */
  let denyReason = null;
  if (!create) {
    if (!hasCreateGrant) denyReason = 'grant';
    else if (!canCreateProjectScope) denyReason = 'scope';
  }

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
  if (reason === 'scope') return 'taskBoard.createProjectDeniedScope';
  if (reason === 'grant' || reason === 'grants_error') {
    return 'taskBoard.createProjectDeniedGrant';
  }
  return 'taskBoard.createProjectDenied';
}
