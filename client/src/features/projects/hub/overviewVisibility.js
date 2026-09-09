/**
 * Overview tab — quyết định fetch/render theo hubCaps + informationLevel.
 * Fail-closed khi chưa có capabilities từ GET /projects/:id.
 */

function hasPerm(hubCaps, key) {
  const perms = Array.isArray(hubCaps?.permissions) ? hubCaps.permissions : [];
  return perms.includes(key);
}

/**
 * @param {ReturnType<import('./hubCaps.js').resolveHubCapabilities>} hubCaps
 * @param {{ informationLevel?: string, capsReady?: boolean }} [opts]
 */
export function resolveOverviewVisibility(hubCaps, opts = {}) {
  const informationLevel = String(opts.informationLevel || 'details').toLowerCase();
  const capsReady = opts.capsReady !== false;
  const isSummaryOnly = informationLevel === 'summary';

  const empty = {
    capsReady: false,
    isSummaryOnly,
    canViewTaskMetrics: false,
    canViewMemberBreakdown: false,
    canViewSprintContext: false,
    canViewPlanningPulse: false,
    canViewActivity: false,
    canShowAssigneeNames: false,
    canOpenBacklog: false,
    canOpenBoard: false,
  };

  if (!capsReady) return empty;

  const perms = Array.isArray(hubCaps?.permissions) ? hubCaps.permissions : [];
  const canViewMemberBreakdown = Boolean(hubCaps?.canViewMembers);
  const canViewBoard = hubCaps?.canViewBoard !== false;
  const canViewWorkItems =
    hubCaps?.canViewWorkItems != null
      ? Boolean(hubCaps.canViewWorkItems)
      : canViewBoard &&
        (hasPerm(hubCaps, 'task:view') ||
          hasPerm(hubCaps, 'project:view') ||
          perms.length === 0);
  const canViewTaskMetrics = canViewWorkItems;

  const canViewSprintContext =
    !isSummaryOnly &&
    (Boolean(hubCaps?.canViewSprints) ||
      hasPerm(hubCaps, 'sprint:view') ||
      Boolean(hubCaps?.canManageSprints));

  const canViewPlanningPulse =
    !isSummaryOnly && Boolean(hubCaps?.canViewBacklog);

  const canViewActivity =
    !isSummaryOnly &&
    (hubCaps?.canViewActivityTab != null
      ? Boolean(hubCaps.canViewActivityTab)
      : canViewTaskMetrics);
  const canShowAssigneeNames = canViewMemberBreakdown;
  const canOpenBacklog = Boolean(hubCaps?.canViewBacklog);
  const canOpenBoard = canViewWorkItems;

  return {
    capsReady: true,
    isSummaryOnly,
    canViewTaskMetrics,
    canViewMemberBreakdown,
    canViewSprintContext,
    canViewPlanningPulse,
    canViewActivity,
    canShowAssigneeNames,
    canOpenBacklog,
    canOpenBoard,
  };
}
