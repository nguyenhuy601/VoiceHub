/**
 * Data Lineage P0 — lean run hydrate vs legacy embedded.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  hydrateRunInputFromSnapshot,
} = require('../src/knowledge/hydrateRunInputFromSnapshot');

describe('hydrateRunInputFromSnapshot', () => {
  it('uses embedded_legacy when input.snapshot present', async () => {
    const out = await hydrateRunInputFromSnapshot({
      snapshotId: 'S1',
      packId: 'P1',
      organizationId: 'O1',
      input: {
        snapshot: { snapshotId: 'S1', projected: { srs: {} } },
        pack: { functionalRequirements: [{ externalId: 'FR-1' }] },
      },
    });
    assert.equal(out.mode, 'embedded_legacy');
    assert.equal(out.pack.functionalRequirements[0].externalId, 'FR-1');
  });

  it('hydrates via fetchFn when no embedded snapshot', async () => {
    const out = await hydrateRunInputFromSnapshot(
      {
        snapshotId: 'S2',
        packId: 'P2',
        organizationId: 'O2',
        input: { container: {}, toolData: {} },
      },
      {
        fetchFn: async ({ snapshotId, packId, organizationId }) => {
          assert.equal(snapshotId, 'S2');
          assert.equal(packId, 'P2');
          assert.equal(organizationId, 'O2');
          return {
            snapshot: {
              snapshotId: 'S2',
              projected: {
                srs: {
                  functionalRequirements: [{ externalId: 'FR-9' }],
                },
                employees: [{ employeeId: 'e1', userId: 'e1' }],
              },
            },
            pack: {
              functionalRequirements: [{ externalId: 'FR-9' }],
              employees: [{ employeeId: 'e1', userId: 'e1' }],
              useCases: [],
            },
            packContentHash: 'abc',
            pipelineVersion: 3,
          };
        },
      }
    );
    assert.equal(out.mode, 'hydrate');
    assert.equal(out.pack.functionalRequirements[0].externalId, 'FR-9');
    assert.equal(out.snapshot.projected.employees[0].employeeId, 'e1');
  });

  it('fails when meta missing for hydrate path', async () => {
    try {
      await hydrateRunInputFromSnapshot({
        snapshotId: 'S3',
        packId: '',
        organizationId: 'O3',
        input: {},
      });
      assert.fail('expected error');
    } catch (err) {
      assert.equal(err.code, 'HYDRATE_RUN_META_REQUIRED');
    }
  });
});
