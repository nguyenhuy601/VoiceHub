const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tokenize } = require('../src/retrieval/tokenize');
const {
  retrieveKeyword,
  INTENT_BOOST,
} = require('../src/retrieval/retrieveKeyword');
const { retrieveHybrid } = require('../src/retrieval/retrieveHybrid');
const { runG7Pipeline } = require('../src/retrieval/runG7Pipeline');
const { filterCitationsToCorpus } = require('../src/retrieval/g7PipelineSchemas');

describe('tokenize', () => {
  it('lowercases and drops short tokens', () => {
    assert.deepEqual(tokenize('React & Go AI'), ['react', 'go', 'ai']);
  });
});

describe('retrieveKeyword', () => {
  it('ranks BM25-lite hits above unrelated docs', () => {
    const corpus = [
      { id: 'A', text: 'available capacity hours for planning', docType: 'metric_def' },
      { id: 'B', text: 'unrelated cooking recipe', docType: 'skill_def' },
      { id: 'C', text: 'capacity capacity capacity hours', docType: 'metric_def' },
    ];
    const { docs } = retrieveKeyword({
      query: 'capacity hours',
      corpus,
      intent: 'metric_def',
    });
    assert.ok(docs.length >= 2);
    assert.equal(docs[0].sourceId, 'C');
    assert.ok(docs[0].score > docs[1].score);
    assert.ok(!docs.some((d) => d.sourceId === 'B'));
  });

  it('boosts preferred docType for intent without dropping others', () => {
    const corpus = [
      { id: 'S1', text: 'React skill framework', docType: 'skill_def' },
      { id: 'M1', text: 'React metric unused', docType: 'metric_def' },
    ];
    const { docs } = retrieveKeyword({
      query: 'React',
      corpus,
      intent: 'skill_def',
    });
    assert.equal(docs.length, 2);
    assert.equal(docs[0].sourceId, 'S1');
    assert.ok(docs[0].score >= docs[1].score + INTENT_BOOST - 0.01);
  });

  it('RULE-C1 — only corpus sourceIds survive pipeline', async () => {
    const corpus = [{ id: 'DOC-1', text: 'skill React Native' }];
    const pkg = await runG7Pipeline({
      query: 'React',
      corpus,
      mode: 'keyword',
      topK: 5,
    });
    const allowed = new Set(['DOC-1']);
    const filtered = filterCitationsToCorpus(pkg.citations, allowed);
    assert.equal(filtered.length, pkg.citations.length);
    assert.ok(pkg.citations.every((c) => c.sourceId === 'DOC-1'));
  });
});

describe('retrieveHybrid', () => {
  it('merges keyword and stub hits; keeps higher score per sourceId', () => {
    const corpus = [
      { id: 'A', text: 'capacity planning window' },
      { id: 'B', text: 'something with substring capacity embedded' },
    ];
    const { docs, modeUsed } = retrieveHybrid({
      query: 'capacity',
      corpus,
      intent: 'general',
    });
    assert.equal(modeUsed, 'hybrid');
    const ids = new Set(docs.map((d) => d.sourceId));
    assert.ok(ids.has('A'));
    assert.ok(ids.has('B'));
    assert.equal(docs.filter((d) => d.sourceId === 'A').length, 1);
  });
});
