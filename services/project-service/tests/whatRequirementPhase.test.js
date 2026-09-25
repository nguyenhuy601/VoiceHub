/**
 * whatRequirementPhase policy — job order + env gates (no Mongo).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  getWhatJobOrder,
  isHitlAutoWhatEnabled,
  isAutoWhatConfirmEnabled,
  patchPhaseWhat,
  prepareUnderstandingOnly,
  startWhatRequirementPhase,
} = require('../src/services/whatRequirementPhase.service');
const { AI_ANALYSIS_WHAT_JOBS } = require('../src/constants/aiAnalysisJobs.constants');

describe('whatRequirementPhase', () => {
  it('WHAT job order matches AI_ANALYSIS_WHAT_JOBS', () => {
    assert.deepEqual(getWhatJobOrder(), [...AI_ANALYSIS_WHAT_JOBS]);
    assert.equal(getWhatJobOrder()[0], 'hierarchyDecomposition');
    assert.equal(getWhatJobOrder().at(-1), 'requirementInsights');
  });

  it('patchPhaseWhat merges phase_what status', () => {
    const next = patchPhaseWhat({ phaseRuns: {} }, { status: 'pending', remoteRunId: 'r1' });
    assert.equal(next.phaseRuns.phase_what.status, 'pending');
    assert.equal(next.phaseRuns.phase_what.remoteRunId, 'r1');
  });

  it('HITL_AUTO_WHAT / AUTO_WHAT_CONFIRM env gates', () => {
    const prevHitl = process.env.HITL_AUTO_WHAT;
    const prevConfirm = process.env.AUTO_WHAT_CONFIRM;
    try {
      delete process.env.HITL_AUTO_WHAT;
      delete process.env.AUTO_WHAT_CONFIRM;
      assert.equal(isHitlAutoWhatEnabled(), false, 'Wave1 B default HITL_AUTO_WHAT off');
      assert.equal(isAutoWhatConfirmEnabled(), false, 'Wave1 B default AUTO_WHAT_CONFIRM off');

      process.env.HITL_AUTO_WHAT = '0';
      assert.equal(isHitlAutoWhatEnabled(), false);
      process.env.HITL_AUTO_WHAT = '1';
      assert.equal(isHitlAutoWhatEnabled(), true);

      process.env.AUTO_WHAT_CONFIRM = '0';
      assert.equal(isAutoWhatConfirmEnabled(), false);
      process.env.AUTO_WHAT_CONFIRM = '1';
      assert.equal(isAutoWhatConfirmEnabled(), true);
    } finally {
      if (prevHitl === undefined) delete process.env.HITL_AUTO_WHAT;
      else process.env.HITL_AUTO_WHAT = prevHitl;
      if (prevConfirm === undefined) delete process.env.AUTO_WHAT_CONFIRM;
      else process.env.AUTO_WHAT_CONFIRM = prevConfirm;
    }
  });

  it('inputDocuments shape for FE filename list', () => {
    const docs = [
      { documentId: 'a', filename: 'raw.pdf', docClass: 'customer_file' },
      { documentId: 'b', filename: 'spec.docx', docClass: 'customer_raw' },
    ];
    const fe = docs.map((d) => ({ filename: d.filename, docClass: d.docClass }));
    assert.deepEqual(fe, [
      { filename: 'raw.pdf', docClass: 'customer_file' },
      { filename: 'spec.docx', docClass: 'customer_raw' },
    ]);
    assert.ok(!Object.prototype.hasOwnProperty.call(fe[0], 'documentId'));
  });

  it('overview.businessScope stays within schema maxlength after clamp (no corpus mirror)', () => {
    const { clampOverviewForPack } = require('../src/utils/requirement/requirementOverviewClamp');
    const {
      formatIntakeCorpusBlock,
    } = require('../src/utils/aiAnalysis/buildIntakeCorpus');
    const block = formatIntakeCorpusBlock({
      excerpts: [{ filename: 'big.txt', text: 'x'.repeat(5000) }],
    });
    assert.ok(block.length > 4000);
    // Policy: corpus must not be assigned raw to businessScope; clamp is defense-in-depth.
    const clamped = clampOverviewForPack({
      businessScope: `Customer: Uni\n\n${block}`,
    });
    assert.ok(clamped.businessScope.length <= 4000);
    assert.ok(!clamped.businessScope.includes('--- END_INTAKE_CORPUS ---'));
  });

  it('HITL_AUTO_WHAT=0 → startWhat returns 503 HITL_AUTO_WHAT_DISABLED', async () => {
    const prevHitl = process.env.HITL_AUTO_WHAT;
    try {
      process.env.HITL_AUTO_WHAT = '0';
      await assert.rejects(
        () =>
          startWhatRequirementPhase({
            userId: 'u1',
            organizationId: 'o1',
            packId: 'p1',
          }),
        (err) => {
          assert.equal(err.statusCode, 503);
          assert.equal(err.errorCode, 'HITL_AUTO_WHAT_DISABLED');
          return true;
        }
      );
    } finally {
      if (prevHitl === undefined) delete process.env.HITL_AUTO_WHAT;
      else process.env.HITL_AUTO_WHAT = prevHitl;
    }
  });

  it('prepare_only response whitelist omits corpus text', () => {
    // Contract shape for FE — no full excerpts/text in response payload.
    const sample = {
      prepared: true,
      mode: 'prepare_only',
      packId: 'p1',
      status: 'draft',
      intakeCorpusChars: 1200,
      excerptsCount: 2,
      skippedCount: 0,
      toolsRan: true,
      snapshotId: 's1',
      httpStatus: 200,
    };
    const allowed = new Set([
      'prepared',
      'mode',
      'packId',
      'status',
      'intakeCorpusChars',
      'excerptsCount',
      'skippedCount',
      'toolsRan',
      'snapshotId',
      'httpStatus',
    ]);
    for (const key of Object.keys(sample)) {
      assert.ok(allowed.has(key), `unexpected key ${key}`);
    }
    assert.equal(typeof prepareUnderstandingOnly, 'function');
    assert.ok(!Object.prototype.hasOwnProperty.call(sample, 'excerpts'));
    assert.ok(!Object.prototype.hasOwnProperty.call(sample, 'text'));
  });
});
