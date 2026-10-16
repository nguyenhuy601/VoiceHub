/**
 * Gate2 Planning Review — column config per HOW section (mirror Gate1).
 * "Nguồn" = AI đề xuất | Heuristic | Nhân viên (PM edit / manual).
 */

import { createElement } from 'react';

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

/** Audit source codes shown in Gate2 "Nguồn" column. */
export const GATE2_AUDIT_SOURCE = Object.freeze({
  AI: 'AI',
  HEURISTIC: 'HEURISTIC',
  EMPLOYEE: 'EMPLOYEE',
});

/**
 * Resolve row origin for HOW / Gate2 tables.
 * Nhân viên when PM edits or provenance is manual;
 * Heuristic when engine stamped HEURISTIC / source=heuristic;
 * else AI đề xuất.
 * @param {object} row
 * @param {{ action?: string }|null|undefined} decision
 * @returns {'AI'|'HEURISTIC'|'EMPLOYEE'}
 */
export function resolveGate2AuditSource(row, decision) {
  const action = String(decision?.action || '').toLowerCase();
  if (action === 'edit' || action === 'create') {
    return GATE2_AUDIT_SOURCE.EMPLOYEE;
  }
  const type = String(
    row?.provenance?.type || row?.origin?.type || row?.dataSource || ''
  )
    .trim()
    .toUpperCase();
  if (
    type === 'EMPLOYEE' ||
    type === 'HUMAN' ||
    type === 'MANUAL' ||
    type === 'PM' ||
    type === 'PM_ADDED' ||
    type === 'STAFF' ||
    type === 'GATE1_APPROVED'
  ) {
    return GATE2_AUDIT_SOURCE.EMPLOYEE;
  }
  const source = String(row?.source || '').trim().toLowerCase();
  if (
    source === 'manual' ||
    source === 'employee' ||
    source === 'human' ||
    source === 'pm'
  ) {
    return GATE2_AUDIT_SOURCE.EMPLOYEE;
  }
  if (type === 'HEURISTIC' || source === 'heuristic') {
    return GATE2_AUDIT_SOURCE.HEURISTIC;
  }
  const producer = String(row?.provenance?.producer || '').trim().toLowerCase();
  if (producer === 'how_heuristic' || producer === 'heuristic_rule') {
    return GATE2_AUDIT_SOURCE.HEURISTIC;
  }
  return GATE2_AUDIT_SOURCE.AI;
}

function auditSourceLabel(row, t, ctx) {
  const code = resolveGate2AuditSource(row, ctx?.decision);
  const fallbacks = {
    AI: 'AI đề xuất',
    HEURISTIC: 'Heuristic',
    EMPLOYEE: 'Nhân viên',
  };
  return tr(t, `requirements.gate2AuditSource_${code}`, fallbacks[code] || code);
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

const COL_AUDIT_SOURCE = {
  key: 'auditSource',
  headerKey: 'requirements.gate2ColAuditSource',
  headerFallback: 'Nguồn',
  editable: false,
  defaultPx: 120,
  minPx: 90,
  /** @param {object} row @param {function} [t] @param {{ decision?: object }} [ctx] */
  render: auditSourceLabel,
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

const WBS_LEVEL_LABELS = Object.freeze({
  epic: 'Epic',
  feature: 'Feature',
  story: 'Story',
  work_package: 'Work package',
  task: 'Task',
});

function wbsTitleIndent(row, _t, ctx = {}) {
  const depth = Math.max(0, Math.min(8, Number(row?.depth) || 0));
  const title = clip(row?.title || row?.name || '—', 140);
  const expandable = Boolean(row?.hasChildren && row?.isWbsContainer);
  const expanded = expandable ? ctx.wbsExpanded !== false : true;
  const twisty = expandable ? (expanded ? '▼ ' : '▶ ') : depth > 0 ? '└ ' : '';
  const label = `${twisty}${title}`;
  const onToggle = typeof ctx.onToggleWbs === 'function' ? ctx.onToggleWbs : null;
  return createElement(
    expandable ? 'button' : 'span',
    {
      type: expandable ? 'button' : undefined,
      className: `inline-block max-w-full whitespace-pre-wrap break-words text-left ${
        expandable ? 'hover:underline' : ''
      }`,
      style: { paddingLeft: depth ? `${depth * 12}px` : undefined },
      onClick: expandable
        ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle?.(row.id);
          }
        : undefined,
      title: expandable
        ? expanded
          ? 'Thu gọn'
          : 'Mở các task / dòng con'
        : undefined,
    },
    label
  );
}

function wbsLevelLabel(row, t) {
  const level = String(row?.level || '').toLowerCase();
  if (!level) return '—';
  const fallback = WBS_LEVEL_LABELS[level] || level;
  return tr(t, `requirements.gate2WbsLevel_${level}`, fallback);
}

const GATE2_SECTION_COLUMNS = {
  tasks: [
    {
      ...COL_TITLE,
      defaultPx: 280,
      minPx: 140,
      render: (r) => wbsTitleIndent(r),
    },
    {
      key: 'level',
      headerKey: 'requirements.gate2ColLevel',
      headerFallback: 'Level',
      field: 'level',
      editable: true,
      defaultPx: 110,
      minPx: 72,
      render: (r, t) => wbsLevelLabel(r, t),
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
      render: (r) => {
        if (r.effortHours == null) return '—';
        const base = String(r.effortHours);
        return r.effortRolledUp ? `${base} Σ` : base;
      },
    },
    COL_STATUS,
    COL_AUDIT_SOURCE,
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
    COL_AUDIT_SOURCE,
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
    COL_AUDIT_SOURCE,
  ],
  capacity: [
    COL_TITLE,
    {
      key: 'conflictType',
      headerKey: 'requirements.gate2ColConflictType',
      headerFallback: 'Type',
      field: 'conflictType',
      editable: false,
      defaultPx: 130,
      minPx: 80,
      render: (r) => r.conflictType || '—',
    },
    {
      key: 'userId',
      headerKey: 'requirements.gate2ColUser',
      headerFallback: 'User',
      field: 'userId',
      editable: false,
      defaultPx: 120,
      minPx: 72,
      render: (r) => r.userId || '—',
    },
    {
      key: 'dateKey',
      headerKey: 'requirements.gate2ColDate',
      headerFallback: 'Date',
      field: 'dateKey',
      editable: false,
      defaultPx: 110,
      minPx: 80,
      render: (r) => r.dateKey || '—',
    },
    {
      key: 'remainingHours',
      headerKey: 'requirements.gate2ColRemainingH',
      headerFallback: 'Left (h)',
      field: 'remainingHours',
      editable: false,
      defaultPx: 80,
      minPx: 56,
      render: (r) => (r.remainingHours != null ? String(r.remainingHours) : '—'),
    },
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
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
    COL_AUDIT_SOURCE,
  ],
  scope: [
    COL_TITLE,
    {
      key: 'level',
      headerKey: 'requirements.gate2ColLevel',
      headerFallback: 'Kind',
      field: 'level',
      editable: true,
      defaultPx: 120,
      minPx: 72,
      render: (r) => r.level || r.scopeType || '—',
    },
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  risks: [
    COL_TITLE,
    {
      key: 'level',
      headerKey: 'requirements.gate2ColLevel',
      headerFallback: 'Kind',
      field: 'level',
      editable: true,
      defaultPx: 110,
      minPx: 72,
      render: (r) => r.level || r.band || '—',
    },
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  releases: [
    COL_TITLE,
    {
      key: 'kind',
      headerKey: 'requirements.gate2ColKind',
      headerFallback: 'Kind',
      field: 'kind',
      editable: true,
      defaultPx: 100,
      minPx: 64,
      render: (r) => r.kind || '—',
    },
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
      key: 'estimatedEnd',
      headerKey: 'requirements.gate2ColDue',
      headerFallback: 'End',
      field: 'estimatedEnd',
      editable: true,
      defaultPx: 110,
      minPx: 80,
      render: (r) => r.estimatedEnd || '—',
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
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  quality: [
    COL_TITLE,
    {
      key: 'level',
      headerKey: 'requirements.gate2ColLevel',
      headerFallback: 'Level',
      field: 'level',
      editable: true,
      defaultPx: 100,
      minPx: 64,
      render: (r) => r.level || '—',
    },
    {
      key: 'sourceUcKey',
      headerKey: 'requirements.gate2ColSourceUc',
      headerFallback: 'UC',
      field: 'sourceUcKey',
      editable: true,
      defaultPx: 110,
      minPx: 72,
      render: (r) => r.sourceUcKey || '—',
    },
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  deploy: [
    COL_TITLE,
    {
      key: 'kind',
      headerKey: 'requirements.gate2ColKind',
      headerFallback: 'Kind',
      field: 'kind',
      editable: true,
      defaultPx: 100,
      minPx: 64,
      render: (r) => r.kind || '—',
    },
    {
      key: 'level',
      headerKey: 'requirements.gate2ColLevel',
      headerFallback: 'Detail',
      field: 'level',
      editable: true,
      defaultPx: 120,
      minPx: 72,
      render: (r) => r.level || '—',
    },
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  architecture: [
    COL_TITLE,
    {
      key: 'layer',
      headerKey: 'requirements.gate2ColLayer',
      headerFallback: 'Layer',
      field: 'layer',
      editable: true,
      defaultPx: 110,
      minPx: 72,
      render: (r) => r.layer || '—',
    },
    {
      key: 'impactLevel',
      headerKey: 'requirements.gate2ColImpact',
      headerFallback: 'Impact',
      field: 'impactLevel',
      editable: true,
      defaultPx: 90,
      minPx: 64,
      render: (r) => r.impactLevel || '—',
    },
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  effort_roles: [
    COL_TITLE,
    {
      key: 'role',
      headerKey: 'requirements.gate2ColRole',
      headerFallback: 'Role',
      field: 'suggestedRoleKey',
      editable: true,
      defaultPx: 140,
      minPx: 80,
      render: (r) => r.suggestedRoleKey || r.title || '—',
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
    COL_SUMMARY,
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
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

/** Fixed body height for Gate2 / HOW Monitor tables (align with Gate1). */
export const GATE2_TABLE_BODY_HEIGHT_CLASS = 'h-96';

export default getGate2ColumnsForSection;
