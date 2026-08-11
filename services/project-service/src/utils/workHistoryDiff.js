const { buildBeforeAfter } = require('./auditSnapshot');

const TASK_HISTORY_FIELDS = [
  'title',
  'status',
  'listId',
  'assigneeId',
  'epicId',
  'parentTaskId',
  'dueDate',
  'priority',
  'tags',
  'estimateHours',
  'sprintId',
  'issueType',
];

const PLANNING_HISTORY_FIELDS = [
  'title',
  'status',
  'parentId',
  'sortOrder',
  'targetDate',
  'description',
];

function serializeHistoryValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => serializeHistoryValue(v)).filter((v) => v != null);
  }
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
      const s = String(value);
      if (s && s !== '[object Object]') return s;
    }
  }
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return String(value);
}

function valuesEqual(a, b) {
  return JSON.stringify(serializeHistoryValue(a)) === JSON.stringify(serializeHistoryValue(b));
}

/**
 * Diff field whitelist giữa before/after. Bỏ field không đổi hoặc ngoài whitelist.
 */
function diffWhitelistedFields(beforeDoc, afterDoc, whitelist = []) {
  const keys = (Array.isArray(whitelist) ? whitelist : []).filter(Boolean);
  const { before, after } = buildBeforeAfter(beforeDoc, afterDoc, keys);
  const changes = [];
  for (const field of keys) {
    if (!Object.prototype.hasOwnProperty.call(after, field) && !Object.prototype.hasOwnProperty.call(before, field)) {
      continue;
    }
    const from = before[field] === undefined ? null : before[field];
    const to = after[field] === undefined ? null : after[field];
    if (valuesEqual(from, to)) continue;
    changes.push({
      field,
      from: serializeHistoryValue(from),
      to: serializeHistoryValue(to),
    });
  }
  return changes;
}

function diffTaskFields(beforeDoc, afterDoc) {
  return diffWhitelistedFields(beforeDoc, afterDoc, TASK_HISTORY_FIELDS);
}

function diffPlanningFields(beforeDoc, afterDoc) {
  return diffWhitelistedFields(beforeDoc, afterDoc, PLANNING_HISTORY_FIELDS);
}

function diffTaskPatch(beforeDoc, patch = {}) {
  const keys = Object.keys(patch || {}).filter((k) => TASK_HISTORY_FIELDS.includes(k));
  return diffWhitelistedFields(beforeDoc, { ...(beforeDoc || {}), ...(patch || {}) }, keys);
}

function mapLogRow(row) {
  const type = String(row?.type || '');
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const base = {
    id: String(row._id),
    actorId: row.actorId ? String(row.actorId) : '',
    createdAt: row.createdAt || null,
    type,
    field: null,
    from: null,
    to: null,
  };

  if (type === 'work.field_changed') {
    return {
      ...base,
      field: String(payload.field || ''),
      from: payload.from === undefined ? null : payload.from,
      to: payload.to === undefined ? null : payload.to,
    };
  }
  if (type === 'estimate_updated') {
    return {
      ...base,
      field: 'estimateHours',
      from: payload.before === undefined ? null : payload.before,
      to: payload.after === undefined ? null : payload.after,
    };
  }
  if (type === 'task.created' || type === 'task.subtask_created') {
    return { ...base, field: 'issue', from: null, to: row.title || payload.title || null };
  }
  if (type === 'worklog_added') {
    return {
      ...base,
      field: 'worklog',
      from: null,
      to: payload.hours != null ? payload.hours : row.title || null,
    };
  }
  if (type === 'task.updated') {
    const fields = Array.isArray(payload.fields) ? payload.fields : [];
    if (fields.length === 1) {
      return { ...base, field: String(fields[0]), from: null, to: null };
    }
    if (fields.length > 1) {
      return { ...base, field: fields.map(String).join(','), from: null, to: null };
    }
    return { ...base, field: 'issue', from: null, to: null };
  }
  return { ...base, field: type || 'issue', from: null, to: null };
}

function expandLegacyUpdated(row) {
  const type = String(row?.type || '');
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  if (type !== 'task.updated') return [mapLogRow(row)];
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  if (fields.length <= 1) return [mapLogRow(row)];
  return fields.map((field) => ({
    id: `${row._id}:${field}`,
    actorId: row.actorId ? String(row.actorId) : '',
    createdAt: row.createdAt || null,
    type,
    field: String(field),
    from: null,
    to: null,
  }));
}

module.exports = {
  TASK_HISTORY_FIELDS,
  PLANNING_HISTORY_FIELDS,
  serializeHistoryValue,
  valuesEqual,
  diffWhitelistedFields,
  diffTaskFields,
  diffPlanningFields,
  diffTaskPatch,
  mapLogRow,
  expandLegacyUpdated,
};
