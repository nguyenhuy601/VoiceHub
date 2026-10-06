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
      workbookDiagnostic: {
        status: 'SUCCESS',
        reasonCodes: [],
        rows: { validFr: 54 },
        mappingDiagnostic: { status: 'COMPLETE', mapped: ['id', 'requirement'], missing: [] },
      },
      phaseRuns: { phase_what: { status: 'ready', mode: 'prepare_only' } },
      canonicalRaw: { registryVersion: 'raw-sem-v1', templateVersion: '1.1-raw' },
      loop1Reuse: { schemaVersion: 1, snapshotId: 's1' },
      gate1: {
        activeSubmissionId: 'SUB-abc',
        activeReviewId: 'G1-REV-1',
        reviewPolicyVersion: 'GATE1-SOP-1.0',
      },
      gate2: {
        reviewLane: 'po',
        submittedBy: 'pm-1',
        reviewVersion: 2,
      },
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
    assert.equal(out.workbookDiagnostic.status, 'SUCCESS');
    assert.equal(out.workbookDiagnostic.rows.validFr, 54);
    assert.equal(out.skillCatalogStub.version, 'v1');
    assert.equal(out.phaseRuns.phase_what.mode, 'prepare_only');
    assert.equal(out.analyses.evidenceSpans[0].id, 'e-span-1-1');
    assert.equal(out.analyses.phase1Knowledge.citationCount, 1);
    assert.equal(out.canonicalRaw.registryVersion, 'raw-sem-v1');
    assert.equal(out.loop1Reuse.schemaVersion, 1);
    assert.equal(out.gate1.activeSubmissionId, 'SUB-abc');
    assert.equal(out.gate1.activeReviewId, 'G1-REV-1');
    assert.equal(out.gate2.reviewLane, 'po');
    assert.equal(out.gate2.submittedBy, 'pm-1');
    assert.equal(out.gate2.reviewVersion, 2);
  });
});
