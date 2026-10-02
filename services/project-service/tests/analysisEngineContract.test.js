/**
 * Analysis Engine Contract + Registry (Step 1).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYSIS_ENGINE_REGISTRY,
  SECTION_ENGINE_COUNT,
  assertRegistryComplete,
  topologicalLayers,
  listRegistryEngines,
  createEngineResult,
  assertEngineResultShape,
  assertNoSrsDraftInEngineResult,
  noDataResult,
  normalizeProposalItem,
  assertBrDerivedFrInvariant,
  ANALYSIS_PROPOSAL_KIND,
  ANALYSIS_SECTION_KEYS,
  resolveDerivedLineage,
} = require('../src/utils/srsProposal/contracts');

describe('AnalysisEngineRegistry', () => {
  it('lists exactly 12 engines and Meta is absent', () => {
    assert.equal(ANALYSIS_ENGINE_REGISTRY.length, SECTION_ENGINE_COUNT);
    assert.equal(listRegistryEngines().length, 12);
    assertRegistryComplete();
    const ids = ANALYSIS_ENGINE_REGISTRY.map((e) => e.id);
    assert.equal(ids.includes('meta'), false);
    assert.equal(ids.includes('metaGate'), false);
  });

  it('each entry has dependency metadata (Registry ≠ execution order)', () => {
    for (const e of ANALYSIS_ENGINE_REGISTRY) {
      assert.ok(e.id);
      assert.ok(e.section);
      assert.ok(e.kind);
      assert.ok(e.mode);
      assert.ok(Array.isArray(e.dependsOn));
      assert.ok(Array.isArray(e.optionalDependsOn));
      assert.equal(e.writesSection, e.section);
    }
    const layers = topologicalLayers();
    assert.ok(layers.length >= 2);
    // UC must be in a layer after FR
    const frLayer = layers.findIndex((l) => l.includes('fr'));
    const ucLayer = layers.findIndex((l) => l.includes('uc'));
    assert.ok(frLayer >= 0 && ucLayer > frLayer);
    const traceLayer = layers.findIndex((l) => l.includes('traceability'));
    assert.equal(traceLayer, layers.length - 1);
  });
});

describe('EngineResult + ProposalItem contracts', () => {
  it('distinguishes SUCCESS+NO_DATA from FAILED', () => {
    const gap = noDataResult({ engineId: 'br', section: 'businessRules' });
    assertEngineResultShape(gap);
    assert.equal(gap.execution.status, 'SUCCESS');
    assert.equal(gap.coverage.status, 'NO_DATA');
    assert.equal(gap.items.length, 0);

    const fail = createEngineResult({
      execution: { status: 'FAILED', diagnostics: ['boom'] },
      meta: { engineId: 'br', section: 'businessRules' },
    });
    assert.equal(fail.execution.status, 'FAILED');
    assert.equal(fail.coverage, null);
  });

  it('forbids srsDraft on engine result', () => {
    assert.throws(
      () => assertNoSrsDraftInEngineResult({ srsDraft: { kind: 'srs_draft' } }),
      (e) => e.code === 'ENGINE_SRS_BOUNDARY'
    );
  });

  it('BR-derived FR must stay PROPOSED', () => {
    const ok = assertBrDerivedFrInvariant({
      id: 'FR-FROM-BR-1',
      derivedFromBr: 'BR-1',
      status: 'EXTRACTED',
    });
    assert.equal(ok.status, 'PROPOSED');
    assert.equal(ok.origin.type, 'DERIVED');

    assert.throws(
      () =>
        assertBrDerivedFrInvariant({
          id: 'FR-X',
          derivedFromBr: 'BR-1',
          status: 'ACCEPTED',
        }),
      (e) => e.code === 'BR_FR_INVARIANT'
    );
  });

  it('derived lineage resolves upstream sourceRefs', () => {
    const fr = normalizeProposalItem({
      logicalId: 'FR-001',
      sourceRefs: [{ documentId: 'doc1', sheet: 'FR', row: 2 }],
    });
    const uc = normalizeProposalItem({
      logicalId: 'UC-001',
      provenance: { type: 'HEURISTIC', derivedFrom: ['FR-001'] },
      sourceRefs: [],
    });
    const lineage = resolveDerivedLineage(uc, { 'FR-001': fr });
    assert.ok(lineage.all.length >= 1);
    assert.equal(lineage.upstream[0].documentId, 'doc1');
  });

  it('exposes Analysis section catalog + kind constant', () => {
    assert.ok(ANALYSIS_SECTION_KEYS.includes('interfaces'));
    assert.ok(ANALYSIS_SECTION_KEYS.includes('glossary'));
    assert.ok(ANALYSIS_SECTION_KEYS.includes('assumptions'));
    assert.ok(ANALYSIS_SECTION_KEYS.includes('traceability'));
    assert.equal(ANALYSIS_PROPOSAL_KIND, 'requirement_analysis_proposal');
  });
});
