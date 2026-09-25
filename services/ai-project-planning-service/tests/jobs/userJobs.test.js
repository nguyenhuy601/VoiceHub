const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  listJobs,
  runJob,
  SUPPORTED_JOBS,
  USER_JOB_NAMES,
} = require('../../src/jobs/jobRegistry');

describe('user jobs registry (phase-only)', () => {
  it('SUPPORTED_JOBS is phase-only (no 12 user jobs)', () => {
    assert.equal(USER_JOB_NAMES.length, 0);
    assert.equal(SUPPORTED_JOBS.size, 2);
    assert.ok(SUPPORTED_JOBS.has('phase_what'));
    assert.ok(SUPPORTED_JOBS.has('phase_how'));
    assert.deepEqual(listJobs().sort(), ['phase_how', 'phase_what'].sort());
  });

  it('runJob rejects legacy job names', async () => {
    await assert.rejects(
      () => runJob('wbsGeneration', { container: {} }),
      (err) => err.code === 'PHASE_ONLY_RUNS'
    );
  });
});
