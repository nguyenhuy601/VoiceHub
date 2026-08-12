/**
 * Project Hub capability helpers — Phase 2.1 RBAC V2 + Scrum layers.
 * @param {object|null|undefined} projectPayload — getProject response (data)
 */
function permSet(caps) {
  return Array.isArray(caps?.permissions) ? caps.permissions : [];
}

function flagOrPerm(caps, flag, keys) {
  if (caps && caps[flag] != null) return Boolean(caps[flag]);
  const perms = permSet(caps);
  return keys.some((k) => perms.includes(k));
}

export function allowedIssueTypesFromCaps(caps) {
  const perms = permSet(caps);
  const types = [];
  if (perms.includes('story:create') || caps?.canCreateStory) types.push('story');
  if (perms.includes('task:create') || caps?.canCreateTask) types.push('task');
  if (perms.includes('bug:create') || caps?.canCreateBug) types.push('bug');
  if (!types.length && (caps?.canCreateCards || caps?.canManageBoard)) {
    return ['story', 'task', 'bug'];
  }
  return types;
}

export function resolveHubCapabilities(projectPayload, { canManageFallback = false } = {}) {
  const caps = projectPayload?.capabilities || null;
  if (caps) {
    const permissions = permSet(caps);
    const canManageMembers = Boolean(caps.canManageMembers);
    const canViewMembers =
      caps.canViewMembers != null
        ? Boolean(caps.canViewMembers)
        : canManageMembers ||
          permissions.includes('members:view') ||
          permissions.includes('members:manage');
    return {
      canManagePlanning: Boolean(caps.canManagePlanning),
      canManageMembers,
      canViewMembers,
      canManageSettings: Boolean(caps.canManageSettings),
      canManageSprints: Boolean(caps.canManageSprints),
      canViewBoard: Boolean(caps.canView ?? caps.canEditCards ?? true),
      canCreateEpic: flagOrPerm(caps, 'canCreateEpic', ['epic:create']),
      canUpdateEpic: flagOrPerm(caps, 'canUpdateEpic', ['epic:update']),
      canDeleteEpic: flagOrPerm(caps, 'canDeleteEpic', ['epic:delete']),
      canCreateStory: flagOrPerm(caps, 'canCreateStory', ['story:create']),
      canUpdateStory: flagOrPerm(caps, 'canUpdateStory', ['story:update']),
      canCreateTask: flagOrPerm(caps, 'canCreateTask', ['task:create']),
      canCreateBug: flagOrPerm(caps, 'canCreateBug', ['bug:create']),
      canPrioritizeBacklog: flagOrPerm(caps, 'canPrioritizeBacklog', ['backlog:prioritize']),
      canUpdateBacklog: flagOrPerm(caps, 'canUpdateBacklog', ['backlog:update']),
      canEstimate: flagOrPerm(caps, 'canEstimate', ['task:estimate']),
      allowedIssueTypes: allowedIssueTypesFromCaps(caps),
      permissions,
    };
  }
  const fallback = Boolean(canManageFallback);
  return {
    canManagePlanning: fallback,
    canManageMembers: fallback,
    canViewMembers: true,
    canManageSettings: fallback,
    canManageSprints: fallback,
    canViewBoard: true,
    canCreateEpic: fallback,
    canUpdateEpic: fallback,
    canDeleteEpic: fallback,
    canCreateStory: fallback,
    canUpdateStory: fallback,
    canCreateTask: fallback,
    canCreateBug: fallback,
    canPrioritizeBacklog: fallback,
    canUpdateBacklog: fallback,
    canEstimate: fallback,
    allowedIssueTypes: fallback ? ['story', 'task', 'bug'] : [],
    permissions: [],
  };
}
