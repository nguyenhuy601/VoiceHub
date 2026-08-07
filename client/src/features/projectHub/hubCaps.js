/**
 * Project Hub capability helpers — Phase 2.1 RBAC V2.
 * @param {object|null|undefined} projectPayload — getProject response (data)
 */
export function resolveHubCapabilities(projectPayload, { canManageFallback = false } = {}) {
  const caps = projectPayload?.capabilities || null;
  if (caps) {
    return {
      canManagePlanning: Boolean(caps.canManagePlanning),
      canManageMembers: Boolean(caps.canManageMembers),
      canManageSettings: Boolean(caps.canManageSettings),
      canManageSprints: Boolean(caps.canManageSprints),
      canViewBoard: Boolean(caps.canView ?? caps.canEditCards ?? true),
      permissions: Array.isArray(caps.permissions) ? caps.permissions : [],
    };
  }
  const fallback = Boolean(canManageFallback);
  return {
    canManagePlanning: fallback,
    canManageMembers: fallback,
    canManageSettings: fallback,
    canManageSprints: fallback,
    canViewBoard: true,
    permissions: [],
  };
}
