/**
 * Project Hub capability helpers — Phase 2.1 RBAC V2 + Scrum layers.
 * @param {object|null|undefined} projectPayload — getProject response (data)
 */
function permSet(caps) {
  return Array.isArray(caps?.permissions) ? caps.permissions : [];
}

function flagOrPerm(caps, flag, keys) {
  if (caps?.[flag]) return true;
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

export function isProjectCompletedStatus(status) {
  const st = String(status || '').trim().toLowerCase();
  return st === 'closed' || st === 'completed';
}

function applyReadOnly(caps, readOnly) {
  if (!readOnly) return { ...caps, readOnly: false };
  return {
    ...caps,
    readOnly: true,
    canManagePlanning: false,
    canManageMembers: false,
    canCreateChangeRequest: false,
    canUpdateChangeRequest: false,
    canDeleteChangeRequest: false,
    canManageSettings: false,
    canManageSprints: false,
    canDeleteSprint: false,
    canManageDelivery: false,
    canCreateEpic: false,
    canUpdateEpic: false,
    canDeleteEpic: false,
    canCreateStory: false,
    canUpdateStory: false,
    canCreateTask: false,
    canCreateBug: false,
    canPrioritizeBacklog: false,
    canUpdateBacklog: false,
    canEstimate: false,
    canCompleteProject: false,
    allowedIssueTypes: [],
  };
}

export function resolveHubCapabilities(projectPayload, { canManageFallback = false } = {}) {
  const readOnly = isProjectCompletedStatus(projectPayload?.status);
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
    const canViewChangeRequests =
      caps.canViewChangeRequests != null
        ? Boolean(caps.canViewChangeRequests)
        : permissions.includes('change_request:view');
    const canCreateChangeRequest = flagOrPerm(caps, 'canCreateChangeRequest', ['change_request:create']);
    const canUpdateChangeRequest = flagOrPerm(caps, 'canUpdateChangeRequest', ['change_request:update']);
    const canDeleteChangeRequest = flagOrPerm(caps, 'canDeleteChangeRequest', ['change_request:delete']);
    return applyReadOnly(
      {
        canManagePlanning: Boolean(caps.canManagePlanning),
        canManageMembers,
        canViewMembers,
        canViewChangeRequests,
        canCreateChangeRequest,
        canUpdateChangeRequest,
        canDeleteChangeRequest,
        canManageSettings: Boolean(caps.canManageSettings),
        canManageSprints: Boolean(caps.canManageSprints),
        canDeleteSprint: flagOrPerm(caps, 'canDeleteSprint', ['sprint:delete']),
        canManageDelivery: flagOrPerm(caps, 'canManageDelivery', ['delivery:manage']),
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
        canCompleteProject: flagOrPerm(caps, 'canManageBoard', ['project:archive', 'project:edit']),
        allowedIssueTypes: allowedIssueTypesFromCaps(caps),
        permissions,
      },
      readOnly
    );
  }
  const fallback = Boolean(canManageFallback);
  return applyReadOnly(
    {
      canManagePlanning: fallback,
      canManageMembers: fallback,
      canViewMembers: fallback,
      canViewChangeRequests: fallback,
      canCreateChangeRequest: fallback,
      canUpdateChangeRequest: fallback,
      canDeleteChangeRequest: fallback,
      canManageSettings: fallback,
      canManageSprints: fallback,
      canDeleteSprint: fallback,
      canManageDelivery: fallback,
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
      canCompleteProject: fallback,
      allowedIssueTypes: fallback ? ['story', 'task', 'bug'] : [],
      permissions: [],
    },
    readOnly
  );
}
