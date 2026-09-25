const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { retrieveStub } = require('../src/retrieval/retrieveStub');
const { rerankAndFilter } = require('../src/retrieval/rerankFilter');
const {
  runG7Pipeline,
  runG7PipelineSync,
  assembleCitations,
} = require('../src/retrieval/runG7Pipeline');
const {
  validateContextPackage,
  G7_PIPELINE_STEPS,
  classifyQueryIntent,
} = require('../src/retrieval/g7PipelineSchemas');
const { assembleContextPackage } = require('../src/retrieval/contextAssembly');

describe('retrieveStub', () => {
  it('matches substring and returns empty for off', () => {
    const corpus = [
      { id: 'A', text: 'available capacity hours' },
      { id: 'B', text: 'unrelated' },
    ];
    const hit = retrieveStub({ query: 'capacity', corpus, mode: 'stub' });
    assert.equal(hit.docs.length, 1);
    assert.equal(hit.docs[0].sourceId, 'A');

    const off = retrieveStub({ query: 'capacity', corpus, mode: 'off' });
    assert.equal(off.docs.length, 0);
  });

  it('legacy qdrant substring helper still flags fallbackStub', () => {
    const corpus = [{ id: 'X', text: 'skill React' }];
    const out = retrieveStub({ query: 'React', corpus, mode: 'qdrant' });
    assert.equal(out.fallbackStub, true);
    assert.equal(out.modeUsed, 'qdrant');
    assert.equal(out.docs.length, 1);
  });
});

describe('rerankAndFilter', () => {
  it('drops citations whose sourceId is not in corpus (RULE-C1)', () => {
    const citations = rerankAndFilter({
      docs: [
        { sourceId: 'A', text: 'keep', score: 0.9 },
        { sourceId: 'ghost', text: 'drop', score: 0.99 },
      ],
      corpus: [{ id: 'A', text: 'keep' }],
      topK: 5,
    });
    assert.equal(citations.length, 1);
    assert.equal(citations[0].sourceId, 'A');
    assert.equal(citations[0].citationId, 'CIT-1');
  });
});

describe('runG7Pipeline', () => {
  it('runs four steps and returns valid Context Package', async () => {
    const pkg = await runG7Pipeline({
      query: 'capacity hours',
      corpus: [{ id: 'DOC-1', text: 'available capacity hours for employee' }],
      topK: 3,
      mode: 'stub',
    });
    const v = validateContextPackage(pkg);
    assert.equal(v.ok, true, v.errors?.join('; '));
    assert.deepEqual(pkg.steps, [...G7_PIPELINE_STEPS]);
    assert.equal(pkg.intent, classifyQueryIntent('capacity hours'));
    assert.equal(pkg.stub, true);
    assert.ok(pkg.citations.length >= 1);
    assert.equal(pkg.citations[0].sourceId, 'DOC-1');
  });

  it('mode off returns empty citations', async () => {
    const pkg = await runG7Pipeline({
      query: 'capacity',
      corpus: [{ id: 'DOC-1', text: 'capacity' }],
      mode: 'off',
    });
    assert.equal(pkg.mode, 'off');
    assert.equal(pkg.citations.length, 0);
    assert.equal(validateContextPackage(pkg).ok, true);
  });

  it('qdrant mode requires snapshotId (fail-closed)', async () => {
    await assert.rejects(
      () =>
        runG7Pipeline({
          query: 'React',
          corpus: [{ id: 'S1', text: 'React skill' }],
          mode: 'qdrant',
        }),
      (e) => e.code === 'SNAPSHOT_BIND_REQUIRED'
    );
  });

  it('hybrid mode requires snapshotId (fail-closed)', async () => {
    await assert.rejects(
      () =>
        runG7Pipeline({
          query: 'capacity',
          corpus: [{ id: 'M1', text: 'available capacity hours' }],
          mode: 'hybrid',
        }),
      (e) => e.code === 'SNAPSHOT_BIND_REQUIRED'
    );
  });

  it('keyword mode returns stub:false when hits exist', async () => {
    const pkg = await runG7Pipeline({
      query: 'React',
      corpus: [{ id: 'S1', text: 'React skill catalog', docType: 'skill_def' }],
      mode: 'keyword',
    });
    assert.equal(pkg.stub, false);
    assert.equal(pkg.mode, 'keyword');
    assert.ok(pkg.citations.some((c) => c.sourceId === 'S1'));
  });

  it('hybrid mode keyword-only when qdrant unavailable', async () => {
    const pkg = await runG7Pipeline({
      query: 'capacity',
      corpus: [{ id: 'M1', text: 'available capacity hours', docType: 'metric_def' }],
      mode: 'hybrid',
      snapshotId: 'SNAP-H',
      env: { QDRANT_URL: '', OLLAMA_BASE_URL: '' },
    });
    assert.equal(pkg.stub, false);
    assert.equal(pkg.mode, 'hybrid');
    assert.ok(pkg.citations.length >= 1);
  });

  it('assembleContextPackage sync hides steps for stub', () => {
    const pkg = assembleContextPackage({
      query: 'skill',
      corpus: [{ id: 'S1', text: 'skill catalog' }],
      mode: 'stub',
    });
    assert.equal(pkg.steps, undefined);
    assert.equal(validateContextPackage(pkg).ok, true);
  });

  it('runG7PipelineSync supports keyword', () => {
    const pkg = runG7PipelineSync({
      query: 'React',
      corpus: [{ id: 'S1', text: 'React skill' }],
      mode: 'keyword',
    });
    assert.equal(pkg.stub, false);
  });

  it('assembleCitations builds Wave C+ shape', () => {
    const pkg = assembleCitations({
      query: 'q',
      citations: [{ citationId: 'CIT-1', sourceId: 'A', snippet: 'x', score: 1 }],
      mode: 'stub',
      intent: 'general',
    });
    assert.equal(validateContextPackage(pkg).ok, true);
  });
});
