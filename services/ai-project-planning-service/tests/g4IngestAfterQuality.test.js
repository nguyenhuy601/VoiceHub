/**
 * Data Lineage P0 — Qdrant after quality; valid-set ≠ candidates; corpusHash skip.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { computeCorpusContentHash } = require('../src/retrieval/corpusContentHash');
const {
  ingestSnapshotToQdrant,
} = require('../src/retrieval/ingestSnapshotToQdrant');
const { buildCorpusFromSnapshot } = require('../src/retrieval/buildCorpusFromSnapshot');

describe('computeCorpusContentHash', () => {
  it('stable for same FR set', () => {
    const frs = [
      { id: 'FR-2', title: 'B', description: 'd2' },
      { id: 'FR-1', title: 'A', description: 'd1' },
    ];
    const a = computeCorpusContentHash({
      snapshotId: 'S1',
      embeddingVersion: 'v1',
      frs,
    });
    const b = computeCorpusContentHash({
      snapshotId: 'S1',
      embeddingVersion: 'v1',
      frs: [...frs].reverse(),
    });
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });

  it('changes when FR text changes', () => {
    const h1 = computeCorpusContentHash({
      snapshotId: 'S1',
      embeddingVersion: 'v1',
      frs: [{ id: 'FR-1', title: 'A', description: 'd1' }],
    });
    const h2 = computeCorpusContentHash({
      snapshotId: 'S1',
      embeddingVersion: 'v1',
      frs: [{ id: 'FR-1', title: 'A', description: 'CHANGED' }],
    });
    assert.notEqual(h1, h2);
  });
});

describe('buildCorpusFromSnapshot frOverride', () => {
  it('indexes quality-valid override set (normalized id→externalId)', () => {
    const corpus = buildCorpusFromSnapshot(
      {
        snapshotId: 'S1',
        projected: {
          srs: {
            functionalRequirements: [
              { externalId: 'FR-RAW', name: 'Raw', description: 'should not win' },
            ],
          },
        },
      },
      {
        frOverride: [
          { id: 'FR-1', title: 'Valid1', description: 'd1' },
          { id: 'FR-2', title: 'Valid2', description: 'd2' },
        ],
      }
    );
    const frDocs = corpus.filter((d) => d.docType === 'srs_canonical');
    assert.equal(frDocs.length, 2);
    assert.ok(frDocs.every((d) => d.sourceId === 'FR-1' || d.sourceId === 'FR-2'));
  });
});

describe('ingestSnapshotToQdrant corpusHash skip', () => {
  it('skips embed/upsert when priorCorpusHash matches', async () => {
    let embedCalls = 0;
    const frs = [
      { id: 'FR-1', title: 'A', description: 'd1' },
      { id: 'FR-2', title: 'B', description: 'd2' },
    ];
    const env = { G7_EMBEDDING_VERSION: 'test-v1' };
    const hash = computeCorpusContentHash({
      snapshotId: 'SNAP-X',
      embeddingVersion: 'test-v1',
      frs,
    });
    const qdrant = {
      async ensureCollection() {
        return { created: true };
      },
      async upsertPoints() {
        throw new Error('upsert should not run when skipped');
      },
    };
    const out = await ingestSnapshotToQdrant({
      snapshotId: 'SNAP-X',
      snapshot: { snapshotId: 'SNAP-X' },
      frOverride: frs,
      priorCorpusHash: hash,
      afterQuality: true,
      embedFn: async () => {
        embedCalls += 1;
        return { ok: true, embedding: [0.1], model: 'nomic', embeddingVersion: 'test-v1' };
      },
      qdrant,
      env,
    });
    assert.equal(out.skippedIngest, true);
    assert.equal(embedCalls, 0);
    assert.equal(out.corpusContentHash, hash);
  });

  it('embeds once then skips on second call with same hash', async () => {
    let embedCalls = 0;
    let upsertCalls = 0;
    const frs = Array.from({ length: 5 }, (_, i) => ({
      id: `FR-${i + 1}`,
      title: `T${i}`,
      description: `D${i}`,
    }));
    const env = { G7_EMBEDDING_VERSION: 'test-v1' };
    const qdrant = {
      async ensureCollection() {
        return { created: true };
      },
      async upsertPoints() {
        upsertCalls += 1;
      },
    };
    const embedFn = async () => {
      embedCalls += 1;
      return { ok: true, embedding: [0.1, 0.2], model: 'nomic', embeddingVersion: 'test-v1' };
    };
    const first = await ingestSnapshotToQdrant({
      snapshotId: 'SNAP-Y',
      snapshot: { snapshotId: 'SNAP-Y', projected: { srs: {}, skillCatalog: { skills: [] } } },
      frOverride: frs,
      afterQuality: true,
      embedFn,
      qdrant,
      env,
    });
    assert.equal(first.skippedIngest, false);
    assert.ok(first.upserted >= 1);
    const afterFirstEmbeds = embedCalls;

    const second = await ingestSnapshotToQdrant({
      snapshotId: 'SNAP-Y',
      snapshot: { snapshotId: 'SNAP-Y' },
      frOverride: frs,
      priorCorpusHash: first.corpusContentHash,
      afterQuality: true,
      embedFn,
      qdrant,
      env,
    });
    assert.equal(second.skippedIngest, true);
    assert.equal(embedCalls, afterFirstEmbeds);
    assert.equal(upsertCalls, 1);
  });
});

describe('valid-set vs candidates size', () => {
  it('corpus FR count follows override full set not candidate subset', () => {
    const validSet = Array.from({ length: 20 }, (_, i) => ({
      id: `FR-${i + 1}`,
      title: `T${i}`,
      description: `D${i}`,
    }));
    const candidates = validSet.slice(0, 3);
    const corpusFull = buildCorpusFromSnapshot(
      { snapshotId: 'S', projected: { srs: {} } },
      { frOverride: validSet }
    );
    const corpusCand = buildCorpusFromSnapshot(
      { snapshotId: 'S', projected: { srs: {} } },
      { frOverride: candidates }
    );
    const nFull = corpusFull.filter((d) => d.docType === 'srs_canonical').length;
    const nCand = corpusCand.filter((d) => d.docType === 'srs_canonical').length;
    assert.equal(nFull, 20);
    assert.equal(nCand, 3);
    assert.ok(nFull > nCand);
  });
});
