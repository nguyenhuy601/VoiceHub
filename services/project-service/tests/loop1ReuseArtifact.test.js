const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  attachLoop1ReuseToContainer,
  readLoop1ReuseFromPack,
  toLoop1G4OptsSeed,
  isUsableLoop1Reuse,
} = require('../src/utils/aiAnalysis/loop1ReuseArtifact');

describe('project-service loop1ReuseArtifact', () => {
  const snap = 'snap-1';
  const artifact = {
    snapshotId: snap,
    sourceRunId: 'run-n',
    corpusContentHash: 'h1',
    contextPackage: { query: 'what_requirements', docs: [{ id: 'd1', text: 't' }] },
    priorPartial: {
      selection: { candidates: [{ id: 'FR-1' }], counts: { candidates: 1 } },
      projected: { snapshotId: snap, functionalRequirements: [{ id: 'FR-1' }] },
    },
    savedAt: '2026-10-02T00:00:00.000Z',
  };

  it('attaches and reads back for same snapshotId', () => {
    let container = { phaseRuns: { phase_what: { status: 'ready' } } };
    container = attachLoop1ReuseToContainer(container, artifact, snap);
    assert.equal(isUsableLoop1Reuse(container.phaseRuns.phase_what.loop1Reuse, snap), true);
    const read = readLoop1ReuseFromPack({ phaseRuns: container.phaseRuns }, snap);
    assert.ok(read);
    const seed = toLoop1G4OptsSeed(read);
    assert.equal(seed.loop1Reenter, true);
    assert.equal(seed.priorCorpusHash, 'h1');
    assert.ok(seed.priorPartial.selection);
    assert.ok(seed.reuseContextPackage.docs);
  });

  it('rejects mismatched snapshotId', () => {
    assert.equal(readLoop1ReuseFromPack({ phaseRuns: { phase_what: { loop1Reuse: artifact } } }, 'other'), null);
  });
});
