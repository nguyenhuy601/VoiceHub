/**

 * Build Gate1 Analysis Review rows from Analysis Proposal (persist: srsProposal).

 * Always emits 12 Analysis section tabs; empty sections → missing metadata for UI.

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

  'interfaces',

  'glossary',

  'assumptions',

  'traceability',

];



/** Legacy foundation — domain/context not shown; actors are Gate1-sensitive (RULE-03). */

const LEGACY_EXCLUDED = new Set(['domain', 'context']);



const SECTION_LABELS = {

  functionalRequirements: 'FR',

  nonFunctionalRequirements: 'NFR',

  businessRules: 'BR',

  businessGoals: 'BG',

  processes: 'BPM',

  useCases: 'UC',

  entities: 'Data',

  actors: 'Actor',

  scope: 'Scope',

  interfaces: 'Interface',

  glossary: 'Glossary',

  assumptions: 'Assumption',

  traceability: 'Traceability',

};



function clipReviewText(value) {

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

  if (text.length <= 240) return text;

  return `${text.slice(0, 240)}…`;

}



function mapItem(row, section, index) {

  const logicalId = String(

    row?.logicalId || row?.id || row?.externalId || row?.frId || `${section}-${index + 1}`

  ).trim();

  return {

    id: logicalId,

    logicalId,

    section,

    sectionLabel: SECTION_LABELS[section] || section,

    title: String(row?.title || row?.name || '').trim(),

    name: row?.name != null ? String(row.name) : undefined,

    description: clipReviewText(row?.description || row?.text || row?.definition || ''),

    ac: clipReviewText(row?.ac || row?.acceptanceCriteria),

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

    linkSection: row?.section && section === 'traceability' ? row.section : null,

    itemSection: row?.section || null,

    sourceRefs: Array.isArray(row?.sourceRefs) ? row.sourceRefs : [],

  };

}



/**

 * @param {{ proposal?: object, g4?: object, pack?: object, section?: string|null }} opts

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

  const g4 = opts.g4 || null;

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

  const reviewableSet = new Set(reviews.filter((r) => r.reviewable).map((r) => r.section));

  const hasReviewMeta = reviews.length > 0;



  if (generated) {

    for (const key of SECTION_ORDER) {

      if (LEGACY_EXCLUDED.has(key)) continue;

      const items = Array.isArray(generated[key]?.items) ? generated[key].items : [];

      if (!items.length) continue;

      if (hasReviewMeta && !reviewableSet.has(key)) continue;

      bySection[key] = items.map((row, i) => mapItem(row, key, i));

    }

  }



  if (!Object.keys(bySection).length) {

    const g4Reqs = Array.isArray(g4?.requirements) ? g4.requirements : [];

    const frs = Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements : [];

    const gateRows = Array.isArray(pack?.liveRun?.gatePreview?.rows)

      ? pack.liveRun.gatePreview.rows

      : [];

    const source = g4Reqs.length ? g4Reqs : frs.length ? frs : gateRows;

    if (source.length) {

      bySection.functionalRequirements = source.map((row, i) =>

        mapItem(row, 'functionalRequirements', i)

      );

    }

  }



  const gapBySection = Object.fromEntries(

    softGaps.filter((g) => g?.section).map((g) => [g.section, g])

  );



  // Always 12 Analysis tabs — empty → missing for Gate1 UI

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



export { SECTION_ORDER, SECTION_LABELS, LEGACY_EXCLUDED };


