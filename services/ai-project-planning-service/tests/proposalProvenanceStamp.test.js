/**
 * T1b — Provenance stamp: LLM ≠ Heuristic ≠ Extracted
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  stampAiSynthesis,
  stampHeuristic,
  stampExtracted,
  PRODUCERS,
} = require('../src/semantic/stampProvenance');

describe('proposalProvenanceStamp', () => {
  it('Runtime → AI_SYNTHESIS + semantic_runtime', () => {
    const item = stampAiSynthesis(
      { title: 'FR semantic', description: 'x' },
      { engineId: 'fr', section: 'functionalRequirements', taskId: 'fr', index: 0 }
    );
    assert.equal(item.origin.type, 'AI_SYNTHESIS');
    assert.equal(item.provenance.type, 'AI_SYNTHESIS');
    assert.equal(item.provenance.producer, PRODUCERS.SEMANTIC_RUNTIME);
    assert.equal(item.provenance.rule, 'fr');
  });

  it('Heuristic → HEURISTIC + heuristic_rule', () => {
    const item = stampHeuristic(
      { title: 'UC from FR', description: 'x' },
      { engineId: 'uc', section: 'useCases', rule: 'UC_FROM_FR', index: 0 }
    );
    assert.equal(item.origin.type, 'HEURISTIC');
    assert.equal(item.provenance.producer, PRODUCERS.HEURISTIC);
    assert.equal(item.provenance.rule, 'UC_FROM_FR');
  });

  it('Ingest → EXTRACTED + deterministic', () => {
    const item = stampExtracted(
      { title: 'Goal', description: 'from sheet' },
      { engineId: 'bg', section: 'businessGoals', index: 0 }
    );
    assert.equal(item.origin.type, 'EXTRACTED');
    assert.equal(item.provenance.producer, PRODUCERS.DETERMINISTIC);
    assert.equal(item.provenance.rule, 'SOURCE_INGEST');
  });
});
