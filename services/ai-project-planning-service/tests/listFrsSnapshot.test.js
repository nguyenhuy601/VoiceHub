/**
 * G4 reads projected.srs only when a snapshot projection is present.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { listFrs } = require('../src/tools/requirementAnalysis');
const { runG4Pipeline } = require('../src/engines/g4/runG4Pipeline');

const row = {
  externalId: 'CR-001',
  name: 'Search',
  description: 'Search',
  moduleLabel: 'Courses',
  actor: 'Student',
  acceptanceCriteria: 'Listed',
};

describe('listFrs snapshot source', () => {
  it('returns projected.srs when that is the only FR list', () => {
    const listed = listFrs({
      projected: { srs: { functionalRequirements: [row] } },
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].externalId, 'CR-001');
  });

  it('keeps projected.srs when the top-level list is a normalized projection', () => {
    const listed = listFrs({
      functionalRequirements: [{ id: 'CR-001', title: 'Search', description: 'Search' }],
      projected: { srs: { functionalRequirements: [row] } },
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].externalId, 'CR-001');
  });

  it('rejects a top-level list that does not match projected.srs', () => {
    assert.throws(
      () => listFrs({
        functionalRequirements: [{ ...row, name: 'Other' }],
        projected: { srs: { functionalRequirements: [row] } },
      }),
      (err) => err.code === 'SNAPSHOT_FR_MISMATCH'
    );
  });

  it('does not run understanding when the snapshot has no functional requirements', async () => {
    let called = false;
    const result = await runG4Pipeline({
      snapshot: { projected: { srs: { functionalRequirements: [] } } },
      generateJsonFn: async () => {
        called = true;
        return {};
      },
    });
    assert.equal(result.errorCode, 'REQUIREMENT_NOT_READY');
    assert.equal(called, false);
  });
});
