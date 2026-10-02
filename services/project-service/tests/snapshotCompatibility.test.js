/**
 * Data Lineage P0 — snapshot reuse compatibility gate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isSnapshotProjectionCompatible,
  CURRENT_SNAPSHOT_PIPELINE_VERSION,
} = require('../src/utils/aiAnalysis/pipeline/snapshotCompatibility');
const { REQUIRED_PROJECTED_SRS_SECTIONS } = require('../src/utils/aiAnalysis/pipeline/projectAnalysisSections');
const { PIPELINE_VERSION } = require('../src/utils/aiAnalysis/pipeline/pipelineConstants');

function srsWithAllSections(extra = {}) {
  const srs = {};
  for (const key of REQUIRED_PROJECTED_SRS_SECTIONS) {
    srs[key] = [];
  }
  return { ...srs, ...extra };
}

describe('isSnapshotProjectionCompatible', () => {
  it('ok when hash + pipeline + sections match', () => {
    const snap = {
      packContentHash: 'h1',
      pipelineVersion: PIPELINE_VERSION,
      projected: { srs: srsWithAllSections() },
    };
    const r = isSnapshotProjectionCompatible(snap, {
      packContentHash: 'h1',
      pipelineVersion: CURRENT_SNAPSHOT_PIPELINE_VERSION,
    });
    assert.equal(r.ok, true);
  });

  it('rejects pipeline mismatch even when hash matches', () => {
    const snap = {
      packContentHash: 'h1',
      pipelineVersion: PIPELINE_VERSION - 1,
      projected: { srs: srsWithAllSections() },
    };
    const r = isSnapshotProjectionCompatible(snap, { packContentHash: 'h1' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'pipeline');
  });

  it('rejects missing required section keys (old FR-only projection)', () => {
    const snap = {
      packContentHash: 'h1',
      pipelineVersion: PIPELINE_VERSION,
      projected: {
        srs: {
          functionalRequirements: [],
          nonFunctionalRequirements: [],
        },
      },
    };
    const r = isSnapshotProjectionCompatible(snap, { packContentHash: 'h1' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'sections');
  });

  it('rejects hash mismatch', () => {
    const snap = {
      packContentHash: 'old',
      pipelineVersion: PIPELINE_VERSION,
      projected: { srs: srsWithAllSections() },
    };
    const r = isSnapshotProjectionCompatible(snap, { packContentHash: 'new' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'hash');
  });
});
