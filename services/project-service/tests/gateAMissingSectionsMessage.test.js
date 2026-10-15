/**
 * Gate A missing_sections — message lists concrete section keys;
 * source-absence (empty sheet) is not an AI content gap.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatMissingSectionsMessage,
  applyAdvisorySignalsToGateA,
  collectMissingSectionSignals,
  filterContentMissingSections,
  sanitizeGateAForSourceAbsence,
} = require('../src/utils/tools/gateAAdvisorySignals');
const { runGateA } = require('../src/utils/tools/validation/gateA');
const { resolveGateAFromPack } = require('../src/utils/tools/assertRequirementGate1Approve');

describe('formatMissingSectionsMessage', () => {
  it('returns empty when no gaps', () => {
    assert.equal(formatMissingSectionsMessage([]), '');
    assert.equal(formatMissingSectionsMessage(null), '');
  });

  it('lists section keys and reasons', () => {
    const msg = formatMissingSectionsMessage([
      { section: 'businessGoals', reason: 'NO_DATA' },
      { section: 'useCases', reason: 'EMPTY' },
    ]);
    assert.match(msg, /businessGoals \(NO_DATA\)/);
    assert.match(msg, /useCases \(EMPTY\)/);
    assert.match(msg, /Thiếu dữ liệu cột\/section/);
  });
});

describe('applyAdvisorySignalsToGateA missing_sections', () => {
  it('attaches message + detail with section names', () => {
    const gaps = [
      { section: 'businessRules', reason: 'NO_DATA' },
      { section: 'entities', reason: 'EMPTY' },
    ];
    const gateA = applyAdvisorySignalsToGateA({ checks: [] }, { missingSections: gaps });
    const miss = gateA.checks.find((c) => c.id === 'missing_sections');
    assert.equal(miss.passed, false);
    assert.equal(miss.value, 2);
    assert.deepEqual(miss.detail, gaps);
    assert.match(miss.message, /businessRules/);
    assert.match(miss.message, /entities/);
  });
});

describe('runGateA missing_sections message', () => {
  it('includes message on check when sections missing', () => {
    const result = runGateA({
      missingSections: [{ section: 'scope', reason: 'NO_DATA' }],
      duplicateCount: 0,
    });
    const miss = result.data.checks.find((c) => c.id === 'missing_sections');
    assert.equal(miss.passed, false);
    assert.match(miss.message, /scope \(NO_DATA\)/);
  });
});

describe('collectMissingSectionSignals source-absence', () => {
  const FULL_KEYS = [
    'businessGoals',
    'businessRules',
    'processes',
    'functionalRequirements',
    'useCases',
    'nonFunctionalRequirements',
    'scope',
    'entities',
  ];

  function fullGenerated(overrides = {}) {
    const generated = {};
    for (const key of FULL_KEYS) {
      generated[key] = { items: [{ logicalId: `${key}-1`, title: key }] };
    }
    return { ...generated, ...overrides };
  }

  it('does not warn for SOURCE_SHEET_EMPTY / SOURCE_UNAVAILABLE when AI filled other sections', () => {
    const proposal = {
      generated: fullGenerated({
        entities: {
          items: [],
          meta: { coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' } },
        },
        scope: {
          items: [],
          meta: { coverage: { status: 'NO_DATA', reason: 'SOURCE_UNAVAILABLE' } },
        },
      }),
      completeness: {
        sectionReviews: [
          {
            section: 'entities',
            status: 'NO_DATA',
            coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
          },
          {
            section: 'scope',
            status: 'NO_DATA',
            coverage: { status: 'NO_DATA', reason: 'SOURCE_UNAVAILABLE' },
          },
        ],
      },
    };
    const miss = collectMissingSectionSignals({
      aiAnalysis: { analyses: { srsProposal: proposal } },
    });
    assert.equal(miss.count, 0);
    assert.deepEqual(miss.sections, []);
  });

  it('still warns when section empty for non-source reasons (DERIVE_EMPTY)', () => {
    const proposal = {
      generated: fullGenerated({
        businessGoals: {
          items: [],
          meta: { coverage: { status: 'NO_DATA', reason: 'DERIVE_EMPTY' } },
        },
      }),
      completeness: {
        sectionReviews: [
          {
            section: 'businessGoals',
            status: 'NO_DATA',
            coverage: { status: 'NO_DATA', reason: 'DERIVE_EMPTY' },
          },
        ],
      },
    };
    const miss = collectMissingSectionSignals({
      aiAnalysis: { analyses: { srsProposal: proposal } },
    });
    assert.equal(miss.count, 1);
    assert.equal(miss.sections[0].section, 'businessGoals');
    assert.equal(miss.sections[0].reason, 'DERIVE_EMPTY');
  });

  it('does not warn when section already has proposal items despite coverage NO_DATA', () => {
    const proposal = {
      generated: fullGenerated({
        entities: {
          items: [{ logicalId: 'ENT-1', title: 'Employee' }],
          meta: { coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' } },
        },
      }),
      completeness: {
        sectionReviews: [
          {
            section: 'entities',
            status: 'REVIEW_REQUIRED',
            coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
          },
        ],
      },
    };
    const miss = collectMissingSectionSignals({
      aiAnalysis: { analyses: { srsProposal: proposal } },
    });
    assert.equal(miss.count, 0);
  });
});

describe('Gate A layers strip SOURCE_* from missing_sections', () => {
  const sheetGaps = [
    { section: 'entities', reason: 'SOURCE_SHEET_EMPTY' },
    { section: 'scope', reason: 'SOURCE_UNAVAILABLE' },
    { section: 'businessRules', reason: 'SOURCE_SHEET_ABSENT' },
  ];

  it('filterContentMissingSections drops all source-absence rows', () => {
    assert.deepEqual(filterContentMissingSections(sheetGaps), []);
    assert.deepEqual(
      filterContentMissingSections([
        ...sheetGaps,
        { section: 'businessGoals', reason: 'DERIVE_EMPTY' },
      ]),
      [{ section: 'businessGoals', reason: 'DERIVE_EMPTY' }]
    );
  });

  it('formatMissingSectionsMessage ignores SOURCE_* only lists', () => {
    assert.equal(formatMissingSectionsMessage(sheetGaps), '');
  });

  it('applyAdvisorySignalsToGateA does not warn for sheet-empty payload', () => {
    const gateA = applyAdvisorySignalsToGateA({ checks: [] }, { missingSections: sheetGaps });
    const miss = gateA.checks.find((c) => c.id === 'missing_sections');
    assert.equal(miss.passed, true);
    assert.equal(miss.value, 0);
    assert.deepEqual(miss.detail, []);
    assert.equal(gateA.hasWarnings, false);
  });

  it('runGateA does not warn for sheet-empty input.missingSections', () => {
    const result = runGateA({ missingSections: sheetGaps, duplicateCount: 0 });
    const miss = result.data.checks.find((c) => c.id === 'missing_sections');
    assert.equal(miss.passed, true);
    assert.equal(result.data.passed, true);
  });

  it('sanitizeGateAForSourceAbsence cleans stale snapshot', () => {
    const stale = {
      passed: false,
      hasWarnings: true,
      checks: [
        {
          id: 'missing_sections',
          passed: false,
          value: 2,
          detail: sheetGaps.slice(0, 2),
          message: 'Thiếu dữ liệu cột/section: entities (SOURCE_SHEET_EMPTY)',
        },
      ],
    };
    const cleaned = sanitizeGateAForSourceAbsence(stale);
    assert.equal(cleaned.passed, true);
    assert.equal(cleaned.hasWarnings, false);
    assert.equal(cleaned.checks[0].passed, true);
  });

  it('resolveGateAFromPack sanitizes stale requirementTools.gateA', () => {
    const pack = {
      aiAnalysis: {
        analyses: {
          requirementTools: {
            gateA: {
              passed: false,
              hasWarnings: true,
              checks: [
                {
                  id: 'missing_sections',
                  passed: false,
                  value: 1,
                  detail: [{ section: 'entities', reason: 'SOURCE_SHEET_EMPTY' }],
                },
              ],
            },
          },
        },
      },
    };
    const gateA = resolveGateAFromPack(pack);
    assert.equal(gateA.passed, true);
    assert.equal(gateA.hasWarnings, false);
    const miss = gateA.checks.find((c) => c.id === 'missing_sections');
    assert.equal(miss.passed, true);
    assert.equal(miss.value, 0);
  });
});
