import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHubCapabilities } from './hubCaps.js';
import { resolveOverviewVisibility } from './overviewVisibility.js';

test('resolveOverviewVisibility: chưa capsReady → fail-closed', () => {
  const caps = resolveHubCapabilities({
    capabilities: { permissions: ['task:view', 'members:view'] },
  });
  const v = resolveOverviewVisibility(caps, { capsReady: false });
  assert.equal(v.canViewTaskMetrics, false);
  assert.equal(v.canViewMemberBreakdown, false);
});

test('resolveOverviewVisibility: thiếu members:view → ẩn assignee', () => {
  const caps = resolveHubCapabilities({
    capabilities: {
      canViewMembers: false,
      permissions: ['project:view', 'task:view', 'sprint:view'],
    },
  });
  const v = resolveOverviewVisibility(caps, { capsReady: true });
  assert.equal(v.canViewTaskMetrics, true);
  assert.equal(v.canViewMemberBreakdown, false);
  assert.equal(v.canShowAssigneeNames, false);
  assert.equal(v.canViewSprintContext, true);
});

test('resolveOverviewVisibility: summary → không sprint/planning/activity', () => {
  const caps = resolveHubCapabilities({
    capabilities: {
      canViewMembers: true,
      permissions: ['project:view', 'task:view', 'sprint:view', 'backlog:view'],
    },
  });
  const v = resolveOverviewVisibility(caps, {
    capsReady: true,
    informationLevel: 'summary',
  });
  assert.equal(v.isSummaryOnly, true);
  assert.equal(v.canViewSprintContext, false);
  assert.equal(v.canViewPlanningPulse, false);
  assert.equal(v.canViewActivity, false);
});

test('resolveOverviewVisibility: canViewPlanningPulse theo backlog:view', () => {
  const noBacklog = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'task:view', 'sprint:view'],
    },
  });
  const hidden = resolveOverviewVisibility(noBacklog, { capsReady: true });
  assert.equal(hidden.canViewPlanningPulse, false);
  assert.equal(hidden.canOpenBacklog, false);
  assert.equal(hidden.canOpenBoard, true);

  const withBacklog = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'task:view', 'backlog:view'],
    },
  });
  const visible = resolveOverviewVisibility(withBacklog, { capsReady: true });
  assert.equal(visible.canViewPlanningPulse, true);
  assert.equal(visible.canOpenBacklog, true);
});
