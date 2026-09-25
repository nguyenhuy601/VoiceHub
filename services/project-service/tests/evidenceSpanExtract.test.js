/**
 * evidence_span_extract — Wave A unit tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractEvidenceSpans,
  toPersistedEvidenceSpans,
  pickEvidenceIdsForClaim,
  sanitizeEvidenceIds,
  filterSeedRowsRequiringEvidence,
  isPhase1RequireEvidence,
  SNIPPET_MAX,
} = require('../src/utils/tools/evidence/evidenceSpanExtract');

describe('evidenceSpanExtract', () => {
  it('builds stable ids and capped snippets from corpus', () => {
    const long = `Alpha enrollment ${'x'.repeat(250)}`;
    const { spans, spanCount } = extractEvidenceSpans({
      excerpts: [
        { filename: 'req.txt', text: `${long}\n\nSecond paragraph about login.` },
      ],
    });
    assert.ok(spanCount >= 1);
    assert.equal(spans[0].id, 'e-span-1-1');
    assert.ok(spans[0].snippet.length <= SNIPPET_MAX);
    assert.equal(spans[0].filename, 'req.txt');
    const again = extractEvidenceSpans({
      excerpts: [
        { filename: 'req.txt', text: `${long}\n\nSecond paragraph about login.` },
      ],
    });
    assert.deepEqual(
      again.spans.map((s) => s.id),
      spans.map((s) => s.id)
    );
  });

  it('toPersistedEvidenceSpans omits full text', () => {
    const { spans } = extractEvidenceSpans({
      excerpts: [{ filename: 'a.md', text: 'Hello world requirement text' }],
    });
    const slim = toPersistedEvidenceSpans(spans);
    assert.equal(slim[0].id, spans[0].id);
    assert.ok(slim[0].snippet);
    assert.equal(slim[0].text, undefined);
  });

  it('pickEvidenceIdsForClaim only returns known ids', () => {
    const { spans } = extractEvidenceSpans({
      excerpts: [
        { filename: 'a.txt', text: 'Student can register courses online' },
        { filename: 'b.txt', text: 'Payment gateway integration needed' },
      ],
    });
    const ids = pickEvidenceIdsForClaim('register courses', spans, 2);
    assert.ok(ids.length >= 1);
    for (const id of ids) {
      assert.ok(spans.some((s) => s.id === id));
    }
    assert.deepEqual(sanitizeEvidenceIds(['e-span-1-1', 'fake'], spans), ['e-span-1-1']);
  });

  it('filterSeedRowsRequiringEvidence drops leaf without cite when on', () => {
    const rows = [
      { externalId: 'M-001', level: 'Module', name: 'M' },
      { externalId: 'F-001', level: 'Feature', name: 'F' },
      { externalId: 'FR-001', level: 'Requirement', name: 'no cite' },
      {
        externalId: 'FR-002',
        level: 'Requirement',
        name: 'with cite',
        evidenceIds: ['e-span-1-1'],
      },
    ];
    const { kept, skippedNoCite } = filterSeedRowsRequiringEvidence(rows, {
      require: true,
    });
    assert.equal(skippedNoCite, 1);
    assert.ok(kept.some((r) => r.externalId === 'FR-002'));
    assert.ok(!kept.some((r) => r.externalId === 'FR-001'));
    assert.ok(kept.some((r) => r.level === 'Module'));
  });

  it('PHASE1_REQUIRE_EVIDENCE env gate defaults on', () => {
    const prev = process.env.PHASE1_REQUIRE_EVIDENCE;
    try {
      delete process.env.PHASE1_REQUIRE_EVIDENCE;
      assert.equal(isPhase1RequireEvidence(), true);
      process.env.PHASE1_REQUIRE_EVIDENCE = '0';
      assert.equal(isPhase1RequireEvidence(), false);
    } finally {
      if (prev === undefined) delete process.env.PHASE1_REQUIRE_EVIDENCE;
      else process.env.PHASE1_REQUIRE_EVIDENCE = prev;
    }
  });
});
