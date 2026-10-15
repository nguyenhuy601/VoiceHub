/**
 * Gate1 HITL — add proposal row helpers (Actor-first wave).
 * UI enable via GATE1_ADDABLE_SECTIONS; ID prefixes ready for other sections.
 */

/** Gate1 sections that allow BA add-row (all review tabs). */
export const GATE1_ADDABLE_SECTIONS = Object.freeze([
  'functionalRequirements',
  'nonFunctionalRequirements',
  'businessRules',
  'businessGoals',
  'processes',
  'useCases',
  'entities',
  'actors',
  'scope',
]);

/** logicalId prefix per Analysis Proposal section. */
export const GATE1_SECTION_ID_PREFIX = Object.freeze({
  functionalRequirements: 'FR',
  nonFunctionalRequirements: 'NFR',
  businessRules: 'BR',
  businessGoals: 'BG',
  processes: 'PROC',
  useCases: 'UC',
  entities: 'ENT',
  actors: 'ACT',
  scope: 'SCOPE',
});

export function isGate1SectionAddable(section) {
  return GATE1_ADDABLE_SECTIONS.includes(String(section || '').trim());
}

/**
 * Next unique logicalId for a section: `{PREFIX}-{max+1}`.
 * Scans PREFIX-n among rows; ensures uniqueness vs all existing ids (incl. slug ids).
 * @param {string} section
 * @param {object[]} rows
 * @returns {string}
 */
export function nextGate1LogicalId(section, rows = []) {
  const prefix = GATE1_SECTION_ID_PREFIX[String(section || '').trim()] || 'ITEM';
  const existing = new Set();
  let maxN = 0;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');

  for (const row of rows || []) {
    const id = String(row?.logicalId || row?.id || '').trim();
    if (!id) continue;
    existing.add(id);
    const m = id.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }

  let n = maxN + 1;
  let candidate = `${prefix}-${n}`;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `${prefix}-${n}`;
  }
  return candidate;
}

/**
 * Build a local-only proposal row for BA add (before Gate1 submit create).
 * @param {{ section: string, logicalId: string }} opts
 */
export function buildGate1AddedRow({ section, logicalId }) {
  const id = String(logicalId || '').trim();
  const sec = String(section || '').trim();
  return {
    logicalId: id,
    id,
    section: sec,
    title: '',
    name: '',
    status: 'PROPOSED',
    provenance: { type: 'BA_ADDED', producer: 'ba_manual' },
    origin: { type: 'BA_ADDED' },
    addedLocally: true,
  };
}

/**
 * Merge server section rows with local BA-added drafts (same section only).
 * @param {object[]} serverRows
 * @param {object[]} addedRows — may include other sections
 * @param {string} section
 */
export function mergeGate1SectionRows(serverRows, addedRows, section) {
  const sec = String(section || '').trim();
  const base = Array.isArray(serverRows) ? [...serverRows] : [];
  const serverIds = new Set(
    base.map((r, i) => String(r?.logicalId || r?.id || `row-${i}`).trim()).filter(Boolean)
  );
  for (const row of addedRows || []) {
    if (String(row?.section || '').trim() !== sec) continue;
    const id = String(row?.logicalId || row?.id || '').trim();
    if (!id || serverIds.has(id)) continue;
    base.push(row);
    serverIds.add(id);
  }
  return base;
}

/**
 * Title for create decision must be non-empty before Gate1 confirm.
 * @param {object} decision
 * @returns {boolean}
 */
export function isGate1CreateDecisionReady(decision) {
  if (String(decision?.action || '').toLowerCase() !== 'create') return true;
  const payload = decision?.editedPayload && typeof decision.editedPayload === 'object'
    ? decision.editedPayload
    : {};
  const title = String(payload.title || payload.name || '').trim();
  return Boolean(title);
}

/**
 * All create decisions across bySection have non-empty titles.
 * @param {Record<string, object[]>} bySection
 * @param {Record<string, object>} decisions
 * @param {(row: object, index: number) => string} getRowId
 */
export function areGate1CreateRowsReady(bySection, decisions = {}, getRowId) {
  if (!bySection || typeof bySection !== 'object') return true;
  for (const rows of Object.values(bySection)) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i += 1) {
      const id = typeof getRowId === 'function' ? getRowId(rows[i], i) : String(rows[i]?.logicalId || '');
      if (!id) continue;
      if (!isGate1CreateDecisionReady(decisions[id])) return false;
    }
  }
  return true;
}
