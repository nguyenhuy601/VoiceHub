/** PlanningItem type/status — constants + normalize (G3). */

const { slugPriorityKey } = require('./priorityConfig');

const PLANNING_ITEM_TYPES = Object.freeze([
  'roadmap',
  'release',
  'milestone',
  'epic',
  'feature',
]);

/** Legacy catalog — vẫn chấp nhận khi đọc/ghi cũ. */
const PLANNING_ITEM_STATUSES = Object.freeze([
  'planned',
  'active',
  'done',
  'cancelled',
]);

const ISSUE_TYPES = Object.freeze(['task', 'bug', 'story']);

function slugPlanningStatusKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
}

/**
 * Status planning: 4 giá trị legacy hoặc statusKey workflow (todo/doing/…).
 * Rác → fallback.
 */
function normalizePlanningStatus(raw, fallback = 'planned') {
  const s = slugPlanningStatusKey(raw);
  if (s) return s;
  const fb = slugPlanningStatusKey(fallback);
  return fb || 'planned';
}

function normalizePlanningPriority(raw, fallback = 'medium') {
  const s = slugPriorityKey(raw);
  if (s) return s;
  const fb = slugPriorityKey(fallback);
  return fb || 'medium';
}

module.exports = {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_STATUSES,
  ISSUE_TYPES,
  slugPlanningStatusKey,
  normalizePlanningStatus,
  normalizePlanningPriority,
};
