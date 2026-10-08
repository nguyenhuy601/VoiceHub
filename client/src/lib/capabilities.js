/**
 * FE capability envelope (Wave B) — UI hint only; BE still enforces.
 */

const PROJECT_CREATE_GRANT = 'project.project.create';

/**
 * @param {{
 *   canCreateProject?: boolean,
 *   canCreateTask?: boolean,
 *   masterGrants?: string[] | null,
 *   grantsError?: boolean,
 * } | null | undefined} input
 */
export function buildWorkspaceCapabilities(input = {}) {
  const scope = input && typeof input === 'object' ? input : {};

  // RULE-03: fail closed when RPS grants query failed.
  if (scope.grantsError) {
    const canCreateTask = Boolean(scope.canCreateTask);
    return {
      project: { create: false },
      task: { create: canCreateTask },
      workspace: { planning: canCreateTask },
    };
  }

  const grantsProvided = Array.isArray(scope.masterGrants);
  const grants = grantsProvided
    ? scope.masterGrants.map((g) => String(g || '').trim().toLowerCase()).filter(Boolean)
    : [];
  // Unknown (not yet resolved) → rely on scope flag alone; resolved empty → deny.
  const hasCreateGrant = !grantsProvided
    ? true
    : grants.includes(PROJECT_CREATE_GRANT);

  const canCreateProjectScope = Object.prototype.hasOwnProperty.call(scope, 'canCreateProject')
    ? Boolean(scope.canCreateProject)
    : Boolean(scope.canCreateTask);

  const canCreateTask = Boolean(scope.canCreateTask);

  return {
    project: {
      create: Boolean(canCreateProjectScope && hasCreateGrant),
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
