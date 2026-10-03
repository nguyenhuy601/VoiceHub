/**
 * T-G4-01..04 — FR analysis entry + semantic parity + no synthesis in FR result.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  analyzeFunctionalRequirements,
  normalizeSemanticOutput,
  fromLegacyG4Input,
  toLegacyG4SemanticInput,
} = require('../src/requirementAnalysis/functionalRequirements');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'g4SemanticParity');

function loadCase(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

describe('g4SemanticParity T-G4-01', () => {
  for (const file of [
    'case-001-attendance.json',
    'case-002-leave.json',
    'case-003-reporting.json',
  ]) {
    it(`normalize parity ${file}`, async () => {
      const fixture = loadCase(file);
      const legacyPath = {
        requirements: fixture.legacyG4Input.functionalRequirements,
        relationships: [],
        ambiguities: [],
        assumptions: [],
        semanticItems: [],
        conflicts: [],
        evidence: { items: [] },
        facts: {},
        signalsMeta: null,
        meta: {
          runId: 'old-run',
          durationMs: 999,
          timestamp: '2020-01-01',
          generationId: 'g-old',
          traceId: 't-old',
        },
        synthesis: 'SHOULD_NOT_AFFECT_PARITY',
      };

      const frOut = await analyzeFunctionalRequirements({
        legacyG4Input: fixture.legacyG4Input,
        skipLlm: true,
        forceHeuristic: true,
        generationId: 'g-new',
      });

      assert.equal(frOut.blocked, false);
      assert.ok(frOut.frAnalysisResult);
      assert.equal(frOut.frAnalysisResult.synthesis, undefined);
      assert.equal(frOut.proposalFragment.section, 'functionalRequirements');
      assert.equal(frOut.proposalFragment.meta.hasSynthesis, false);

      const A = normalizeSemanticOutput(legacyPath);
      const B = frOut.normalizedSemantic;
      // Requirement identity parity (core of T-G4-01)
      assert.deepEqual(
        A.requirements.map((r) => ({ id: r.id, title: r.title })),
        B.requirements.map((r) => ({ id: r.id, title: r.title }))
      );
      assert.ok(!('synthesis' in A) || A.synthesis === undefined);
    });
  }
});

describe('analyzeFunctionalRequirements T-G4-02/03/04', () => {
  it('T-G4-02: one legacy adapter round-trip', () => {
    const snap = {
      functionalRequirements: [{ id: 'FR-1', title: 'A' }],
      actors: [{ id: 'A1' }],
      domain: { name: 'D' },
    };
    const proj = fromLegacyG4Input(snap);
    assert.ok(!('process' in proj));
    const back = toLegacyG4SemanticInput(proj);
    assert.equal(back.functionalRequirements[0].id, 'FR-1');
  });

  it('T-G4-03: FRAnalysisResult → proposal fragment', async () => {
    const out = await analyzeFunctionalRequirements({
      legacyG4Input: {
        functionalRequirements: [
          { id: 'FR-X', title: 'X', description: 'desc', derivedFromBr: 'BR-1' },
        ],
      },
      skipLlm: true,
      forceHeuristic: true,
    });
    assert.ok(out.proposalFragment.items.length >= 1);
    const derived = out.proposalFragment.items.find((i) => i.id === 'FR-X');
    assert.ok(derived);
    assert.equal(derived.status, 'PROPOSED');
  });

  it('T-G4-04: synthesis not in FR analysis result', async () => {
    const out = await analyzeFunctionalRequirements({
      legacyG4Input: {
        functionalRequirements: [{ id: 'FR-1', title: 'T' }],
      },
      skipLlm: true,
      forceHeuristic: true,
    });
    assert.equal(out.frAnalysisResult.synthesis, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(out.proposalFragment, 'synthesis'));
  });
});
