/**
 * Gate1 Review — column config per Analysis Proposal section.
 * Decision column is rendered by Gate1SectionReviewTable, not listed here.
 */

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

function originLabel(row) {
  const t = row?.origin?.type || row?.origin;
  return t ? String(t) : '—';
}

function provenanceLabel(row) {
  const p = row?.provenance;
  if (!p || typeof p !== 'object') return '—';
  const type = p.type || '';
  const from = Array.isArray(p.derivedFrom) ? p.derivedFrom.join(', ') : '';
  return from ? `${type}: ${from}` : type || '—';
}

function stepsLabel(row) {
  const steps = row?.steps;
  if (!Array.isArray(steps) || !steps.length) return '—';
  return `${steps.length} bước`;
}

function attributesLabel(row) {
  const attrs = row?.attributes;
  if (!Array.isArray(attrs) || !attrs.length) return '—';
  return clip(attrs.map((a) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', '));
}

function inOutLabel(row) {
  if (row?.inScope === false) return 'Out';
  if (row?.inScope === true) return 'In';
  const t = String(row?.scopeType || '').toLowerCase();
  if (t === 'out') return 'Out';
  if (t === 'in') return 'In';
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

/** @typedef {{ key: string, headerKey: string, headerFallback: string, render: (row: object) => string }} Gate1Column */

/** @type {Record<string, Gate1Column[]>} */
export const GATE1_SECTION_COLUMNS = {
  functionalRequirements: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
    { key: 'ac', headerKey: 'requirements.phase1ColAc', headerFallback: 'AC', render: (r) => clip(r.ac, 100) || '—' },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
    { key: 'origin', headerKey: 'requirements.phase1ColOrigin', headerFallback: 'Origin', render: originLabel },
  ],
  nonFunctionalRequirements: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'category',
      headerKey: 'requirements.phase1ColCategory',
      headerFallback: 'Danh mục',
      render: (r) => r.category || '—',
    },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  businessRules: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  actors: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || r.name || '—' },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  businessGoals: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  processes: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColProcessName', headerFallback: 'Tên quy trình', render: (r) => r.title || '—' },
    { key: 'steps', headerKey: 'requirements.phase1ColStep', headerFallback: 'Bước', render: stepsLabel },
    {
      key: 'relatedFr',
      headerKey: 'requirements.phase1ColRelatedFr',
      headerFallback: 'FR liên quan',
      render: (r) => joinIds(r.relatedFrIds),
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  useCases: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'relatedFr',
      headerKey: 'requirements.phase1ColRelatedFr',
      headerFallback: 'FR liên quan',
      render: (r) => joinIds(r.relatedFrIds),
    },
    {
      key: 'provenance',
      headerKey: 'requirements.phase1ColProvenance',
      headerFallback: 'Provenance',
      render: provenanceLabel,
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  entities: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    {
      key: 'name',
      headerKey: 'requirements.phase1ColTitle',
      headerFallback: 'Tên',
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
      headerFallback: 'Provenance',
      render: provenanceLabel,
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  scope: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'inOut',
      headerKey: 'requirements.phase1ColScopeType',
      headerFallback: 'In/Out',
      render: inOutLabel,
    },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
  ],
  interfaces: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'protocol',
      headerKey: 'requirements.phase1ColProtocol',
      headerFallback: 'Protocol',
      render: (r) => [r.protocol, r.direction].filter(Boolean).join(' / ') || '—',
    },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
  ],
  glossary: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
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
  ],
  assumptions: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    { key: 'title', headerKey: 'requirements.phase1ColTitle', headerFallback: 'Tiêu đề', render: (r) => r.title || '—' },
    {
      key: 'classification',
      headerKey: 'requirements.phase1ColClassification',
      headerFallback: 'Phân loại',
      render: (r) => r.classification || '—',
    },
    {
      key: 'description',
      headerKey: 'requirements.phase1ColDescription',
      headerFallback: 'Mô tả',
      render: (r) => clip(r.description, 160),
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
  traceability: [
    { key: 'id', headerKey: 'requirements.phase1ColFr', headerFallback: 'ID', render: (r) => r.logicalId || r.id || '—' },
    {
      key: 'analysisId',
      headerKey: 'requirements.phase1ColAnalysisId',
      headerFallback: 'Analysis ID',
      render: (r) => r.analysisId || '—',
    },
    {
      key: 'source',
      headerKey: 'requirements.phase1ColSource',
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
      headerFallback: 'Section',
      render: (r) => r.linkSection || r.itemSection || '—',
    },
    { key: 'status', headerKey: 'requirements.phase1ColItemStatus', headerFallback: 'Status', render: (r) => r.status || '—' },
  ],
};

const FALLBACK_COLUMNS = GATE1_SECTION_COLUMNS.functionalRequirements;

export function getGate1ColumnsForSection(section) {
  return GATE1_SECTION_COLUMNS[String(section || '')] || FALLBACK_COLUMNS;
}

export const GATE1_SCROLL_PAGE_SIZE = 30;
