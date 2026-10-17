/**
 * Project Hub capability helpers — Phase 2.1 RBAC + Scrum layers.
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
  return types;
}

export function isProjectCompletedStatus(status) {
  const st = String(status || '').trim().toLowerCase();
  return st === 'closed' || st === 'completed' || st === 'cancelled' || st === 'canceled' || st === 'archived';
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
    canViewSettings: false,
    canManageProjectRoles: false,
    canManageSprints: false,
    canStartSprint: false,
    canCloseSprint: false,
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
    const canManageMembers =
      caps.canManageMembers != null
        ? Boolean(caps.canManageMembers)
        : permissions.includes('members:manage');
    const canViewMembers =
      caps.canViewMembers != null
        ? Boolean(caps.canViewMembers)
        : permissions.includes('members:view');
    const canViewChangeRequests =
      caps.canViewChangeRequests != null
        ? Boolean(caps.canViewChangeRequests)
        : permissions.includes('change_request:view');
    const canCreateChangeRequest = flagOrPerm(caps, 'canCreateChangeRequest', ['change_request:create']);
    const canUpdateChangeRequest = flagOrPerm(caps, 'canUpdateChangeRequest', ['change_request:update']);
    const canDeleteChangeRequest = flagOrPerm(caps, 'canDeleteChangeRequest', ['change_request:delete']);
    const canViewBoard = Boolean(caps.canView ?? true);
    const canViewBacklog =
      caps.canViewBacklog != null
        ? Boolean(caps.canViewBacklog)
        : permissions.includes('backlog:view');
    const canViewWorkItems =
      caps.canViewWorkItems != null
        ? Boolean(caps.canViewWorkItems)
        : permissions.includes('task:view');
    const canViewReport =
      caps.canViewReport != null
        ? Boolean(caps.canViewReport)
        : permissions.includes('report:view');
    const canViewFiles =
      caps.canViewFiles != null
        ? Boolean(caps.canViewFiles)
        : permissions.includes('files:view');
    const canViewActivityTab =
      caps.canViewActivityTab != null
        ? Boolean(caps.canViewActivityTab)
        : permissions.includes('activity:view');
    const canViewSprints =
      caps.canViewSprints != null
        ? Boolean(caps.canViewSprints)
        : permissions.includes('sprint:view');
    const canManageSprints =
      caps.canManageSprints != null
        ? Boolean(caps.canManageSprints)
        : ['sprint:create', 'sprint:start', 'sprint:close'].some((k) => permissions.includes(k));
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
        canViewSettings:
          caps.canViewSettings != null
            ? Boolean(caps.canViewSettings)
            : permissions.includes('settings:view'),
        canManageProjectRoles:
          caps.canManageProjectRoles != null
            ? Boolean(caps.canManageProjectRoles)
            : permissions.includes('project:roles'),
        canManageSprints,
        canStartSprint: flagOrPerm(caps, 'canStartSprint', ['sprint:start']),
        canCloseSprint: flagOrPerm(caps, 'canCloseSprint', ['sprint:close']),
        canDeleteSprint: flagOrPerm(caps, 'canDeleteSprint', ['sprint:delete']),
        canManageDelivery: flagOrPerm(caps, 'canManageDelivery', ['delivery:manage']),
        canViewBoard,
        canViewBacklog,
        canViewWorkItems,
        canViewReport,
        canViewFiles,
        canViewActivityTab,
        canViewSprints,
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
        canCompleteProject: flagOrPerm(caps, 'canCompleteProject', ['project:complete']),
        canArchiveProject: flagOrPerm(caps, 'canArchiveProject', ['project:archive']),
        canArchiveWithoutComplete: permissions.includes('project:delete'),
        canChangeDeliveryPhase: caps?.canChangeDeliveryPhase === true,
        canSignOffUat: caps?.canSignOffUat === true,
        // SoD: chỉ tin flag BE (role matrix) — không suy từ permissions dump (creator/admin).
        canAcceptHandover: caps?.canAcceptHandover === true,
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
      canViewSettings: fallback,
      canManageProjectRoles: fallback,
      canManageSprints: fallback,
      canStartSprint: fallback,
      canCloseSprint: fallback,
      canDeleteSprint: fallback,
      canManageDelivery: fallback,
      canViewBoard: true,
      canViewBacklog: fallback,
      canViewWorkItems: true,
      canViewReport: fallback,
      canViewFiles: fallback,
      canViewActivityTab: true,
      canViewSprints: fallback,
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
      canArchiveProject: fallback,
      canArchiveWithoutComplete: fallback,
      canChangeDeliveryPhase: fallback,
      canSignOffUat: fallback,
      canAcceptHandover: false,
      allowedIssueTypes: fallback ? ['story', 'task', 'bug'] : [],
      permissions: [],
    },
    readOnly
  );
}
