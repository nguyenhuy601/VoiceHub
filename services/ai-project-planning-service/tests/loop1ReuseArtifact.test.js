const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLoop1ReuseArtifact,
  isUsableLoop1Reuse,
  toLoop1G4OptsSeed,
  slimPriorPartial,
} = require('../src/knowledge/loop1ReuseArtifact');

describe('loop1ReuseArtifact', () => {
  it('builds usable artifact from priorPartial + contextPackage', () => {
    const artifact = buildLoop1ReuseArtifact({
      snapshotId: 'snap-1',
      sourceRunId: 'run-n',
      corpusContentHash: 'hashabc',
      contextPackage: {
        query: 'what_requirements',
        docs: [{ id: 'd1', text: 'Login context' }],
      },
      priorPartial: {
        selection: {
          candidates: [{ id: 'FR-1', title: 'Login', description: 'd' }],
          counts: { candidates: 1, clear: 1, total: 1 },
        },
        projected: {
          snapshotId: 'snap-1',
          overview: { requirementName: 'Demo' },
          functionalRequirements: [{ id: 'FR-1', title: 'Login', description: 'd' }],
        },
        functionalRequirements: [{ id: 'FR-1', title: 'Login', description: 'd' }],
        toolResult: { facts: { a: 1 } },
      },
    });
    assert.ok(artifact);
    assert.equal(artifact.snapshotId, 'snap-1');
    assert.equal(artifact.corpusContentHash, 'hashabc');
    assert.equal(isUsableLoop1Reuse(artifact, 'snap-1'), true);
    assert.equal(isUsableLoop1Reuse(artifact, 'other'), false);

    const seed = toLoop1G4OptsSeed(artifact, 'snap-1');
    assert.equal(seed.loop1Reenter, true);
    assert.ok(seed.priorPartial.selection);
    assert.ok(seed.reuseContextPackage.docs);
    assert.equal(seed.priorCorpusHash, 'hashabc');
  });

  it('slimPriorPartial keeps selection+projected for resume', () => {
    const slim = slimPriorPartial({
      selection: { candidates: [{ id: 'FR-1', title: 'T', description: 'x' }] },
      projected: { snapshotId: 'S', functionalRequirements: [{ id: 'FR-1' }] },
      functionalRequirements: [{ id: 'FR-1', title: 'T', description: 'x' }],
      toolResult: { facts: {} },
      toolEvidence: [{ huge: true }],
    });
    assert.ok(slim.selection.candidates.length);
    assert.ok(slim.projected);
    assert.deepEqual(slim.toolEvidence, []);
  });

  it('returns null when contextPackage missing', () => {
    assert.equal(
      buildLoop1ReuseArtifact({
        snapshotId: 'snap-1',
        priorPartial: {
          selection: { candidates: [] },
          projected: {},
        },
      }),
      null
    );
  });
});
