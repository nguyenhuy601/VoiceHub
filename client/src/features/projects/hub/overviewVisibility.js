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
  };

  if (!capsReady) return empty;

  const perms = Array.isArray(hubCaps?.permissions) ? hubCaps.permissions : [];
  const canViewMemberBreakdown = Boolean(hubCaps?.canViewMembers);
  const canViewBoard = hubCaps?.canViewBoard !== false;
  const canViewTaskMetrics =
    canViewBoard &&
    (hasPerm(hubCaps, 'task:view') ||
      hasPerm(hubCaps, 'project:view') ||
      perms.length === 0);

  const canViewSprintContext =
    !isSummaryOnly &&
    (hasPerm(hubCaps, 'sprint:view') || Boolean(hubCaps?.canManageSprints));

  const canViewPlanningPulse =
    !isSummaryOnly &&
    canViewTaskMetrics &&
    (hasPerm(hubCaps, 'epic:create') ||
      hasPerm(hubCaps, 'story:create') ||
      hasPerm(hubCaps, 'backlog:update') ||
      hasPerm(hubCaps, 'task:view'));

  const canViewActivity = canViewTaskMetrics && !isSummaryOnly;
  const canShowAssigneeNames = canViewMemberBreakdown;

  return {
    capsReady: true,
    isSummaryOnly,
    canViewTaskMetrics,
    canViewMemberBreakdown,
    canViewSprintContext,
    canViewPlanningPulse,
    canViewActivity,
    canShowAssigneeNames,
  };
}
