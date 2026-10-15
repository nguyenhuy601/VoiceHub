/**
 * Wave-1: Analysis catalog trim 12→8 + full LLM derive unlock (no interface).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ANALYSIS_SECTION_KEYS,
  LEGACY_SECTION_KEYS,
  SECTION_TO_ENGINE,
  isAnalysisSection,
  isLegacySection,
} = require('../src/srsProposal/contracts/analysisSections');
const {
  ANALYSIS_ENGINE_REGISTRY,
  SECTION_ENGINE_COUNT,
  assertRegistryComplete,
  topologicalLayers,
} = require('../src/srsProposal/contracts/analysisEngineRegistry');
const {
  LLM_DERIVE_SECTIONS,
  DEFAULT_ACTIVE_LLM_DERIVE_SECTIONS,
  DEFAULT_LOCKED_LLM_DERIVE_SECTIONS,
  DETERMINISTIC_RAW_SECTIONS,
  getActiveLlmDeriveSections,
  getActiveDeterministicRawSections,
} = require('../src/semantic/rawSectionDerivePolicy');

const TRIMMED = ['interfaces', 'glossary', 'assumptions', 'traceability'];

describe('analysis catalog trim', () => {
  it('has 8 active analysis section keys', () => {
    assert.equal(ANALYSIS_SECTION_KEYS.length, 8);
    for (const key of TRIMMED) {
      assert.equal(isAnalysisSection(key), false);
      assert.equal(isLegacySection(key), true);
    }
    assert.ok(LEGACY_SECTION_KEYS.includes('actors'));
  });

  it('SECTION_TO_ENGINE maps only active sections', () => {
    assert.equal(Object.keys(SECTION_TO_ENGINE).length, 8);
    assert.equal(SECTION_TO_ENGINE.businessGoals, 'bg');
    assert.equal(SECTION_TO_ENGINE.entities, 'data');
    assert.equal(SECTION_TO_ENGINE.interfaces, undefined);
  });

  it('registry has 8 engines and DAG completes', () => {
    assert.equal(SECTION_ENGINE_COUNT, 8);
    assert.equal(ANALYSIS_ENGINE_REGISTRY.length, 8);
    assert.equal(assertRegistryComplete(), true);
    const ids = new Set(ANALYSIS_ENGINE_REGISTRY.map((e) => e.id));
    for (const id of ['interface', 'glossary', 'assumption', 'traceability']) {
      assert.equal(ids.has(id), false);
    }
    const layers = topologicalLayers();
    assert.ok(layers.length >= 1);
    assert.equal(layers.flat().length, 8);
  });
});

describe('raw derive unlock defaults', () => {
  it('LLM catalog excludes interface and includes nfr+scope+actors', () => {
    assert.deepEqual([...LLM_DERIVE_SECTIONS], [
      'bg',
      'br',
      'uc',
      'bpm',
      'data',
      'nfr',
      'scope',
      'actors',
    ]);
    assert.deepEqual([...DEFAULT_ACTIVE_LLM_DERIVE_SECTIONS], [...LLM_DERIVE_SECTIONS]);
    assert.deepEqual([...DEFAULT_LOCKED_LLM_DERIVE_SECTIONS], []);
  });

  it('deterministic catalog is actors only', () => {
    assert.deepEqual([...DETERMINISTIC_RAW_SECTIONS], ['actors']);
    assert.deepEqual(getActiveDeterministicRawSections({}), ['actors']);
  });

  it('getActiveLlmDeriveSections defaults to full unlock', () => {
    assert.deepEqual(getActiveLlmDeriveSections({}), [
      'bg',
      'br',
      'uc',
      'bpm',
      'data',
      'nfr',
      'scope',
      'actors',
    ]);
  });

  it('env can narrow unlock list', () => {
    assert.deepEqual(getActiveLlmDeriveSections({ PHASE1_RAW_DERIVE_SECTIONS: 'bg,br' }), [
      'bg',
      'br',
    ]);
  });
});
