/**
 * T3 — Analysis Engine graph: 12 nodes + meta; layer order
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  listEngineNodeIds,
  topologicalLayers,
} = require('../src/orchestration/buildAnalysisEngineGraph');
const {
  listAnalysisGraphNodeIds,
  flattenLayerOrder,
  ENGINE_NODE_IDS,
  META_GATE_NODE_ID,
} = require('../src/orchestration/analysisEngineNodes');

describe('analysisEngineGraphOrder', () => {
  it('registry has 12 engines', () => {
    assert.equal(listEngineNodeIds().length, 12);
    assert.equal(ENGINE_NODE_IDS.length, 12);
  });

  it('graph node ids = 12 engines + deriveRawSections + metaGate', () => {
    const ids = listAnalysisGraphNodeIds();
    assert.equal(ids.length, 14);
    assert.ok(ids.includes(META_GATE_NODE_ID));
    assert.ok(ids.includes('deriveRawSections'));
    assert.ok(
      ids.every(
        (id) =>
          id === META_GATE_NODE_ID ||
          id === 'deriveRawSections' ||
          id.startsWith('engine_')
      )
    );
  });

  it('flatten order respects layers (fr before uc)', () => {
    const order = flattenLayerOrder();
    const fr = order.indexOf('fr');
    const uc = order.indexOf('uc');
    assert.ok(fr >= 0 && uc >= 0);
    assert.ok(fr < uc, 'fr must precede uc');
    const layers = topologicalLayers();
    assert.ok(layers.length >= 2);
  });
});
