/**
 * FE capability envelope (Wave B) — UI hint only; BE still enforces.
 */

/**
 * @param {{ canCreateProject?: boolean, canCreateTask?: boolean, masterGrants?: string[] } | null | undefined} input
 */
export function buildWorkspaceCapabilities(input = {}) {
  const scope = input && typeof input === 'object' ? input : {};
  const grants = Array.isArray(scope.masterGrants)
    ? scope.masterGrants.map((g) => String(g || '').trim()).filter(Boolean)
    : [];
  const hasCreateGrant =
    grants.length === 0
      ? true // when grants unknown, rely on scope flag alone for UI
      : grants.includes('project.project.create');

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
