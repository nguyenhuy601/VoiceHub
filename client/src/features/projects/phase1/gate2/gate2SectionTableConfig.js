/**
 * Gate2 Planning Review — column config per HOW section (mirror Gate1).
 * "Nguồn" = AI đề xuất | Heuristic | Nhân viên (PM edit / manual).
 */

import { createElement } from 'react';
import { localizedProjectRoleLabel } from '../../../../utils/projectRoleLocale';
import { resolveDependencyDecisionStatus } from './dependencyDisplay';

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

/** Soft display fallback when older HOW runs omitted suggestedRoleKey (mirrors BE AREA_ROLE_HINT). */
const AREA_ROLE_HINT = Object.freeze({
  frontend: 'frontend_developer',
  backend: 'backend_developer',
  database: 'backend_developer',
  api: 'backend_developer',
  auth: 'backend_developer',
  infrastructure: 'devops_engineer',
  infra: 'devops_engineer',
  external: 'backend_developer',
  security: 'backend_developer',
  deployment: 'devops_engineer',
  qa: 'qa_engineer',
  design: 'ui_ux_designer',
  management: 'project_manager',
  analysis: 'business_analyst',
});

function wbsRoleDisplay(row, t) {
  const level = String(row?.level || '').toLowerCase();
  let key = String(row?.suggestedRoleKey || '').trim();
  if (!key) {
    if (level === 'epic') key = 'project_manager';
    else if (level === 'feature') key = 'technical_lead';
    else if (level === 'story') key = 'business_analyst';
    else {
      const area = String(row?.area || '').toLowerCase();
      key = AREA_ROLE_HINT[area] || (level === 'task' ? 'backend_developer' : '');
    }
  }
  if (!key) return '—';
  // Phase rollup rows (effort_roles) keep phase ids as-is.
  if (['dev', 'qa', 'deploy', 'mgmt'].includes(key)) return key;
  const labeled = localizedProjectRoleLabel(key, key, t);
  // Gate2 table: drop «Dự án —» prefix for density; keep catalog suffix.
  return String(labeled || key)
    .replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '')
    .trim() || key;
}

/**
 * Resolve row origin for HOW / Gate2 tables.
 * Nhân viên when PM edits or provenance is manual / Gate1;
 * AI đề xuất when generateJson wrote the text;
 * Heuristic when a rule engine calculated the row.
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
  // Hierarchy via Level column only — flat title (no indent / tree glyphs).
  const title = clip(row?.title || row?.name || '—', 140);
  const expandable = Boolean(row?.hasChildren && row?.isWbsContainer);
  const expanded = expandable ? ctx.wbsExpanded !== false : true;
  const onToggle = typeof ctx.onToggleWbs === 'function' ? ctx.onToggleWbs : null;
  return createElement(
    expandable ? 'button' : 'span',
    {
      type: expandable ? 'button' : undefined,
      className: `inline-block max-w-full whitespace-pre-wrap break-words text-left ${
        expandable ? 'hover:underline' : ''
      }`,
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
    title
  );
}

function wbsLevelLabel(row, t) {
  const level = String(row?.level || '').toLowerCase();
  if (!level) return '—';
  const fallback = WBS_LEVEL_LABELS[level] || level;
  return tr(t, `requirements.gate2WbsLevel_${level}`, fallback);
}

/** ISO date → ngày/tháng/năm. Non-dates stay blank so the cell shows an em dash. */
export function formatGate2CalendarDay(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const GATE2_SECTION_COLUMNS = {
  tasks: [
    {
      ...COL_TITLE,
      defaultPx: 280,
      minPx: 140,
      render: (r, t, ctx) => wbsTitleIndent(r, t, ctx),
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
      render: (r, t) => wbsRoleDisplay(r, t),
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
        if (r.duplicateOf) return '0';
        if (r.effortHours == null) return '—';
        const base = String(r.effortHours);
        return r.effortRolledUp ? `${base} Σ` : base;
      },
    },
    {
      key: 'deliverable',
      headerKey: 'requirements.gate2ColDeliverable',
      headerFallback: 'Deliverable',
      field: 'deliverable',
      editable: true,
      defaultPx: 180,
      minPx: 100,
      render: (r) => r.deliverable || '—',
    },
    COL_STATUS,
    COL_AUDIT_SOURCE,
  ],
  dependencies: [
    {
      key: 'relation',
      headerKey: 'requirements.gate2ColDepRelation',
      headerFallback: 'Quan hệ',
      field: 'relationLabel',
      editable: false,
      defaultPx: 220,
      minPx: 140,
      render: (r) =>
        clip(
          r.relationLabel ||
            `${r.predecessorName || r.predecessorTaskId || '?'} → ${r.successorName || r.successorTaskId || '?'}`,
          140
        ),
    },
    {
      key: 'title',
      headerKey: 'requirements.gate2ColDepReason',
      headerFallback: 'Lý do',
      field: 'title',
      editable: true,
      defaultPx: 200,
      minPx: 120,
      render: (r) => clip(r.reason || r.title || r.summary || '—', 140),
    },
    {
      key: 'blockingScope',
      headerKey: 'requirements.gate2ColDepScope',
      headerFallback: 'Phạm vi chặn',
      field: 'blockingScope',
      editable: true,
      defaultPx: 120,
      minPx: 80,
      render: (r, t) => {
        const scope = String(r.blockingScope || 'FULL').toUpperCase();
        return tr(t, `requirements.gate2DepScope_${scope}`, scope);
      },
    },
    {
      key: 'parallel',
      headerKey: 'requirements.gate2ColDepParallel',
      headerFallback: 'Song song',
      field: 'parallelLabel',
      editable: false,
      defaultPx: 140,
      minPx: 90,
      render: (r) => {
        if (r.canWorkInParallel) {
          return clip(r.parallelCondition || r.parallelLabel || 'Có thể song song', 100);
        }
        return r.parallelLabel || 'Tuần tự';
      },
    },
    {
      key: 'depType',
      headerKey: 'requirements.gate2ColDepType',
      headerFallback: 'Type',
      field: 'depType',
      editable: true,
      defaultPx: 72,
      minPx: 48,
      render: (r) => r.relationship || r.depType || 'FS',
    },
    {
      key: 'status',
      headerKey: 'requirements.phase1ColStatus',
      headerFallback: 'Trạng thái',
      editable: false,
      defaultPx: 110,
      minPx: 80,
      render: (r, t, ctx) => {
        const status = resolveDependencyDecisionStatus(r, ctx?.decision);
        return tr(t, `requirements.gate2ItemStatus_${status}`, status);
      },
    },
    COL_AUDIT_SOURCE,
  ],
  assignments: [
    COL_TITLE,
    {
      key: 'role',
      headerKey: 'requirements.gate2ColRole',
      headerFallback: 'Role',
      field: 'suggestedRoleKey',
      editor: 'select',
      placeholderKey: 'requirements.gate2AssignPickRole',
      placeholderFallback: 'Chọn vai trò',
      editable: true,
      defaultPx: 140,
      minPx: 80,
      render: (r, t) => wbsRoleDisplay(r, t),
    },
    {
      key: 'effort',
      headerKey: 'requirements.gate2ColEffort',
      headerFallback: 'Effort (h)',
      field: 'effortHours',
      editable: false,
      defaultPx: 90,
      minPx: 64,
      render: (r) => (r.effortHours != null ? String(r.effortHours) : '—'),
    },
    {
      key: 'assignee',
      headerKey: 'requirements.gate2ColAssignee',
      headerFallback: 'Assignee',
      field: 'assigneeUserId',
      editor: 'select',
      placeholderKey: 'requirements.gate2AssignPickPerson',
      placeholderFallback: 'Chọn nhân sự',
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
      render: (r, _t, ctx) => {
        const edited = ctx?.decision?.editedPayload;
        const score =
          edited && Object.prototype.hasOwnProperty.call(edited, 'score') ? edited.score : r.score;
        return score != null && score !== '' ? String(score) : '—';
      },
    },
    {
      ...COL_STATUS,
      render: (r, t, ctx) => {
        const edited = ctx?.decision?.editedPayload;
        const raw =
          edited && Object.prototype.hasOwnProperty.call(edited, 'status')
            ? edited.status
            : r?.status;
        const text = String(raw || '').trim();
        if (!text) return '—';
        return tr(t, `requirements.gate2ItemStatus_${text.toUpperCase()}`, text);
      },
    },
    COL_AUDIT_SOURCE,
  ],
  schedule: [
    COL_TITLE,
    {
      key: 'startDate',
      headerKey: 'requirements.gate2ColStart',
      headerFallback: 'Bắt đầu',
      field: 'startDate',
      editable: true,
      defaultPx: 120,
      minPx: 96,
      render: (r) => formatGate2CalendarDay(r.startDate) || '—',
    },
    {
      key: 'dueDate',
      headerKey: 'requirements.gate2ColDue',
      headerFallback: 'Kết thúc',
      field: 'dueDate',
      editable: true,
      defaultPx: 120,
      minPx: 96,
      render: (r) => formatGate2CalendarDay(r.dueDate) || '—',
    },
    {
      key: 'effort',
      headerKey: 'requirements.gate2ColEffort',
      headerFallback: 'Effort (h)',
      field: 'effortHours',
      editable: false,
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
      render: (r) => {
        const kind = String(r.level || '').trim();
        const band = String(r.band || '').trim();
        if (kind && band && band.toLowerCase() !== kind.toLowerCase()) return `${kind} · ${band}`;
        return kind || band || '—';
      },
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
      render: (r) => formatGate2CalendarDay(r.startDate) || '—',
    },
    {
      key: 'estimatedEnd',
      headerKey: 'requirements.gate2ColDue',
      headerFallback: 'End',
      field: 'estimatedEnd',
      editable: true,
      defaultPx: 110,
      minPx: 80,
      render: (r) => formatGate2CalendarDay(r.estimatedEnd) || '—',
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
    {
      key: 'taskCount',
      headerKey: 'requirements.gate2ColTaskCount',
      headerFallback: 'Tasks',
      field: 'taskCount',
      editable: false,
      defaultPx: 72,
      minPx: 56,
      render: (r) => (r.taskCount != null ? String(r.taskCount) : '—'),
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
      render: (r, t) => wbsRoleDisplay(r, t),
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
  if (Array.isArray(row?.taskIds) && row.taskIds.length) {
    payload.taskIds = row.taskIds.map(String);
  }
  if (row?.assignee && row.assignee !== '—') payload.assignee = String(row.assignee);
  if (row?.score != null && Number.isFinite(Number(row.score))) payload.score = Number(row.score);
  if (row?.availableHours != null && Number.isFinite(Number(row.availableHours))) {
    payload.availableHours = Number(row.availableHours);
  }
  if (row?.status) payload.status = String(row.status);
  payload.overload = Boolean(row?.overload);
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
