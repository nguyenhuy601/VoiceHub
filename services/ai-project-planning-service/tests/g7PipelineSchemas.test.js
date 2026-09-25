const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  G7_CONTRACT_VERSION,
  G7_PIPELINE_STEPS,
  getG7RagMode,
  classifyQueryIntent,
  filterCitationsToCorpus,
  validateContextPackage,
} = require('../src/retrieval/g7PipelineSchemas');
const { assembleContextPackage } = require('../src/retrieval/contextAssembly');

describe('G7 RAG contract', () => {
  it('exposes four pipeline steps and version', () => {
    assert.equal(G7_CONTRACT_VERSION, 'g7.rag.v1');
    assert.deepEqual(G7_PIPELINE_STEPS, [
      'query_intent',
      'retrieve',
      'rerank_filter',
      'context_assembly',
    ]);
  });

  it('getG7RagMode defaults to stub', () => {
    assert.equal(getG7RagMode({}), 'stub');
    assert.equal(getG7RagMode({ G7_RAG_MODE: 'qdrant' }), 'qdrant');
    assert.equal(getG7RagMode({ G7_RAG_MODE: 'off' }), 'off');
  });

  it('classifyQueryIntent is deterministic', () => {
    assert.equal(classifyQueryIntent('employee capacity hours'), 'metric_def');
    assert.equal(classifyQueryIntent('React skill level'), 'skill_def');
    assert.equal(classifyQueryIntent('FR-01 acceptance evidence'), 'requirement_evidence');
    assert.equal(classifyQueryIntent('past project experience'), 'history_snippet');
    assert.equal(classifyQueryIntent('hello'), 'general');
  });

  it('validateContextPackage enforces Wave C shape', () => {
    const ok = validateContextPackage({
      query: 'q',
      citations: [{ citationId: 'CIT-1', sourceId: 'S1', snippet: 'x', score: 0.9 }],
      assembledAt: '2026-01-01T00:00:00.000Z',
      mode: 'stub',
      intent: 'general',
    });
    assert.equal(ok.ok, true);

    const bad = validateContextPackage({ query: 'q', citations: [], assembledAt: '' });
    assert.equal(bad.ok, false);
  });

  it('filterCitationsToCorpus drops unknown sourceIds', () => {
    const filtered = filterCitationsToCorpus(
      [
        { citationId: 'CIT-1', sourceId: 'A', snippet: 'a', score: 1 },
        { citationId: 'CIT-2', sourceId: 'B', snippet: 'b', score: 1 },
      ],
      ['A']
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].sourceId, 'A');
  });

  it('assembleContextPackage returns valid Wave C+ package', () => {
    const pkg = assembleContextPackage({
      query: 'capacity',
      corpus: [{ id: 'DOC-1', text: 'available capacity hours' }],
      topK: 3,
    });
    const v = validateContextPackage(pkg);
    assert.equal(v.ok, true, v.errors?.join('; '));
    assert.equal(pkg.mode, 'stub');
    assert.ok(pkg.intent);
    assert.equal(pkg.stub, true);
  });
});
