/** Helpers thuần cho WorkItemDetail (không React). */

export function relId(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
}

export function isPlanningIssue(issue) {
  return (
    String(issue?.kind || '') === 'planning' ||
    String(issue?.issueType || issue?.type || '').toLowerCase() === 'feature' ||
    String(issue?.issueType || issue?.type || '').toLowerCase() === 'epic'
  );
}

export function namedWorkType(raw) {
  const id = String(raw || '').toLowerCase();
  if (id === 'epic' || id === 'feature' || id === 'story' || id === 'bug' || id === 'subtask') {
    return id;
  }
  if (id === 'task') return 'task';
  return '';
}

export function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function resolveWorkItemDueDate(workItem, { isPlanning } = {}) {
  if (!workItem) return null;
  if (isPlanning) return workItem.targetDate ?? workItem.dueDate ?? null;
  return workItem.dueDate ?? null;
}

export function resolveWorkItemStartDate(workItem) {
  return workItem?.startDate ?? null;
}

export function hoursInputValue(raw) {
  if (raw == null || raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : '';
}

export function unwrapList(res, unwrapPayload) {
  const data = typeof unwrapPayload === 'function' ? unwrapPayload(res) : res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.members)) return data.members;
  return [];
}

/**
 * Map legacy TaskBoardCardDetailModal initialPanel → tab id.
 * attach → attachments; labels|dates|members|detail → overview
 */
export function mapInitialPanelToTab(initialPanel) {
  const p = String(initialPanel || 'detail').toLowerCase();
  if (p === 'attach' || p === 'attachments') return 'attachments';
  if (p === 'activity' || p === 'comments') return 'activity';
  if (p === 'children' || p === 'subtasks') return 'children';
  if (p === 'description') return 'description';
  if (p === 'worklog') return 'worklog';
  if (p === 'approvals') return 'approvals';
  return 'overview';
}

export const HISTORY_FIELD_I18N = {
  status: 'workspace.projectHubWorkFieldStatus',
  parentId: 'workspace.projectHubWorkFieldParent',
  parentTaskId: 'workspace.projectHubWorkFieldParent',
  title: 'workspace.projectHubWorkFieldTitle',
  assigneeId: 'workspace.projectHubWorkFieldAssignee',
  dueDate: 'workspace.projectHubWorkFieldDueDate',
  priority: 'workspace.projectHubWorkFieldPriority',
  estimateHours: 'workspace.projectHubWorkFieldEstimate',
  sprintId: 'workspace.projectHubWorkFieldSprint',
  issueType: 'workspace.projectHubWorkFieldIssueType',
  comment: 'workspace.projectHubWorkFieldComment',
  worklog: 'workspace.projectHubWorkFieldWorklog',
  issue: 'workspace.projectHubWorkFieldIssue',
  listId: 'workspace.projectHubWorkFieldList',
  epicId: 'workspace.projectHubWorkFieldEpic',
  tags: 'workspace.projectHubWorkFieldLabels',
  labels: 'workspace.projectHubWorkFieldLabels',
  sortOrder: 'workspace.projectHubWorkFieldRank',
  description: 'workspace.projectHubWorkFieldDescription',
};
