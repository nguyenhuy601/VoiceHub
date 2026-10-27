const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { topologicalLayers } = require('../src/srsProposal/contracts/analysisEngineRegistry');
const { buildHowToolLayers } = require('../src/orchestration/howToolDag');

describe('Wave 4 parallel engine DAG', () => {
  it('topologicalLayers puts independent engines in layer 0 and uc after fr', () => {
    const layers = topologicalLayers();
    assert.ok(layers.length >= 2);
    assert.ok(layers[0].includes('fr'));
    assert.ok(layers[0].includes('bg'));
    assert.ok(!layers[0].includes('uc'));
    assert.ok(layers.some((layer) => layer.includes('uc')));
    // Layer 0 must be parallelizable (more than one independent engine)
    assert.ok(layers[0].length >= 5);
  });

  it('HOW DAG still parallels BacklogMap ∥ Wbs', () => {
    const layers = buildHowToolLayers([
      'BacklogMapTool',
      'WbsTool',
      'DependencyTool',
      'RiskTool',
      'QualityPlanTool',
      'ScheduleTool',
      'ProjectPlanTool',
    ]);
    assert.deepEqual(layers[0].sort(), ['BacklogMapTool', 'WbsTool'].sort());
    assert.ok(layers.some((layer) => layer.includes('DependencyTool')));
  });
});
