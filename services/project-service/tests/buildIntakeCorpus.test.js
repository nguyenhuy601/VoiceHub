/**
 * buildIntakeCorpus — cap + priority (mock getBuffer).
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildIntakeCorpus,
  formatIntakeCorpusBlock,
  buildWhatIntakePromptBlock,
  resolveWhatIntakePromptMaxChars,
  TOTAL_MAX_CHARS,
  DEFAULT_WHAT_INTAKE_PROMPT_MAX_CHARS,
} = require('../src/utils/aiAnalysis/buildIntakeCorpus');

describe('buildIntakeCorpus', () => {
  it('builds excerpts preferring customer_raw and caps total', async () => {
    const docs = [
      {
        _id: '1',
        filename: 'ref.txt',
        docClass: 'reference_attachment',
        storageKey: 'k/ref',
      },
      {
        _id: '2',
        filename: 'raw.txt',
        docClass: 'customer_raw',
        storageKey: 'k/raw',
      },
    ];
    const corpus = await buildIntakeCorpus(docs, {
      getBuffer: async (key) => {
        if (key === 'k/raw') return Buffer.from('RAW CONTENT PRIORITY', 'utf8');
        return Buffer.from('REF CONTENT', 'utf8');
      },
    });
    assert.ok(corpus.excerpts.length >= 1);
    assert.equal(corpus.excerpts[0].filename, 'raw.txt');
    assert.match(corpus.excerpts[0].text, /RAW CONTENT/);
    assert.ok(corpus.totalChars > 0);
    assert.ok(corpus.totalChars <= TOTAL_MAX_CHARS);
  });

  it('skips missing storageKey', async () => {
    const corpus = await buildIntakeCorpus(
      [{ filename: 'x.txt', docClass: 'customer_file', storageKey: '' }],
      { getBuffer: async () => Buffer.from('x') }
    );
    assert.equal(corpus.excerpts.length, 0);
    assert.ok(corpus.skipped.some((s) => s.reason === 'no_storage_key'));
  });

  it('formatIntakeCorpusBlock wraps excerpts', () => {
    const block = formatIntakeCorpusBlock({
      excerpts: [{ filename: 'a.txt', text: 'hello' }],
    });
    assert.match(block, /INTAKE_CORPUS/);
    assert.match(block, /hello/);
  });
});

describe('buildWhatIntakePromptBlock', () => {
  const prevMax = process.env.WHAT_INTAKE_PROMPT_MAX_CHARS;
  const prevCorpus = process.env.WHAT_INTAKE_CORPUS;

  afterEach(() => {
    if (prevMax === undefined) delete process.env.WHAT_INTAKE_PROMPT_MAX_CHARS;
    else process.env.WHAT_INTAKE_PROMPT_MAX_CHARS = prevMax;
    if (prevCorpus === undefined) delete process.env.WHAT_INTAKE_CORPUS;
    else process.env.WHAT_INTAKE_CORPUS = prevCorpus;
  });

  it('returns empty for empty excerpts', () => {
    assert.equal(buildWhatIntakePromptBlock({ excerpts: [] }, { maxChars: 8000 }), '');
    assert.equal(buildWhatIntakePromptBlock(null, { maxChars: 8000 }), '');
  });

  it('respects maxChars budget', () => {
    const block = buildWhatIntakePromptBlock(
      { excerpts: [{ filename: 'big.txt', text: 'x'.repeat(5000) }] },
      { maxChars: 500 }
    );
    assert.match(block, /INTAKE_CORPUS/);
    assert.ok(block.length <= 500);
  });

  it('accepts pack-shaped source', () => {
    const block = buildWhatIntakePromptBlock(
      {
        aiAnalysis: {
          intakeCorpus: { excerpts: [{ filename: 'a.txt', text: 'from pack' }] },
        },
      },
      { maxChars: 8000 }
    );
    assert.match(block, /from pack/);
  });

  it('maxChars 0 disables inject', () => {
    assert.equal(
      buildWhatIntakePromptBlock(
        { excerpts: [{ filename: 'a.txt', text: 'hi' }] },
        { maxChars: 0 }
      ),
      ''
    );
  });

  it('WHAT_INTAKE_PROMPT_MAX_CHARS=0 disables via resolve', () => {
    process.env.WHAT_INTAKE_CORPUS = '1';
    process.env.WHAT_INTAKE_PROMPT_MAX_CHARS = '0';
    assert.equal(resolveWhatIntakePromptMaxChars(), 0);
    assert.equal(
      buildWhatIntakePromptBlock({ excerpts: [{ filename: 'a.txt', text: 'hi' }] }),
      ''
    );
  });

  it('default max chars is 8000 when env unset', () => {
    process.env.WHAT_INTAKE_CORPUS = '1';
    delete process.env.WHAT_INTAKE_PROMPT_MAX_CHARS;
    assert.equal(resolveWhatIntakePromptMaxChars(), DEFAULT_WHAT_INTAKE_PROMPT_MAX_CHARS);
  });
});
