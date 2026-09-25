/**
 * phase1EvidenceRetrieve — Wave C unit tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  retrieveEvidenceContext,
  getPhase1RagMode,
} = require('../src/utils/aiAnalysis/phase1EvidenceRetrieve');

const spans = [
  {
    id: 'e-span-1-1',
    filename: 'a.txt',
    text: 'Student enrollment and course register portal',
    snippet: 'Student enrollment and course register portal',
  },
  {
    id: 'e-span-1-2',
    filename: 'b.txt',
    text: 'Warehouse inventory barcode scanning',
    snippet: 'Warehouse inventory barcode scanning',
  },
  {
    id: 'e-span-1-3',
    filename: 'c.txt',
    text: 'Payment gateway and invoice billing',
    snippet: 'Payment gateway and invoice billing',
  },
];

describe('phase1EvidenceRetrieve', () => {
  it('prefers spans matching query keywords', () => {
    const out = retrieveEvidenceContext({
      query: 'course register enrollment',
      spans,
      topK: 2,
      mode: 'stub',
    });
    assert.equal(out.ids[0], 'e-span-1-1');
    assert.ok(out.ids.every((id) => spans.some((s) => s.id === id)));
  });

  it('never invents ids outside input spans', () => {
    const out = retrieveEvidenceContext({
      query: 'payment invoice',
      spans,
      topK: 5,
      mode: 'stub',
    });
    const valid = new Set(spans.map((s) => s.id));
    for (const id of out.ids) assert.ok(valid.has(id));
  });

  it('PHASE1_RAG=off falls back to first-K order', () => {
    const out = retrieveEvidenceContext({
      query: 'payment invoice',
      spans,
      topK: 2,
      mode: 'off',
    });
    assert.deepEqual(out.ids, ['e-span-1-1', 'e-span-1-2']);
    assert.equal(out.mode, 'off');
  });

  it('PHASE1_RAG env gate', () => {
    const prev = process.env.PHASE1_RAG;
    try {
      delete process.env.PHASE1_RAG;
      assert.equal(getPhase1RagMode(), 'stub');
      process.env.PHASE1_RAG = 'off';
      assert.equal(getPhase1RagMode(), 'off');
    } finally {
      if (prev === undefined) delete process.env.PHASE1_RAG;
      else process.env.PHASE1_RAG = prev;
    }
  });
});
