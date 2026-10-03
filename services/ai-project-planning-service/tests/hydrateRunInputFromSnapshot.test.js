/**
 * Data Lineage P0 — lean run hydrate vs legacy embedded.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  hydrateRunInputFromSnapshot,
} = require('../src/knowledge/hydrateRunInputFromSnapshot');

describe('hydrateRunInputFromSnapshot', () => {
  it('prefers S2S hydrate when run meta present even if input.snapshot stub exists', async () => {
    const out = await hydrateRunInputFromSnapshot(
      {
        snapshotId: 'S1',
        packId: 'P1',
        organizationId: 'O1',
        input: {
          // Poisoned stub (e.g. enrichRunInputWithG1Catalogs before hydrate)
          snapshot: { snapshotId: 'S1', projected: { srs: {} } },
          pack: {},
        },
      },
      {
        fetchFn: async () => ({
          snapshot: {
            snapshotId: 'S1',
            canonicalRaw: {
              registryVersion: 'raw-sem-v1',
              counts: { requirements: 45, businessRequests: 7 },
            },
            projected: {
              srs: {
                functionalRequirements: [{ externalId: 'FR-HYDRATE' }],
              },
            },
          },
          pack: {
            functionalRequirements: [{ externalId: 'FR-HYDRATE' }],
            aiAnalysis: {
              workbookDiagnostic: { intakeKind: 'customer_raw' },
              customerRawRows: { businessRequests: [{ requestId: 'BRQ-1' }] },
              canonicalRaw: {
                registryVersion: 'raw-sem-v1',
                counts: { requirements: 45, businessRequests: 7 },
              },
            },
          },
          packContentHash: 'abc',
          pipelineVersion: 4,
        }),
      }
    );
    assert.equal(out.mode, 'hydrate');
    assert.equal(out.pack.functionalRequirements[0].externalId, 'FR-HYDRATE');
    assert.equal(out.pack.aiAnalysis.workbookDiagnostic.intakeKind, 'customer_raw');
    assert.equal(out.snapshot.canonicalRaw.registryVersion, 'raw-sem-v1');
    assert.equal(out.pack.aiAnalysis.canonicalRaw.counts.requirements, 45);
  });

  it('uses embedded_legacy only when meta missing but input.snapshot present', async () => {
    const out = await hydrateRunInputFromSnapshot({
      snapshotId: '',
      packId: '',
      organizationId: '',
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
