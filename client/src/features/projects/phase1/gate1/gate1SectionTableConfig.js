/**
 * Gate1 Review — column config per Analysis Proposal section.
 * Decision column is rendered by Gate1SectionReviewTable, not listed here.
 * headerKey uses requirements.* i18n; render(row, t) for localized cell values.
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

function statusLabel(row, t) {
  const raw = String(row?.status || '').trim();
  if (!raw) return '—';
  const code = raw.toUpperCase();
  return tr(t, `requirements.phase1ItemStatus_${code}`, raw);
}

function provenanceLabel(row, t) {
  const p = row?.provenance;
  if (!p || typeof p !== 'object') return '—';
  const typeRaw = p.type || '';
  const type = typeRaw
    ? tr(t, `requirements.phase1Origin_${String(typeRaw).toUpperCase()}`, String(typeRaw))
    : '';
  const from = Array.isArray(p.derivedFrom) ? p.derivedFrom.join(', ') : '';
  return from ? `${type}: ${from}` : type || '—';
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
  render: (r) => r.logicalId || r.id || '—',
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

const COL_STATUS = {
  key: 'status',
  headerKey: 'requirements.phase1ColItemStatus',
  headerFallback: 'Trạng thái',
  editable: false,
  defaultPx: 110,
  minPx: 80,
  render: statusLabel,
};

/** @type {Record<string, Gate1Column[]>} */
export const GATE1_SECTION_COLUMNS = {
  functionalRequirements: [
    COL_ID,
    COL_TITLE,
    {
      key: 'ac',
      headerKey: 'requirements.phase1ColAc',
      headerFallback: 'Tiêu chí chấp nhận',
      field: 'ac',
      editable: true,
      defaultPx: 260,
      minPx: 140,
      render: (r) => clip(r.ac || r.acceptanceCriteria, 100) || '—',
    },
    COL_STATUS,
  ],
  nonFunctionalRequirements: [
    COL_ID,
    COL_TITLE,
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
    COL_STATUS,
  ],
  businessRules: [COL_ID, COL_TITLE, COL_STATUS],
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
    COL_STATUS,
  ],
  businessGoals: [COL_ID, COL_TITLE, COL_STATUS],
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
    COL_STATUS,
  ],
  useCases: [
    COL_ID,
    COL_TITLE,
    {
      key: 'provenance',
      headerKey: 'requirements.phase1ColProvenance',
      headerFallback: 'Xuất xứ',
      editable: false,
      defaultPx: 160,
      minPx: 100,
      render: provenanceLabel,
    },
    COL_STATUS,
  ],
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
    {
      key: 'provenance',
      headerKey: 'requirements.phase1ColProvenance',
      headerFallback: 'Xuất xứ',
      editable: false,
      defaultPx: 160,
      minPx: 100,
      render: provenanceLabel,
    },
    COL_STATUS,
  ],
  scope: [
    COL_ID,
    COL_TITLE,
    {
      key: 'inOut',
      headerKey: 'requirements.phase1ColScopeType',
      headerFallback: 'Loại phạm vi',
      editable: false,
      defaultPx: 130,
      minPx: 90,
      render: inOutLabel,
    },
    COL_STATUS,
  ],
  interfaces: [
    COL_ID,
    {
      key: 'title',
      headerKey: 'requirements.phase1ColInterfaceName',
      headerFallback: 'Tên giao diện',
      field: 'title',
      editable: true,
      defaultPx: 220,
      minPx: 120,
      render: (r) => r.title || '—',
    },
    COL_STATUS,
  ],
  glossary: [
    COL_ID,
    {
      key: 'term',
      headerKey: 'requirements.phase1ColTerm',
      headerFallback: 'Thuật ngữ',
      field: 'title',
      editable: true,
      defaultPx: 180,
      minPx: 100,
      render: (r) => r.title || r.name || '—',
    },
    COL_STATUS,
  ],
  assumptions: [
    COL_ID,
    COL_TITLE,
    {
      key: 'classification',
      headerKey: 'requirements.phase1ColClassification',
      headerFallback: 'Phân loại',
      field: 'classification',
      editable: true,
      defaultPx: 140,
      minPx: 90,
      render: (r) => r.classification || '—',
    },
    COL_STATUS,
  ],
  traceability: [
    COL_ID,
    {
      key: 'analysisId',
      headerKey: 'requirements.phase1ColAnalysisId',
      headerFallback: 'Mã phân tích',
      field: 'analysisId',
      editable: true,
      defaultPx: 130,
      minPx: 90,
      render: (r) => r.analysisId || '—',
    },
    {
      key: 'source',
      headerKey: 'requirements.phase1ColTraceSource',
      headerFallback: 'Nguồn',
      editable: false,
      defaultPx: 180,
      minPx: 100,
      render: (r) => {
        const up = r.upstreamId ? `← ${r.upstreamId}` : '';
        const src = sourceClip(r);
        return clip([up, src].filter((x) => x && x !== '—').join(' · ') || '—', 100);
      },
    },
    {
      key: 'linkSection',
      headerKey: 'requirements.phase1ColLinkSection',
      headerFallback: 'Mục',
      field: 'linkSection',
      editable: true,
      defaultPx: 120,
      minPx: 80,
      render: (r) => r.linkSection || r.itemSection || '—',
    },
    COL_STATUS,
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

const DECISION_ACTIONS = new Set(['accept', 'edit', 'reject']);

/**
 * True when every item across all sections has accept|edit|reject.
 * Empty sections (no rows) are skipped. NEEDS_CONFIRMATION + accept needs note+resolution.
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
