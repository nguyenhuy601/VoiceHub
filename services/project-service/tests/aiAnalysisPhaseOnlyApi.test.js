const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.ORGANIZATION_SERVICE_URL ||= 'http://organization-service:3003';

const {
  runAiAnalysisJob,
  confirmAiAnalysisJob,
} = require('../src/services/aiAnalysis.service');

describe('AI Analysis phase-only API (job-by-job removed)', () => {
  it('runAiAnalysisJob rejects user jobs with JOB_BY_JOB_REMOVED', async () => {
    await assert.rejects(
      () =>
        runAiAnalysisJob({
          userId: 'u1',
          organizationId: 'o1',
          packId: '507f1f77bcf86cd799439011',
          job: 'wbsGeneration',
        }),
      (err) =>
        err.errorCode === 'JOB_BY_JOB_REMOVED' && Number(err.statusCode) === 410
    );
    await assert.rejects(
      () =>
        runAiAnalysisJob({
          userId: 'u1',
          organizationId: 'o1',
          packId: '507f1f77bcf86cd799439011',
          job: 'effortRoleAnalysis',
        }),
      (err) => err.errorCode === 'JOB_BY_JOB_REMOVED'
    );
  });

  it('confirmAiAnalysisJob rejects any job body including projectPlan', async () => {
    await assert.rejects(
      () =>
        confirmAiAnalysisJob({
          userId: 'u1',
          organizationId: 'o1',
          packId: '507f1f77bcf86cd799439011',
          job: 'scheduleCapacity',
        }),
      (err) =>
        err.errorCode === 'CONFIRM_ONLY_PROJECT_PLAN' &&
        Number(err.statusCode) === 409
    );
    await assert.rejects(
      () =>
        confirmAiAnalysisJob({
          userId: 'u1',
          organizationId: 'o1',
          packId: '507f1f77bcf86cd799439011',
          job: 'projectPlan',
        }),
      (err) => err.errorCode === 'CONFIRM_ONLY_PROJECT_PLAN'
    );
  });
});

describe('startWhatRequirementPhase job-by-job removed', () => {
  let prevHitl;
  beforeEach(() => {
    prevHitl = process.env.HITL_AUTO_WHAT;
  });
  afterEach(() => {
    if (prevHitl === undefined) delete process.env.HITL_AUTO_WHAT;
    else process.env.HITL_AUTO_WHAT = prevHitl;
  });

  it('returns 410 JOB_BY_JOB_REMOVED when HITL auto WHAT enabled', async () => {
    process.env.HITL_AUTO_WHAT = '1';
    const {
      startWhatRequirementPhase,
    } = require('../src/services/whatRequirementPhase.service');
    await assert.rejects(
      () =>
        startWhatRequirementPhase({
          userId: 'u1',
          organizationId: 'o1',
          packId: '507f1f77bcf86cd799439011',
        }),
      (err) =>
        err.errorCode === 'JOB_BY_JOB_REMOVED' && Number(err.statusCode) === 410
    );
  });
});
