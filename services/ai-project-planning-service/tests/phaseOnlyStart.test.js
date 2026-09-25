const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateStartBody,
} = require('../src/controllers/internalPlanning.controller');

describe('phase-only APS start', () => {
  const base = {
    packId: '507f1f77bcf86cd799439011',
    organizationId: '507f1f77bcf86cd799439012',
    snapshotId: '507f1f77bcf86cd799439013',
    input: { container: {} },
  };

  it('accepts phase_what and phase_how', () => {
    process.env.PROJECT_SERVICE_URL ||= 'http://project-service:3015';
    process.env.GATEWAY_INTERNAL_TOKEN ||= 'test-token';
    assert.equal(validateStartBody({ ...base, job: 'phase_what' }), 'phase_what');
    assert.equal(validateStartBody({ ...base, job: 'phase_how' }), 'phase_how');
  });

  it('rejects legacy user jobs with PHASE_ONLY_RUNS', () => {
    process.env.PROJECT_SERVICE_URL ||= 'http://project-service:3015';
    process.env.GATEWAY_INTERNAL_TOKEN ||= 'test-token';
    assert.throws(
      () => validateStartBody({ ...base, job: 'wbsGeneration' }),
      (err) => err.code === 'PHASE_ONLY_RUNS'
    );
    assert.throws(
      () => validateStartBody({ ...base, job: 'effortRoleAnalysis' }),
      (err) => err.code === 'PHASE_ONLY_RUNS'
    );
  });
});
