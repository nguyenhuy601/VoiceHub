const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  listJobs,
  runJob,
  SUPPORTED_JOBS,
} = require('../../src/jobs/jobRegistry');

describe('jobRegistry (phase-only stub)', () => {
  it('lists only phase_what / phase_how', () => {
    const names = listJobs();
    assert.deepEqual(names.sort(), ['phase_how', 'phase_what'].sort());
    assert.ok(SUPPORTED_JOBS.has('phase_how'));
    assert.ok(SUPPORTED_JOBS.has('phase_what'));
    assert.equal(SUPPORTED_JOBS.size, 2);
  });

  it('runJob rejects per-job execute', async () => {
    await assert.rejects(
      () => runJob('effortRoleAnalysis', { container: {} }),
      (err) => err.code === 'PHASE_ONLY_RUNS'
    );
  });
});
