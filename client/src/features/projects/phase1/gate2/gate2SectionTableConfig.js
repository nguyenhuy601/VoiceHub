/**
 * Gate2 Planning Review — column config per HOW section (mirror Gate1).
 */

function tr(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  if (value == null || value === '' || value === key) return fallback;
  return value;
}

function clip(value, max = 120) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

const COL_TITLE = {
  key: 'title',
  headerKey: 'requirements.phase1ColTitle',
  headerFallback: 'Tiêu đề',
  field: 'title',
  editable: true,
  defaultPx: 200,
  minPx: 100,
  render: (r) => clip(r.title || r.name || '—'),
};

const COL_SUMMARY = {
  key: 'summary',
  headerKey: 'requirements.gate2ColSummary',
  headerFallback: 'Tóm tắt',
  field: 'summary',
  editable: true,
  defaultPx: 220,
  minPx: 120,
  render: (r) => clip(r.summary || '—', 160),
};

const COL_STATUS = {
  key: 'status',
  headerKey: 'requirements.phase1ColStatus',
  headerFallback: 'Trạng thái',
  editable: false,
  defaultPx: 110,
  minPx: 80,
  render: (r, t) => {
    const raw = String(r?.status || '').trim();
    if (!raw) return '—';
    return tr(t, `requirements.gate2ItemStatus_${raw.toUpperCase()}`, raw);
  },
};

const GATE2_SECTION_COLUMNS = {
  tasks: [
    COL_TITLE,
    {
      key: 'level',
      headerKey: 'requirements.gate2ColLevel',
      headerFallback: 'Level',
      field: 'level',
      editable: true,
      defaultPx: 90,
      minPx: 64,
      render: (r) => r.level || '—',
    },
    {
      key: 'role',
      headerKey: 'requirements.gate2ColRole',
      headerFallback: 'Role',
      field: 'suggestedRoleKey',
      editable: true,
      defaultPx: 130,
      minPx: 80,
      render: (r) => r.suggestedRoleKey || '—',
    },
    {
      key: 'effort',
      headerKey: 'requirements.gate2ColEffort',
      headerFallback: 'Effort (h)',
      field: 'effortHours',
      editable: true,
      defaultPx: 90,
      minPx: 64,
      render: (r) => (r.effortHours != null ? String(r.effortHours) : '—'),
    },
    COL_STATUS,
  ],
  dependencies: [
    COL_TITLE,
    {
      key: 'depType',
      headerKey: 'requirements.gate2ColDepType',
      headerFallback: 'Type',
      field: 'depType',
      editable: true,
      defaultPx: 80,
      minPx: 56,
      render: (r) => r.depType || '—',
    },
    COL_SUMMARY,
    COL_STATUS,
  ],
  assignments: [
    COL_TITLE,
    {
      key: 'assignee',
      headerKey: 'requirements.gate2ColAssignee',
      headerFallback: 'Assignee',
      field: 'assignee',
      editable: true,
      defaultPx: 140,
      minPx: 80,
      render: (r) => r.assignee || '—',
    },
    {
      key: 'score',
      headerKey: 'requirements.gate2ColScore',
      headerFallback: 'Score',
      editable: false,
      defaultPx: 80,
      minPx: 56,
      render: (r) => (r.score != null ? String(r.score) : '—'),
    },
    COL_STATUS,
  ],
  schedule: [
    COL_TITLE,
    {
      key: 'startDate',
      headerKey: 'requirements.gate2ColStart',
      headerFallback: 'Start',
      field: 'startDate',
      editable: true,
      defaultPx: 110,
      minPx: 80,
      render: (r) => r.startDate || '—',
    },
    {
      key: 'dueDate',
      headerKey: 'requirements.gate2ColDue',
      headerFallback: 'Due',
      field: 'dueDate',
      editable: true,
      defaultPx: 110,
      minPx: 80,
      render: (r) => r.dueDate || '—',
    },
    {
      key: 'effort',
      headerKey: 'requirements.gate2ColEffort',
      headerFallback: 'Effort (h)',
      field: 'effortHours',
      editable: true,
      defaultPx: 90,
      minPx: 64,
      render: (r) => (r.effortHours != null ? String(r.effortHours) : '—'),
    },
    COL_STATUS,
  ],
  risks: [COL_TITLE, COL_SUMMARY, COL_STATUS],
};

const FALLBACK = GATE2_SECTION_COLUMNS.tasks;

export function getGate2ColumnsForSection(section) {
  return GATE2_SECTION_COLUMNS[String(section || '')] || FALLBACK;
}

export function getGate2FieldValue(row, col, editedPayload) {
  const field = col?.field;
  if (!field) return '';
  if (editedPayload && Object.prototype.hasOwnProperty.call(editedPayload, field)) {
    return editedPayload[field];
  }
  return row?.[field] ?? '';
}

export function seedGate2EditedPayload(row, columns) {
  const payload = {};
  for (const col of columns || []) {
    if (!col?.editable || !col.field) continue;
    payload[col.field] = getGate2FieldValue(row, col, null);
  }
  return payload;
}

export function patchGate2EditedPayload(prev, field, value) {
  return { ...(prev && typeof prev === 'object' ? prev : {}), [field]: value };
}

export function getGate2RowId(row, index = 0) {
  return String(row?.logicalId || row?.id || `row-${index}`).trim();
}

const DECISION_ACTIONS = new Set(['accept', 'edit', 'reject']);

export function areGate2SectionDecisionsComplete(bySection, decisions = {}) {
  if (!bySection || typeof bySection !== 'object') return false;
  let total = 0;
  for (const rows of Object.values(bySection)) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i += 1) {
      const id = getGate2RowId(rows[i], i);
      if (!id) continue;
      total += 1;
      const action = String(decisions[id]?.action || '').toLowerCase();
      if (!DECISION_ACTIONS.has(action)) return false;
    }
  }
  return total > 0;
}

export function countGate2PendingDecisions(bySection, decisions = {}) {
  if (!bySection || typeof bySection !== 'object') return 0;
  let pending = 0;
  for (const rows of Object.values(bySection)) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i += 1) {
      const id = getGate2RowId(rows[i], i);
      if (!id) continue;
      const action = String(decisions[id]?.action || '').toLowerCase();
      if (!DECISION_ACTIONS.has(action)) pending += 1;
    }
  }
  return pending;
}

export const GATE2_SCROLL_PAGE_SIZE = 30;

export default getGate2ColumnsForSection;
