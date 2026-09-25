/**
 * Unit — proposed SRS draft
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildProposedSrsDraft } = require('../../src/utils/tools/buildProposedSrsDraft');

describe('proposedSrsDraft', () => {
  it('keeps externalIds and does not mutate pack FR', () => {
    const pack = {
      overview: { requirementName: 'Attend' },
      functionalRequirements: [
        { externalId: 'FR-021', description: 'GPS check-in' },
        { externalId: 'FR-022', description: 'Offline sync' },
      ],
    };
    const before = JSON.stringify(pack.functionalRequirements);
    const draft = buildProposedSrsDraft(pack, {
      schemaVersion: 'requirementInsights.v1',
      clarifications: [
        {
          id: 'c1',
          frId: 'FR-021',
          field: 'description',
          text: 'Define geofence tolerance and offline behavior.',
          priority: 'High',
        },
      ],
    });
    assert.equal(JSON.stringify(pack.functionalRequirements), before);
    assert.equal(draft.deltas.length, 1);
    assert.equal(draft.deltas[0].externalId, 'FR-021');
    assert.equal(draft.deltas[0].applied, false);
    assert.ok(draft.unchangedSourceRefs.some((r) => r.externalId === 'FR-021'));
    assert.ok(draft.unchangedSourceRefs.some((r) => r.externalId === 'FR-022'));
  });
});
