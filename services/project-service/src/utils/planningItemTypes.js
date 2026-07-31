/** PlanningItem type/status — pure constants (G3). */

const PLANNING_ITEM_TYPES = Object.freeze([
  'roadmap',
  'release',
  'milestone',
  'epic',
  'feature',
]);

const PLANNING_ITEM_STATUSES = Object.freeze([
  'planned',
  'active',
  'done',
  'cancelled',
]);

const ISSUE_TYPES = Object.freeze(['task', 'bug', 'story']);

module.exports = {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_STATUSES,
  ISSUE_TYPES,
};
