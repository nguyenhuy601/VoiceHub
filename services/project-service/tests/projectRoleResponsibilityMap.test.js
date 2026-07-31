const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapProjectRoleToResponsibilities,
} = require('../../../shared/config/projectRoleResponsibilityMap');

describe('projectRoleResponsibilityMap', () => {
  it('maps developer family to backend/frontend', () => {
    assert.deepEqual(mapProjectRoleToResponsibilities('developer'), ['backend', 'frontend']);
    assert.deepEqual(mapProjectRoleToResponsibilities('senior_developer'), ['backend', 'frontend']);
  });

  it('maps tech lead to backend/frontend/architecture', () => {
    assert.deepEqual(mapProjectRoleToResponsibilities('tech_lead'), [
      'backend',
      'frontend',
      'architecture',
    ]);
  });

  it('returns empty list for roles without direct responsibility mapping', () => {
    assert.deepEqual(mapProjectRoleToResponsibilities('watcher'), []);
    assert.deepEqual(mapProjectRoleToResponsibilities('unknown_key'), []);
  });
});
