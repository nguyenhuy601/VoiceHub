const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapPipelineProgressEvent } = require('../src/run/mapPipelineProgressEvent');

describe('mapPipelineProgressEvent', () => {
  it('normalizes explicit step+substep', () => {
    const evt = mapPipelineProgressEvent({ step: 2, substep: 'parse' }, { runId: 'r1' });
    assert.equal(evt.step, 2);
    assert.equal(evt.substep, 'parse');
    assert.equal(evt.node, null);
    assert.equal(evt.runId, 'r1');
  });

  it('fills step from catalog when only substep given', () => {
    const evt = mapPipelineProgressEvent({ substep: 'quality' });
    assert.equal(evt.step, 2);
    assert.equal(evt.substep, 'quality');
  });

  it('node-only does not invent business progress', () => {
    const evt = mapPipelineProgressEvent({ node: 'understand' });
    assert.equal(evt.step, null);
    assert.equal(evt.substep, null);
    assert.equal(evt.node, 'understand');
  });

  it('keeps tool without mapping to substep', () => {
    const evt = mapPipelineProgressEvent({ node: 'execute', tool: 'RequirementAnalysisTool' });
    assert.equal(evt.substep, null);
    assert.equal(evt.tool, 'RequirementAnalysisTool');
  });

  it('returns null for empty input', () => {
    assert.equal(mapPipelineProgressEvent(null), null);
    assert.equal(mapPipelineProgressEvent({}), null);
  });
});
