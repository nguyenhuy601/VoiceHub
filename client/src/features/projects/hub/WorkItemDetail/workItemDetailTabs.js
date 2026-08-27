import {
  childWorkTypeIdsForParent,
  workTypeTitleKey,
} from '../projectWorkTypes.js';
import { isPlanningIssue, namedWorkType, relId } from './workItemDetailUtils.js';

/**
 * Resolve work type của item đang mở (kể cả subtask suy ra từ parent).
 */
export function resolveWorkItemType(issue, boardCards, workTypeConfig, seen = new Set()) {
  if (!issue) return 'task';
  const id = relId(issue._id || issue.id);
  if (id) {
    if (seen.has(id)) {
      return namedWorkType(issue.issueType || issue.type || issue.workType) || 'task';
    }
    seen.add(id);
  }
  if (String(issue?.kind || '') === 'planning') {
    return namedWorkType(issue.issueType || issue.type || issue.workType) || 'feature';
  }
  const named = namedWorkType(issue.issueType || issue.type || issue.workType);
  if (named) return named;
  const parentId = relId(issue.parentTaskId);
  if (!parentId) return 'task';
  const parentCard = (Array.isArray(boardCards) ? boardCards : []).find(
    (c) => relId(c._id || c.id) === parentId
  );
  const parentType = parentCard
    ? resolveWorkItemType(parentCard, boardCards, workTypeConfig, seen)
    : 'task';
  const childIds = childWorkTypeIdsForParent(parentType, workTypeConfig);
  if (childIds.includes('subtask') && !childIds.includes('task')) return 'subtask';
  if (childIds.includes('task')) return 'task';
  return childIds[0] || 'task';
}

/**
 * Context thuần cho visible(tab) — không React.
 * @param {object} opts
 * @param {object} [opts.workItem]
 * @param {object} [opts.workTypeConfig]
 * @param {array} [opts.boardCards]
 * @param {boolean} [opts.timeTrackingEnabled]
 * @param {boolean} [opts.canViewHistory]
 * @param {boolean} [opts.canEstimate]
 */
export function buildTabVisibilityContext(opts = {}) {
  const workItem = opts.workItem || null;
  const workTypeConfig = opts.workTypeConfig || null;
  const boardCards = opts.boardCards || [];
  const workType = resolveWorkItemType(workItem, boardCards, workTypeConfig);
  const kind = isPlanningIssue(workItem) ? 'planning' : 'task';
  const childTypeIds = childWorkTypeIdsForParent(workType, workTypeConfig);
  const childrenLabelKey =
    childTypeIds.length === 1
      ? workTypeTitleKey(childTypeIds[0])
      : 'workspace.projectHubWorkTabChildren';

  return {
    workItem,
    workType,
    workTypeConfig,
    kind,
    childTypeIds,
    childrenLabelKey,
    canViewHistory: opts.canViewHistory !== false,
    timeTrackingEnabled: Boolean(opts.timeTrackingEnabled),
    canEstimate: Boolean(opts.canEstimate),
    showApprovals: opts.showApprovals !== false && kind !== 'planning',
  };
}

/**
 * Tab registry — thêm section = thêm 1 object.
 * `component` gắn ở WorkItemDetail.jsx để file này test được bằng node:test.
 */
export const WORK_ITEM_DETAIL_TAB_DEFS = [
  {
    id: 'overview',
    labelKey: 'workspace.projectHubWorkTabOverview',
    visible: () => true,
  },
  {
    id: 'description',
    labelKey: 'workspace.projectHubWorkTabDescription',
    visible: () => true,
  },
  {
    id: 'children',
    labelKey: null, // dynamic via childrenLabelKey
    visible: (ctx) => Array.isArray(ctx.childTypeIds) && ctx.childTypeIds.length > 0,
  },
  {
    id: 'activity',
    labelKey: 'workspace.projectHubWorkTabActivity',
    visible: (ctx) => ctx.kind !== 'planning' || Boolean(ctx.canViewHistory),
  },
  {
    id: 'attachments',
    labelKey: 'workspace.projectHubWorkTabAttachments',
    visible: (ctx) => ctx.kind !== 'planning',
  },
  {
    id: 'worklog',
    labelKey: 'workspace.projectHubWorkTabWorklog',
    visible: (ctx) =>
      ctx.kind !== 'planning' && Boolean(ctx.timeTrackingEnabled) && Boolean(ctx.canEstimate),
  },
  {
    id: 'approvals',
    labelKey: 'workspace.projectHubWorkTabApprovals',
    visible: (ctx) => Boolean(ctx.showApprovals) && ctx.kind !== 'planning',
  },
];

export function listVisibleTabs(ctx) {
  return WORK_ITEM_DETAIL_TAB_DEFS.filter((tab) => {
    try {
      return Boolean(tab.visible(ctx));
    } catch {
      return false;
    }
  }).map((tab) => ({
    id: tab.id,
    labelKey:
      tab.id === 'children' ? ctx.childrenLabelKey || 'workspace.projectHubWorkTabChildren' : tab.labelKey,
  }));
}

export function listVisibleTabIds(ctx) {
  return listVisibleTabs(ctx).map((t) => t.id);
}

/**
 * Giữ tab đang chọn nếu vẫn visible; nếu không → preferred hoặc tab đầu.
 * Dùng khi visibility đổi (worklog flag…) mà không reset về initialPanel mỗi render.
 */
export function clampActiveTab(activeTabId, visibleIds, preferredTabId) {
  const ids = Array.isArray(visibleIds) ? visibleIds.filter(Boolean) : [];
  if (!ids.length) return 'overview';
  const cur = String(activeTabId || '');
  if (cur && ids.includes(cur)) return cur;
  const pref = String(preferredTabId || 'overview');
  if (ids.includes(pref)) return pref;
  return ids[0];
}

export function pickInitialVisibleTab(ctx, preferredTabId) {
  const ids = listVisibleTabIds(ctx);
  if (!ids.length) return 'overview';
  const pref = String(preferredTabId || 'overview');
  if (ids.includes(pref)) return pref;
  return ids[0];
}
