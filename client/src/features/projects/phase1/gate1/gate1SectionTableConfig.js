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

function joinIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ');
  if (value == null || value === '') return '—';
  return String(value);
}

function statusLabel(row, t) {
  const raw = String(row?.status || '').trim();
  if (!raw) return '—';
  const code = raw.toUpperCase();
  return tr(t, `requirements.phase1ItemStatus_${code}`, raw);
}

function originLabel(row, t) {
  const raw = row?.origin?.type || row?.origin;
  if (!raw) return '—';
  const code = String(raw).toUpperCase();
  return tr(t, `requirements.phase1Origin_${code}`, String(raw));
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

function directionLabel(directionRaw, t) {
  const norm = String(directionRaw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (!norm) return '';
  if (norm === 'in' || norm === 'inbound') {
    return tr(t, 'requirements.phase1DirectionIn', 'Vào');
  }
  if (norm === 'out' || norm === 'outbound') {
    return tr(t, 'requirements.phase1DirectionOut', 'Ra');
  }
  if (norm === 'inout' || norm === 'in/out' || norm === 'both' || norm === 'bidirectional') {
    return tr(t, 'requirements.phase1DirectionInout', 'Hai chiều');
  }
  return String(directionRaw);
}

function protocolLabel(row, t) {
  const protocol = row?.protocol ? String(row.protocol) : '';
  const direction = directionLabel(row?.direction, t);
  return [protocol, direction].filter(Boolean).join(' / ') || '—';
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

const COL_ID = {
  key: 'id',
  headerKey: 'requirements.phase1ColId',
  headerFallback: 'ID',
  render: (r) => r.logicalId || r.id || '—',
};

const COL_TITLE = {
  key: 'title',
  headerKey: 'requirements.phase1ColTitle',
  headerFallback: 'Tiêu đề',
  render: (r) => r.title || '—',
};

const COL_DESCRIPTION = {
  key: 'description',
  headerKey: 'requirements.phase1ColDescription',
  headerFallback: 'Mô tả',
  render: (r) => clip(r.description, 160),
};

const COL_STATUS = {
  key: 'status',
  headerKey: 'requirements.phase1ColItemStatus',
  headerFallback: 'Trạng thái',
  render: statusLabel,
};

/** @typedef {{ key: string, headerKey: string, headerFallback: string, render: (row: object, t?: function) => string }} Gate1Column */

/** @type {Record<string, Gate1Column[]>} */
export const GATE1_SECTION_COLUMNS = {
  functionalRequirements: [
    COL_ID,
    COL_TITLE,
    COL_DESCRIPTION,
    {
      key: 'ac',
      headerKey: 'requirements.phase1ColAc',
      headerFallback: 'AC',
      render: (r) => clip(r.ac, 100) || '—',
    },
    COL_STATUS,
    {
      key: 'origin',
      headerKey: 'requirements.phase1ColOrigin',
      headerFallback: 'Nguồn gốc',
      render: originLabel,
    },
  ],
  nonFunctionalRequirements: [
    COL_ID,
    COL_TITLE,
    {
      key: 'category',
      headerKey: 'requirements.phase1ColCategory',
      headerFallback: 'Danh mục',
      render: (r) => r.category || '—',
    },
    COL_DESCRIPTION,
    COL_STATUS,
  ],
  businessRules: [COL_ID, COL_TITLE, COL_DESCRIPTION, COL_STATUS],
  actors: [
    COL_ID,
    {
      key: 'title',
      headerKey: 'requirements.phase1ColTitle',
      headerFallback: 'Tiêu đề',
      render: (r) => r.title || r.name || '—',
    },
    COL_DESCRIPTION,
    COL_STATUS,
  ],
  businessGoals: [COL_ID, COL_TITLE, COL_DESCRIPTION, COL_STATUS],
  processes: [
    COL_ID,
    {
      key: 'title',
      headerKey: 'requirements.phase1ColProcessName',
      headerFallback: 'Tên quy trình',
      render: (r) => r.title || '—',
    },
    {
      key: 'steps',
      headerKey: 'requirements.phase1ColStep',
      headerFallback: 'Bước',
      render: stepsLabel,
    },
    {
      key: 'relatedFr',
      headerKey: 'requirements.phase1ColRelatedFr',
      headerFallback: 'FR liên quan',
      render: (r) => joinIds(r.relatedFrIds),
    },
    COL_STATUS,
  ],
  useCases: [
    COL_ID,
    COL_TITLE,
    {
      key: 'relatedFr',
      headerKey: 'requirements.phase1ColRelatedFr',
      headerFallback: 'FR liên quan',
      render: (r) => joinIds(r.relatedFrIds),
    },
    {
      key: 'provenance',
      headerKey: 'requirements.phase1ColProvenance',
      headerFallback: 'Xuất xứ',
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
      render: (r) => r.name || r.title || '—',
    },
    {
      key: 'attributes',
      headerKey: 'requirements.phase1ColAttributes',
      headerFallback: 'Thuộc tính',
      render: attributesLabel,
    },
    {
      key: 'provenance',
      headerKey: 'requirements.phase1ColProvenance',
      headerFallback: 'Xuất xứ',
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
      render: inOutLabel,
    },
    COL_DESCRIPTION,
    COL_STATUS,
  ],
  interfaces: [
    COL_ID,
    {
      key: 'title',
      headerKey: 'requirements.phase1ColInterfaceName',
      headerFallback: 'Tên giao diện',
      render: (r) => r.title || '—',
    },
    {
      key: 'protocol',
      headerKey: 'requirements.phase1ColProtocol',
      headerFallback: 'Giao thức',
      render: protocolLabel,
    },
    COL_DESCRIPTION,
    COL_STATUS,
  ],
  glossary: [
    COL_ID,
    {
      key: 'term',
      headerKey: 'requirements.phase1ColTerm',
      headerFallback: 'Thuật ngữ',
      render: (r) => r.title || r.name || '—',
    },
    {
      key: 'definition',
      headerKey: 'requirements.phase1ColDefinition',
      headerFallback: 'Định nghĩa',
      render: (r) => clip(r.description, 200) || '—',
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
      render: (r) => r.classification || '—',
    },
    COL_DESCRIPTION,
    COL_STATUS,
  ],
  traceability: [
    COL_ID,
    {
      key: 'analysisId',
      headerKey: 'requirements.phase1ColAnalysisId',
      headerFallback: 'Mã phân tích',
      render: (r) => r.analysisId || '—',
    },
    {
      key: 'source',
      headerKey: 'requirements.phase1ColTraceSource',
      headerFallback: 'Nguồn',
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
      render: (r) => r.linkSection || r.itemSection || '—',
    },
    COL_STATUS,
  ],
};

const FALLBACK_COLUMNS = GATE1_SECTION_COLUMNS.functionalRequirements;

export function getGate1ColumnsForSection(section) {
  return GATE1_SECTION_COLUMNS[String(section || '')] || FALLBACK_COLUMNS;
}

export const GATE1_SCROLL_PAGE_SIZE = 30;
