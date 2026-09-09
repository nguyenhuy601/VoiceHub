/** Nhãn i18n + diff before/after — không gọi API user. */

export const AUDIT_RESOURCE_TYPE_OPTIONS = [
  { value: 'project', labelKey: 'adminAudit.typeProject' },
  { value: 'task', labelKey: 'adminAudit.typeTask' },
  { value: 'project_member', labelKey: 'adminAudit.typeProjectMember' },
  { value: 'approval', labelKey: 'adminAudit.typeApproval' },
  { value: 'master_data', labelKey: 'adminAudit.typeMasterData' },
  { value: 'project_role', labelKey: 'adminAudit.typeProjectRole' },
  { value: 'governance_settings', labelKey: 'adminAudit.typeGovernanceSettings' },
  { value: 'sprint', labelKey: 'adminAudit.typeSprint' },
  { value: 'organization', labelKey: 'adminAudit.typeOrganization' },
];

const ACTION_LABEL_KEYS = {
  'project.created': 'adminAudit.actionProjectCreated',
  'project.updated': 'adminAudit.actionProjectUpdated',
  'project.archived': 'adminAudit.actionProjectArchived',
  'project.members.roles_updated': 'adminAudit.actionProjectMembersRoles',
  'project_role.updated': 'adminAudit.actionProjectRoleUpdated',
  'project_role.deleted': 'adminAudit.actionProjectRoleDeleted',
  'task.updated': 'adminAudit.actionTaskUpdated',
  'governance.retention_updated': 'adminAudit.actionRetentionUpdated',
  'governance.retention_stub_run': 'adminAudit.actionRetentionStub',
  'sprint.closed': 'adminAudit.actionSprintClosed',
  'approval.event': 'adminAudit.actionApprovalEvent',
};

const FIELD_LABEL_KEYS = {
  name: 'adminAudit.fieldName',
  title: 'adminAudit.fieldTitle',
  status: 'adminAudit.fieldStatus',
  archived: 'adminAudit.fieldArchived',
  description: 'adminAudit.fieldDescription',
  visibility: 'adminAudit.fieldVisibility',
  workTypeConfig: 'adminAudit.fieldWorkTypeConfig',
  treeOrder: 'adminAudit.fieldWorkTypeOrder',
  depthById: 'adminAudit.fieldWorkTypeDepth',
  createOrder: 'adminAudit.fieldWorkTypeCreateOrder',
};

const WORK_TYPE_LABEL_KEYS = {
  epic: 'workspace.projectHubIssueTypeEpic',
  feature: 'workspace.projectHubIssueTypeFeature',
  story: 'workspace.projectHubIssueTypeStory',
  task: 'workspace.projectHubIssueTypeTask',
  bug: 'workspace.projectHubIssueTypeBug',
  subtask: 'workspace.projectHubIssueTypeSubtask',
};

const WORK_TYPE_IDS = new Set(Object.keys(WORK_TYPE_LABEL_KEYS));

const RESOURCE_TYPE_LABEL_KEYS = Object.fromEntries(
  AUDIT_RESOURCE_TYPE_OPTIONS.map((opt) => [opt.value, opt.labelKey])
);

function resolvedLabel(t, path, fallback) {
  const label = t(path);
  return label && label !== path ? label : fallback;
}

export function resourceTypeLabel(t, resourceType) {
  const raw = String(resourceType || '').trim();
  if (!raw) return t('adminAudit.emptyValue');
  const path = RESOURCE_TYPE_LABEL_KEYS[raw];
  return path ? resolvedLabel(t, path, raw) : raw;
}

export function actionLabel(t, action) {
  const raw = String(action || '').trim();
  if (!raw) return t('adminAudit.emptyValue');
  const path = ACTION_LABEL_KEYS[raw];
  if (path) return resolvedLabel(t, path, raw);
  return raw.split('.').filter(Boolean).join(' · ');
}

export function fieldLabel(t, key) {
  const raw = String(key || '').trim();
  const path = FIELD_LABEL_KEYS[raw];
  return path ? resolvedLabel(t, path, raw) : raw;
}

const SECRET_KEY_RE = /password|passwd|token|secret|authorization|api[-_]?key|refreshToken/i;

export function isSecretFieldKey(key) {
  return SECRET_KEY_RE.test(String(key || ''));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Che password/token trước khi đưa ra UI (diff + JSON kỹ thuật). */
export function redactAuditTree(value, t) {
  if (Array.isArray(value)) return value.map((item) => redactAuditTree(item, t));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = isSecretFieldKey(key) ? t('adminAudit.redacted') : redactAuditTree(nested, t);
  }
  return out;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function asFieldMap(value) {
  if (value == null) return {};
  if (isPlainObject(value)) return value;
  return { value };
}

/** @returns {{ key: string, before: unknown, after: unknown }[]} */
export function buildFieldDiff(before, after) {
  if (before == null && after == null) return [];
  const left = asFieldMap(before);
  const right = asFieldMap(after);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const rows = [];
  for (const key of keys) {
    const prev = Object.prototype.hasOwnProperty.call(left, key) ? left[key] : undefined;
    const next = Object.prototype.hasOwnProperty.call(right, key) ? right[key] : undefined;
    if (valuesEqual(prev, next)) continue;
    rows.push({ key, before: prev, after: next });
  }
  return rows;
}

function workTypeName(t, id) {
  const raw = String(id || '').toLowerCase();
  const path = WORK_TYPE_LABEL_KEYS[raw];
  return path ? resolvedLabel(t, path, raw) : String(id || '');
}

function isWorkTypeIdList(value) {
  return (
    Array.isArray(value) &&
    value.some((item) => WORK_TYPE_IDS.has(String(item).toLowerCase())) &&
    value.every((item) => item == null || WORK_TYPE_IDS.has(String(item).toLowerCase()))
  );
}

function isWorkTypeIdMap(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => WORK_TYPE_IDS.has(String(key).toLowerCase()));
}

function looksLikeWorkTypeConfig(value) {
  return isPlainObject(value) && Array.isArray(value.treeOrder);
}

function formatWorkTypeIdList(t, ids) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => (id == null ? t('adminAudit.emptyValue') : workTypeName(t, id)))
    .join(' → ');
}

function formatWorkTypeDepthMap(t, value) {
  const rows = Object.entries(value).sort(
    (left, right) => Number(left[1]) - Number(right[1]) || String(left[0]).localeCompare(String(right[0]))
  );
  return rows.map(([id, depth]) => `${workTypeName(t, id)} (${depth})`).join(' → ');
}

function formatWorkTypeHiddenMap(t, value) {
  const names = Object.entries(value)
    .filter(([, hidden]) => Boolean(hidden))
    .map(([id]) => workTypeName(t, id));
  if (!names.length) return t('adminAudit.workTypeNoneHidden');
  return t('adminAudit.workTypeHidden', { names: names.join(', ') });
}

/** Tóm tắt workTypeConfig cho ô Thay đổi — JSON đầy đủ nằm ở Chi tiết kỹ thuật. */
function formatWorkTypeConfigSummary(value, t) {
  if (!isPlainObject(value)) return '';
  const parts = [];
  if (isWorkTypeIdList(value.treeOrder)) {
    parts.push(t('adminAudit.workTypeOrder', { order: formatWorkTypeIdList(t, value.treeOrder) }));
  }
  if (isWorkTypeIdMap(value.hidden)) {
    const names = Object.entries(value.hidden)
      .filter(([, hidden]) => Boolean(hidden))
      .map(([id]) => workTypeName(t, id));
    if (names.length) parts.push(t('adminAudit.workTypeHidden', { names: names.join(', ') }));
  }
  return parts.join('. ');
}

export function formatAuditValue(value, t, locale, fieldKey = '') {
  if (isSecretFieldKey(fieldKey)) return t('adminAudit.redacted');
  if (value === undefined || value === null || value === '') return t('adminAudit.emptyValue');
  if (typeof value === 'boolean') return value ? t('adminAudit.boolTrue') : t('adminAudit.boolFalse');
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
    return value;
  }
  if (looksLikeWorkTypeConfig(value) || fieldKey === 'workTypeConfig') {
    const summary = formatWorkTypeConfigSummary(value, t);
    if (summary) return summary;
  }
  if (Array.isArray(value)) {
    if (!value.length) return t('adminAudit.emptyValue');
    if (isWorkTypeIdList(value)) return formatWorkTypeIdList(t, value);
    if (value.every((item) => item == null || typeof item !== 'object')) {
      return value.map((item) => (item == null ? t('adminAudit.emptyValue') : String(item))).join(', ');
    }
  }
  if (isWorkTypeIdMap(value)) {
    if (fieldKey === 'depthById' || Object.values(value).every((item) => typeof item === 'number')) {
      return formatWorkTypeDepthMap(t, value) || t('adminAudit.emptyValue');
    }
    if (fieldKey === 'hidden' || Object.values(value).every((item) => typeof item === 'boolean')) {
      return formatWorkTypeHiddenMap(t, value);
    }
  }
  try {
    return JSON.stringify(redactAuditTree(value, t));
  } catch {
    return String(value);
  }
}
