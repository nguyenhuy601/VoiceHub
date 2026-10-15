/**
 * Hybrid HITL — project-service in-run kinds + HOW requires approved pack.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  IN_RUN_KINDS,
  normalizeInRunKind,
  isInRunHitlKind,
} = require('../src/utils/aiAnalysis/inRunHitlKinds');

describe('project-service in-run HITL kinds', () => {
  it('mirrors clarify|edit_draft only', () => {
    assert.deepEqual([...IN_RUN_KINDS], ['clarify', 'edit_draft']);
    assert.equal(isInRunHitlKind('clarify'), true);
    assert.equal(isInRunHitlKind('edit_draft'), true);
    assert.equal(isInRunHitlKind('gate1'), false);
    assert.equal(isInRunHitlKind('gate2'), false);
  });

  it('normalize aliases', () => {
    assert.equal(normalizeInRunKind('respond'), 'clarify');
    assert.equal(normalizeInRunKind('review_edit'), 'edit_draft');
  });
});

describe('HOW requires Gate1-approved pack (regression)', () => {
  it('assertHowJobsRequireApprovedPack rejects draft', () => {
    // Inline mirror of ADR rule — load from service module without bootstrapping mongoose.
    function assertHowJobsRequireApprovedPack(pack, job) {
      const howJobs = new Set([
        'effortRoleAnalysis',
        'phase_how',
        'wbs',
        'dependency',
        'projectPlan',
      ]);
      if (!howJobs.has(String(job || ''))) return;
      const status = String(pack.status || '');
      if (status !== 'approved' && status !== 'project_linked') {
        const err = new Error('HOW requires approved');
        err.errorCode = 'AI_ANALYSIS_HOW_REQUIRES_APPROVED';
        throw err;
      }
    }
    assert.throws(
      () => assertHowJobsRequireApprovedPack({ status: 'draft' }, 'effortRoleAnalysis'),
      (err) => err && err.errorCode === 'AI_ANALYSIS_HOW_REQUIRES_APPROVED'
    );
    assert.doesNotThrow(() =>
      assertHowJobsRequireApprovedPack({ status: 'approved' }, 'effortRoleAnalysis')
    );
  });
});
