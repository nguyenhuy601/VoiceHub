/**
 * Analysis engines V1 behavior (source-ingest, BPM boundary, UC provenance).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { brEngine, bpmEngine, ucEngine, frEngine, bgEngine } = require('../src/utils/srsProposal/engines');
const { createEmptySrsProposal, applyProposalFragment } = require('../src/utils/srsProposal');

describe('base engines source-ingest', () => {
  it('BR empty → NO_DATA no placeholder', () => {
    const r = brEngine.run({ ownedSectionProjection: { absent: true, rows: [] }, context: { pack: {} } });
    assert.equal(r.execution.status, 'SUCCESS');
    assert.equal(r.coverage.status, 'NO_DATA');
    assert.equal(r.items.length, 0);
  });

  it('BG maps source rows', () => {
    const r = bgEngine.run({
      ownedSectionProjection: {
        rows: [{ id: 'BG-1', title: 'Goal', sourceRefs: [{ documentId: 'd1', sheet: 'BG', row: 1 }] }],
      },
    });
    assert.equal(r.coverage.status, 'AVAILABLE');
    assert.equal(r.items[0].logicalId, 'BG-1');
    assert.equal(r.items[0].origin.engine, 'bg');
  });

  it('BPM does not synthesize from FR upstream', () => {
    const r = bpmEngine.run({
      ownedSectionProjection: { absent: true, rows: [] },
      upstreamFragments: {
        functionalRequirements: { items: [{ logicalId: 'FR-1', title: 'Do X' }] },
      },
      context: { pack: {} },
    });
    assert.equal(r.items.length, 0);
    assert.equal(r.coverage.status, 'NO_DATA');
  });

  it('BPM allows source-declared relatedFrIds', () => {
    const r = bpmEngine.run({
      ownedSectionProjection: {
        rows: [
          {
            id: 'BPM-1',
            title: 'Leave',
            relatedFrIds: ['FR-004'],
            sourceRefs: [{ documentId: 'd1', sheet: 'BPM', row: 2 }],
          },
        ],
      },
    });
    assert.equal(r.items[0].relatedFrIds[0], 'FR-004');
    assert.equal(r.items[0].relationProvenance, 'source_declared');
  });
});

describe('derived UC + FR adapter', () => {
  it('UC-from-FR has provenance.HEURISTIC', () => {
    const r = ucEngine.run({
      ownedSectionProjection: { absent: true, rows: [] },
      upstreamFragments: {
        functionalRequirements: {
          items: [
            {
              logicalId: 'FR-001',
              title: 'Clock in',
              sourceRefs: [{ documentId: 'd1', row: 1 }],
            },
          ],
        },
      },
      context: { pack: {} },
    });
    assert.ok(r.items.length >= 1);
    assert.equal(r.items[0].provenance.type, 'HEURISTIC');
    assert.deepEqual(r.items[0].provenance.derivedFrom, ['FR-001']);
    assert.ok(r.items[0].sourceRefs.length >= 1);
  });

  it('FREngine rejects BR-derived ACCEPTED', () => {
    const r = frEngine.run({
      ownedSectionProjection: {
        items: [{ id: 'FR-X', derivedFromBr: 'BR-1', status: 'ACCEPTED', title: 'X' }],
      },
    });
    assert.equal(r.execution.status, 'FAILED');
  });

  it('FREngine normalizes EXTRACTED items', () => {
    const r = frEngine.run({
      proposalFragment: {
        section: 'functionalRequirements',
        items: [{ id: 'FR-1', title: 'A', sourceRefs: [{ documentId: 'd1' }] }],
      },
    });
    assert.equal(r.execution.status, 'SUCCESS');
    assert.equal(r.items[0].origin.engine, 'fr');
    assert.equal(r.meta.section, 'functionalRequirements');
  });
});

describe('reducer legacy write isolation', () => {
  it('rejects actors write without allowLegacyWrite', () => {
    assert.throws(
      () =>
        applyProposalFragment(createEmptySrsProposal(), {
          section: 'actors',
          items: [{ logicalId: 'A1', name: 'X' }],
        }),
      (e) => e.code === 'LEGACY_SECTION_WRITE_FORBIDDEN'
    );
  });
});
