/**
 * Build Gate1 Analysis Review rows from Analysis Proposal (persist: srsProposal).
 * FR tab = one table with Epic id / Tiêu đề Epic (derived backlog; no Epic/Story subpanel).
 */

const SECTION_ORDER = [
  'functionalRequirements',
  'nonFunctionalRequirements',
  'businessRules',
  'businessGoals',
  'processes',
  'useCases',
  'entities',
  'actors',
  'scope',
];

/** Legacy foundation — domain/context not shown; actors are Gate1-sensitive (RULE-03). */
const LEGACY_EXCLUDED = new Set(['domain', 'context']);

/** backlogStructure is derived SoT catalog — not a Gate1 decision surface. */
const REVIEW_EXCLUDED = new Set(['backlogStructure']);

const SECTION_LABELS = {
  functionalRequirements: 'FR',
  backlogStructure: 'Epic/Story',
  nonFunctionalRequirements: 'NFR',
  businessRules: 'BR',
  businessGoals: 'BG',
  processes: 'BPM',
  useCases: 'UC',
  entities: 'Data',
  actors: 'Actor',
  scope: 'Scope',
};



function clipReviewText(value, max = 240) {
  const raw = Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === 'string'
            ? item
            : item?.text || item?.criterion || item?.description || ''
        )
        .filter(Boolean)
        .join('; ')
    : value;
  const text = String(raw || '').trim();
  const limit = Number.isFinite(max) && max > 0 ? max : 240;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}



function packFieldById(pack, pick) {
  const map = new Map();
  const frs = Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements : [];
  for (const row of frs) {
    const id = String(row?.externalId || row?.id || row?.frId || '').trim();
    if (!id || map.has(id)) continue;
    const value = pick(row);
    if (value) map.set(id, value);
  }
  return map;
}

function packFrAcById(pack) {
  return packFieldById(pack, (row) => {
    const ac = clipReviewText(row?.ac || row?.acceptanceCriteria);
    return ac && ac !== '—' ? ac : '';
  });
}

function packFrPriorityById(pack) {
  return packFieldById(pack, (row) => String(row?.priority || '').trim());
}

function firstPackValue(map, ids) {
  for (const id of ids) {
    const value = map.get(id);
    if (value) return value;
  }
  return '';
}

/** Fill Gate1 FR.ac / priority from pack intake when the proposal omitted them. */
function enrichFrAcFromPack(bySection, pack) {
  const rows = bySection?.functionalRequirements;
  if (!Array.isArray(rows) || !rows.length || !pack) return;
  const acById = packFrAcById(pack);
  const priorityById = packFrPriorityById(pack);
  if (!acById.size && !priorityById.size) return;
  bySection.functionalRequirements = rows.map((row) => {
    const ids = [row?.logicalId, row?.id, ...(row?.sourceCrIds || [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    let next = row;
    if (!(row?.ac && String(row.ac).trim() && row.ac !== '—')) {
      const fromPack = firstPackValue(acById, ids);
      if (fromPack) next = { ...next, ac: fromPack };
    }
    if (!String(row?.priority || '').trim()) {
      const fromPack = firstPackValue(priorityById, ids);
      if (fromPack) next = { ...next, priority: fromPack };
    }
    return next;
  });
}

function actorsLabel(row) {
  const fromList = Array.isArray(row?.actors)
    ? row.actors
        .map((actor) =>
          typeof actor === 'string' ? actor : actor?.name || actor?.id || actor?.title || ''
        )
        .filter(Boolean)
    : [];
  if (fromList.length) return clipReviewText(fromList.join(', '));
  return clipReviewText(row?.actor || row?.primaryActor || '');
}

/** Drop temporary fr-from-cr chunk prefix from epic titles (`c0-EPIC-IOT` → `EPIC-IOT`). */
function stripChunkIdPrefix(raw) {
  return String(raw || '').replace(/^c\d+-/i, '');
}

function cleanEpicTitle(name, id) {
  const raw = String(name || '').trim();
  const cleanId = stripChunkIdPrefix(id) || id;
  if (!raw || raw === id || raw === cleanId) return cleanId;
  if (/^c\d+-/i.test(raw)) return stripChunkIdPrefix(raw) || raw;
  return raw;
}

function epicCatalogById(backlogStructure) {
  const map = new Map();
  const epics = Array.isArray(backlogStructure?.epics) ? backlogStructure.epics : [];
  for (const epic of epics) {
    const id = String(epic?.id || '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, {
      id,
      name: cleanEpicTitle(epic?.name || epic?.title, id),
    });
  }
  return map;
}

function mapItem(row, section, index, epicById = null) {
  const logicalId = String(
    row?.logicalId || row?.id || row?.externalId || row?.frId || `${section}-${index + 1}`
  ).trim();
  const parentEpicId =
    row?.parentEpicId === undefined || row?.parentEpicId === null || row?.parentEpicId === ''
      ? row?.parentEpicId === null
        ? null
        : ''
      : String(row.parentEpicId).trim();
  const epic =
    parentEpicId && epicById instanceof Map ? epicById.get(parentEpicId) : null;
  return {
    id: logicalId,
    logicalId,
    section,
    sectionLabel: SECTION_LABELS[section] || section,
    title: String(row?.title || row?.name || '').trim(),
    name: row?.name != null ? String(row.name) : undefined,
    description: clipReviewText(
      row?.description || row?.text || row?.definition || row?.statement || row?.rationale || '',
      600
    ),
    ac: clipReviewText(row?.ac || row?.acceptanceCriteria),
    priority: String(row?.priority || '').trim(),
    actorsLabel: actorsLabel(row),
    parentEpicId: parentEpicId || null,
    epicTitle: cleanEpicTitle(
      epic?.name || (row?.epicTitle != null ? String(row.epicTitle) : '') || '',
      parentEpicId || ''
    ),
    status: String(row?.status || 'EXTRACTED'),
    origin: row?.origin || null,
    provenance: row?.provenance || null,
    category: row?.category || null,
    relatedFrIds: Array.isArray(row?.relatedFrIds) ? row.relatedFrIds.map(String) : [],
    steps: Array.isArray(row?.steps) ? row.steps : [],
    attributes: Array.isArray(row?.attributes) ? row.attributes : [],
    inScope: row?.inScope,
    scopeType: row?.scopeType || null,
    protocol: row?.protocol || null,
    direction: row?.direction || null,
    classification: row?.classification || null,
    analysisId: row?.analysisId || null,
    upstreamId: row?.upstreamId || null,
    linkSection: null,
    itemSection: row?.section || null,
    sourceRefs: Array.isArray(row?.sourceRefs) ? row.sourceRefs : [],
    sourceCrIds: Array.isArray(row?.sourceCrIds) ? row.sourceCrIds.map(String) : [],
    sourceCrLabel: (Array.isArray(row?.sourceCrIds) ? row.sourceCrIds : [])
      .map(String)
      .filter(Boolean)
      .join(', '),
  };
}



/**
 * @param {{ proposal?: object, pack?: object, section?: string|null }} opts
 * @returns {{
 *   items: object[],
 *   sections: object[],
 *   bySection: Record<string, object[]>,
 *   sectionReviews: object[],
 *   softGaps: object[],
 * }}
 */
export function buildGate1ProposalItems(opts = {}) {
  const proposal = opts.proposal || null;
  const pack = opts.pack || null;
  const filterSection = opts.section || null;



  const bySection = {};
  const generated =
    proposal?.generated && typeof proposal.generated === 'object' ? proposal.generated : null;



  const reviews = Array.isArray(proposal?.completeness?.sectionReviews)
    ? proposal.completeness.sectionReviews.filter((r) => !LEGACY_EXCLUDED.has(r?.section))
    : [];
  const softGaps = Array.isArray(proposal?.completeness?.softGaps)
    ? proposal.completeness.softGaps
    : [];
  const reviewBySection = Object.fromEntries(
    reviews.filter((r) => r?.section).map((r) => [r.section, r])
  );

  const epicById = epicCatalogById(generated?.backlogStructure);

  if (generated) {
    for (const key of SECTION_ORDER) {
      if (LEGACY_EXCLUDED.has(key) || REVIEW_EXCLUDED.has(key)) continue;
      const items = Array.isArray(generated[key]?.items) ? generated[key].items : [];
      if (!items.length) continue;
      bySection[key] = items.map((row, i) =>
        mapItem(row, key, i, key === 'functionalRequirements' ? epicById : null)
      );
    }
    enrichFrAcFromPack(bySection, pack);
  }

  // FR may be empty while other sections exist (empty fragment wiped FR). Always backfill FR.
  if (!(bySection.functionalRequirements || []).length) {
    const frs = Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements : [];
    const gateRows = Array.isArray(pack?.liveRun?.gatePreview?.rows)
      ? pack.liveRun.gatePreview.rows
      : [];
    const source = frs.length ? frs : gateRows;
    if (source.length) {
      bySection.functionalRequirements = source.map((row, i) =>
        mapItem(row, 'functionalRequirements', i, epicById)
      );
      enrichFrAcFromPack(bySection, pack);
    }
  }



  const gapBySection = Object.fromEntries(
    softGaps.filter((g) => g?.section).map((g) => [g.section, g])
  );



  // Active Analysis tabs — empty → missing for Gate1 UI
  const sections = SECTION_ORDER.map((key) => {
    const rows = bySection[key] || [];
    const count = rows.length;
    const review = reviewBySection[key];
    const gap = gapBySection[key];
    const status = count > 0 ? review?.status || 'REVIEW_REQUIRED' : review?.status || 'NO_DATA';
    const coverageReason =
      review?.coverage?.reason || gap?.reason || (count === 0 ? 'NO_DATA' : null);
    return {
      key,
      label: SECTION_LABELS[key] || key,
      count,
      status,
      coverageReason,
      reviewable: count > 0 && (review ? Boolean(review.reviewable) : true),
      missing: count === 0,
    };
  });



  let items = [];
  for (const key of SECTION_ORDER) {
    if (filterSection && key !== filterSection) continue;
    const rows = bySection[key] || [];
    items = items.concat(rows);
  }



  return { items, sections, bySection, sectionReviews: reviews, softGaps };
}



export { SECTION_ORDER, SECTION_LABELS, LEGACY_EXCLUDED, REVIEW_EXCLUDED };


