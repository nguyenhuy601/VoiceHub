/**
 * ensureAiAnalysisContainer must preserve Phase1 intake corpus (not wipe on save).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureAiAnalysisContainer,
} = require('../src/utils/aiAnalysis/aiAnalysisContainer');

describe('ensureAiAnalysisContainer intake preserve', () => {
  it('keeps intakeCorpus + inputDocuments + phaseRuns across ensure', () => {
    const raw = {
      schemaVersion: 2,
      intakeCorpus: {
        schemaVersion: 'intakeCorpus.v1',
        excerpts: [{ filename: 'a.xlsx', text: 'hello student enrollment', chars: 24 }],
        totalChars: 24,
        skipped: [],
      },
      inputDocuments: [
        { documentId: 'd1', filename: 'a.xlsx', docClass: 'customer_raw' },
      ],
      skillCatalogStub: { version: 'v1', skills: [] },
      sources: { skillCatalog: { version: 'v1', skillCount: 0 } },
      phaseRuns: { phase_what: { status: 'ready', mode: 'prepare_only' } },
      analyses: {
        evidenceSpans: [{ id: 'e-span-1-1', snippet: 'hello' }],
        phase1Knowledge: { stub: true, citationCount: 1 },
      },
    };

    const out = ensureAiAnalysisContainer(raw);
    assert.equal(out.intakeCorpus.totalChars, 24);
    assert.equal(out.intakeCorpus.excerpts.length, 1);
    assert.equal(out.inputDocuments.length, 1);
    assert.equal(out.inputDocuments[0].filename, 'a.xlsx');
    assert.equal(out.skillCatalogStub.version, 'v1');
    assert.equal(out.phaseRuns.phase_what.mode, 'prepare_only');
    assert.equal(out.analyses.evidenceSpans[0].id, 'e-span-1-1');
    assert.equal(out.analyses.phase1Knowledge.citationCount, 1);
  });
});
