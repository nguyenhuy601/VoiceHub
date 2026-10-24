/**
 * Gate1 Review — column config per Analysis Proposal section.
 * Decision column is rendered by Gate1SectionReviewTable, not listed here.
 * headerKey uses requirements.* i18n; render(row, t, ctx?) for localized cell values.
 * "Nguồn" = audit source (FILE / AI / HUMAN / BA); BA when create or BA_ADDED; HUMAN when edit.
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

/** Audit source codes shown in Gate1 "Nguồn" column. */
export const GATE1_AUDIT_SOURCE = Object.freeze({
  FILE: 'FILE',
  AI: 'AI',
  HUMAN: 'HUMAN',
  BA: 'BA',
});

/**
 * Resolve audit source for a proposal row.
 * BA when create / BA_ADDED; HUMAN when Gate1 decision is edit; else provenance/origin.
 * @param {object} row
 * @param {{ action?: string }|null|undefined} decision
 * @returns {'FILE'|'AI'|'HUMAN'|'BA'}
 */
export function resolveGate1AuditSource(row, decision) {
  const action = String(decision?.action || '').toLowerCase();
  if (action === 'create') {
    return GATE1_AUDIT_SOURCE.BA;
  }
  const type = String(row?.provenance?.type || row?.origin?.type || '')
    .trim()
    .toUpperCase();
  if (type === 'BA_ADDED' || type === 'BA') {
    return GATE1_AUDIT_SOURCE.BA;
  }
  if (action === 'edit') {
    return GATE1_AUDIT_SOURCE.HUMAN;
  }
  if (type === 'EXTRACTED') return GATE1_AUDIT_SOURCE.FILE;
  // HEURISTIC / DERIVED / AI_SYNTHESIS (and unknown proposal origins) → AI đề xuất
  return GATE1_AUDIT_SOURCE.AI;
}

function auditSourceLabel(row, t, ctx) {
  const code = resolveGate1AuditSource(row, ctx?.decision);
  const fallbacks = {
    FILE: 'Trích xuất file',
    AI: 'AI đề xuất',
    HUMAN: 'Người',
    BA: 'BA',
  };
  return tr(t, `requirements.phase1AuditSource_${code}`, fallbacks[code] || code);
}

function stepsLabel(row, t) {
  const steps = row?.steps;
  if (!Array.isArray(steps) || !steps.length) return '—';
  return tr(t, 'requirements.phase1StepsCount', '{count} bước').replace(
    '{count}',
    String(steps.length)
  );
}

function attributesLabel(row) {
  const attrs = row?.attributes;
  if (!Array.isArray(attrs) || !attrs.length) return '—';
  return clip(attrs.map((a) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', '));
}

function inOutLabel(row, t) {
  if (row?.inScope === false) return tr(t, 'requirements.phase1ScopeOut', 'Ngoài phạm vi');
  if (row?.inScope === true) return tr(t, 'requirements.phase1ScopeIn', 'Trong phạm vi');
  const type = String(row?.scopeType || '').toLowerCase();
  if (type === 'out') return tr(t, 'requirements.phase1ScopeOut', 'Ngoài phạm vi');
  if (type === 'in') return tr(t, 'requirements.phase1ScopeIn', 'Trong phạm vi');
  return '—';
}

function sourceClip(row) {
  const refs = Array.isArray(row?.sourceRefs) ? row.sourceRefs : [];
  if (!refs.length) return '—';
  const first = refs[0];
  if (typeof first === 'string') return clip(first, 80);
  const parts = [first.sheet, first.row != null ? `r${first.row}` : null, first.documentId]
    .filter((x) => x != null && x !== '')
    .map(String);
  return clip(parts.join(' · ') || JSON.stringify(first), 80);
}

/**
 * @typedef {{
 *   key: string,
 *   headerKey: string,
 *   headerFallback: string,
 *   render: (row: object, t?: function) => string,
 *   field?: string,
 *   editable?: boolean,
 *   defaultPx?: number,
 *   minPx?: number,
 * }} Gate1Column
 */

const COL_ID = {
  key: 'id',
  headerKey: 'requirements.phase1ColId',
  headerFallback: 'ID',
  editable: false,
  defaultPx: 88,
  minPx: 64,
  /** ctx.displayId = compacted label after reject (logicalId stays decision key). */
  render: (r, _t, ctx) => ctx?.displayId || r.logicalId || r.id || '—',
};

const COL_TITLE = {
  key: 'title',
  headerKey: 'requirements.phase1ColTitle',
  headerFallback: 'Tiêu đề',
  field: 'title',
  editable: true,
  defaultPx: 220,
  minPx: 120,
  render: (r) => r.title || '—',
};

const COL_DESCRIPTION = {
  key: 'description',
  headerKey: 'requirements.phase1ColDescription',
  headerFallback: 'Mô tả',
  field: 'description',
  editable: true,
  defaultPx: 280,
  minPx: 160,
  render: (r) => r.description || '—',
};

const COL_PRIORITY = {
  key: 'priority',
  headerKey: 'requirements.phase1ColPriority',
  headerFallback: 'Ưu tiên',
  field: 'priority',
  editable: true,
  defaultPx: 96,
  minPx: 72,
  render: (r) => r.priority || '—',
};

const COL_ACTORS = {
  key: 'actorsLabel',
  headerKey: 'requirements.phase1ColActors',
  headerFallback: 'Tác nhân',
  field: 'actorsLabel',
  editable: false,
  defaultPx: 140,
  minPx: 90,
  render: (r) => r.actorsLabel || '—',
};

const COL_AUDIT_SOURCE = {
  key: 'auditSource',
  headerKey: 'requirements.phase1ColAuditSource',
  headerFallback: 'Nguồn',
  editable: false,
  defaultPx: 120,
  minPx: 90,
  /** @param {object} row @param {function} [t] @param {{ decision?: object }} [ctx] */
  render: auditSourceLabel,
};

/** @type {Record<string, Gate1Column[]>} */
export const GATE1_SECTION_COLUMNS = {
  functionalRequirements: [
    COL_ID,
    COL_TITLE,
    COL_DESCRIPTION,
    COL_PRIORITY,
    COL_ACTORS,
    {
      key: 'sourceCrLabel',
      headerKey: 'requirements.phase1ColSourceCr',
      headerFallback: 'CR nguồn',
      editable: false,
      defaultPx: 120,
      minPx: 80,
      render: (r) => clip(r.sourceCrLabel || (Array.isArray(r.sourceCrIds) ? r.sourceCrIds.join(', ') : ''), 80) || '—',
    },
    {
      key: 'ac',
      headerKey: 'requirements.phase1ColAc',
      headerFallback: 'Tiêu chí chấp nhận',
      field: 'ac',
      editable: true,
      defaultPx: 260,
      minPx: 140,
      render: (r) => r.ac || r.acceptanceCriteria || '—',
    },
    COL_AUDIT_SOURCE,
  ],
  backlogStructure: [
    COL_ID,
    {
      key: 'level',
      headerKey: 'requirements.phase1ColLevel',
      headerFallback: 'Mức',
      field: 'level',
      editable: false,
      defaultPx: 80,
      minPx: 64,
      render: (r) => String(r.level || '—').toUpperCase(),
    },
    COL_TITLE,
    {
      key: 'parentLabel',
      headerKey: 'requirements.phase1ColParentEpic',
      headerFallback: 'Epic cha',
      field: 'parentLabel',
      editable: false,
      defaultPx: 120,
      minPx: 80,
      render: (r) => r.parentLabel || r.parentEpicId || '—',
    },
    {
      key: 'frIdsLabel',
      headerKey: 'requirements.phase1ColFrIds',
      headerFallback: 'FR',
      field: 'frIdsLabel',
      editable: false,
      defaultPx: 140,
      minPx: 90,
      render: (r) => clip(r.frIdsLabel, 80) || '—',
    },
    {
      key: 'ac',
      headerKey: 'requirements.phase1ColAc',
      headerFallback: 'Tiêu chí chấp nhận',
      field: 'ac',
      editable: true,
      defaultPx: 200,
      minPx: 120,
      render: (r) => clip(r.ac, 100) || '—',
    },
    COL_AUDIT_SOURCE,
  ],
  nonFunctionalRequirements: [
    COL_ID,
    COL_TITLE,
    COL_DESCRIPTION,
    COL_PRIORITY,
    {
      key: 'category',
      headerKey: 'requirements.phase1ColCategory',
      headerFallback: 'Danh mục',
      field: 'category',
      editable: true,
      defaultPx: 140,
      minPx: 90,
      render: (r) => r.category || '—',
    },
    COL_AUDIT_SOURCE,
  ],
  businessRules: [COL_ID, COL_TITLE, COL_DESCRIPTION, COL_PRIORITY, COL_AUDIT_SOURCE],
  actors: [
    COL_ID,
    {
      key: 'title',
      headerKey: 'requirements.phase1ColTitle',
      headerFallback: 'Tiêu đề',
      field: 'title',
      editable: true,
      defaultPx: 220,
      minPx: 120,
      render: (r) => r.title || r.name || '—',
    },
    COL_AUDIT_SOURCE,
  ],
  businessGoals: [COL_ID, COL_TITLE, COL_DESCRIPTION, COL_PRIORITY, COL_AUDIT_SOURCE],
  processes: [
    COL_ID,
    {
      key: 'title',
      headerKey: 'requirements.phase1ColProcessName',
      headerFallback: 'Tên quy trình',
      field: 'title',
      editable: true,
      defaultPx: 220,
      minPx: 120,
      render: (r) => r.title || '—',
    },
    {
      key: 'steps',
      headerKey: 'requirements.phase1ColStep',
      headerFallback: 'Bước',
      editable: false,
      defaultPx: 100,
      minPx: 72,
      render: stepsLabel,
    },
    COL_DESCRIPTION,
    COL_AUDIT_SOURCE,
  ],
  useCases: [COL_ID, COL_TITLE, COL_DESCRIPTION, COL_ACTORS, COL_AUDIT_SOURCE],
  entities: [
    COL_ID,
    {
      key: 'name',
      headerKey: 'requirements.phase1ColEntity',
      headerFallback: 'Thực thể',
      field: 'name',
      editable: true,
      defaultPx: 160,
      minPx: 100,
      render: (r) => r.name || r.title || '—',
    },
    {
      key: 'attributes',
      headerKey: 'requirements.phase1ColAttributes',
      headerFallback: 'Thuộc tính',
      editable: false,
      defaultPx: 180,
      minPx: 100,
      render: attributesLabel,
    },
    COL_AUDIT_SOURCE,
  ],
  scope: [
    COL_ID,
    COL_TITLE,
    COL_DESCRIPTION,
    {
      key: 'inOut',
      headerKey: 'requirements.phase1ColScopeType',
      headerFallback: 'Loại phạm vi',
      editable: false,
      defaultPx: 130,
      minPx: 90,
      render: inOutLabel,
    },
    COL_AUDIT_SOURCE,
  ],
};

/** Read display/edit value for a Gate1 column from row (+ optional editedPayload). */
export function getGate1FieldValue(row, col, editedPayload) {
  const field = col?.field;
  if (!field) return '';
  const patch = editedPayload && typeof editedPayload === 'object' ? editedPayload : null;
  if (patch && Object.prototype.hasOwnProperty.call(patch, field) && patch[field] != null) {
    return String(patch[field]);
  }
  if (field === 'ac') {
    return String(row?.ac || row?.acceptanceCriteria || '');
  }
  if (field === 'title') {
    return String(row?.title || row?.name || '');
  }
  if (field === 'name') {
    return String(row?.name || row?.title || '');
  }
  return String(row?.[field] ?? '');
}

/** Seed editedPayload from current row values for all editable columns. */
export function seedGate1EditedPayload(row, columns) {
  const payload = {};
  for (const col of columns || []) {
    if (!col?.editable || !col.field) continue;
    payload[col.field] = getGate1FieldValue(row, col, null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'ac')) {
    payload.acceptanceCriteria = payload.ac;
  }
  return payload;
}

/** Merge one field into editedPayload (keeps ac ↔ acceptanceCriteria in sync). */
export function patchGate1EditedPayload(prev, field, value) {
  const next = { ...(prev && typeof prev === 'object' ? prev : {}), [field]: value };
  if (field === 'ac') next.acceptanceCriteria = value;
  if (field === 'acceptanceCriteria') next.ac = value;
  return next;
}

const FALLBACK_COLUMNS = GATE1_SECTION_COLUMNS.functionalRequirements;

export function getGate1ColumnsForSection(section) {
  return GATE1_SECTION_COLUMNS[String(section || '')] || FALLBACK_COLUMNS;
}

/** Stable row id — always pass index in the full section `rows` array. */
export function getGate1RowId(row, index = 0) {
  return String(row?.logicalId || row?.id || `row-${index}`).trim();
}

const DECISION_ACTIONS = new Set(['accept', 'edit', 'reject', 'create']);

/**
 * True when every item across all sections has accept|edit|reject|create.
 * Empty sections (no rows) are skipped. NEEDS_CONFIRMATION + accept needs note+resolution.
 * create rows still count as decided (title validated separately before submit).
 */
export function areGate1SectionDecisionsComplete(bySection, decisions = {}) {
  if (!bySection || typeof bySection !== 'object') return false;
  let total = 0;
  for (const rows of Object.values(bySection)) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const id = getGate1RowId(row, i);
      if (!id) continue;
      total += 1;
      const d = decisions[id] || {};
      const action = String(d.action || '').toLowerCase();
      if (!DECISION_ACTIONS.has(action)) return false;
      if (
        action === 'accept' &&
        String(row?.status || '').toUpperCase() === 'NEEDS_CONFIRMATION'
      ) {
        if (!String(d.note || '').trim() || !String(d.resolution || '').trim()) {
          return false;
        }
      }
    }
  }
  return total > 0;
}

/** Count items still missing a decision (across sections). */
export function countGate1PendingDecisions(bySection, decisions = {}) {
  if (!bySection || typeof bySection !== 'object') return 0;
  let pending = 0;
  for (const rows of Object.values(bySection)) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i += 1) {
      const id = getGate1RowId(rows[i], i);
      if (!id) continue;
      const action = String(decisions[id]?.action || '').toLowerCase();
      if (!DECISION_ACTIONS.has(action)) pending += 1;
    }
  }
  return pending;
}

export const GATE1_SCROLL_PAGE_SIZE = 30;

/** Fixed body height for Gate1 section table / missing panel (all tabs same). */
export const GATE1_TABLE_BODY_HEIGHT_CLASS = 'h-96';
