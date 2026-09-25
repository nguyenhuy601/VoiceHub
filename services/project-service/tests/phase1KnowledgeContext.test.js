/**
 * phase1KnowledgeContext — stub citations + feedback sanitize (no Mongo).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assemblePhase1KnowledgeContext,
  formatKnowledgeCitationsBlock,
  toPersistedKnowledgeMeta,
  sanitizePhase1Feedback,
  isPhase1KnowledgeStubEnabled,
  FEEDBACK_MAX,
} = require('../src/utils/aiAnalysis/phase1KnowledgeContext');

describe('phase1KnowledgeContext', () => {
  it('assembles capped citations from corpus + catalog without full dump', () => {
    const pack = {
      aiAnalysis: {
        intakeCorpus: {
          excerpts: [
            { filename: 'a.txt', text: 'x'.repeat(500) },
            { filename: 'b.txt', text: 'hello world' },
          ],
        },
      },
    };
    const knowledge = assemblePhase1KnowledgeContext({
      pack,
      skillCatalog: { version: 'v1', skills: ['Node', 'React'] },
      topK: 3,
    });
    assert.equal(knowledge.stub, true);
    assert.ok(knowledge.citationCount <= 3);
    assert.ok(knowledge.citations[0].snippet.length <= 200);
    assert.ok(!JSON.stringify(knowledge).includes('x'.repeat(400)));
    const meta = toPersistedKnowledgeMeta(knowledge);
    assert.equal(meta.citationCount, knowledge.citationCount);
    assert.ok(Array.isArray(meta.citationIds));
    assert.ok(!Object.prototype.hasOwnProperty.call(meta, 'citations'));
  });

  it('formatKnowledgeCitationsBlock lists ids', () => {
    const block = formatKnowledgeCitationsBlock({
      stub: true,
      citations: [
        {
          id: 'c-corpus-1',
          source: 'intake_corpus',
          filename: 'a.txt',
          snippet: 'scope text',
        },
      ],
    });
    assert.match(block, /KNOWLEDGE_CITATIONS/);
    assert.match(block, /c-corpus-1/);
  });

  it('sanitizePhase1Feedback clamps and strips controls', () => {
    const cleaned = sanitizePhase1Feedback(`ok\u0000feedback${'y'.repeat(3000)}`);
    assert.ok(cleaned.length <= FEEDBACK_MAX);
    assert.ok(!cleaned.includes('\u0000'));
    assert.match(cleaned, /^ok/);
  });

  it('PHASE1_KNOWLEDGE_STUB env gate', () => {
    const prev = process.env.PHASE1_KNOWLEDGE_STUB;
    try {
      delete process.env.PHASE1_KNOWLEDGE_STUB;
      assert.equal(isPhase1KnowledgeStubEnabled(), true);
      process.env.PHASE1_KNOWLEDGE_STUB = '0';
      assert.equal(isPhase1KnowledgeStubEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.PHASE1_KNOWLEDGE_STUB;
      else process.env.PHASE1_KNOWLEDGE_STUB = prev;
    }
  });
});
