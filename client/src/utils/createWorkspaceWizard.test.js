import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ORG_NAME_MAX, validateWorkspaceStep } from './createWorkspaceWizard.js';

const validCounts = { branch: 1, divisionPerBranch: 1, departmentPerDivision: 2, teamPerDepartment: 2 };

function form(overrides = {}) {
  return { name: 'Acme', slug: 'acme', counts: validCounts, structureNames: ['HQ', 'Team A'], ...overrides };
}

describe('validateWorkspaceStep', () => {
  it('step 1 requires a name', () => {
    assert.deepEqual(validateWorkspaceStep(1, form({ name: '   ' })), {
      ok: false,
      errorKey: 'organizations.orgNameRequired',
      step: 1,
    });
  });

  it('step 1 enforces min and max length', () => {
    assert.equal(validateWorkspaceStep(1, form({ name: 'A' })).errorKey, 'organizations.wizardErrNameMin');
    assert.equal(
      validateWorkspaceStep(1, form({ name: 'a'.repeat(ORG_NAME_MAX + 1) })).errorKey,
      'organizations.wizardErrNameMax'
    );
    assert.equal(validateWorkspaceStep(1, form({ name: 'a'.repeat(ORG_NAME_MAX) })).ok, true);
  });

  it('step 2 requires slug of at least 3 chars', () => {
    assert.equal(validateWorkspaceStep(2, form({ slug: 'ab' })).errorKey, 'organizations.workspaceSlugMin');
    assert.equal(validateWorkspaceStep(2, form()).ok, true);
  });

  it('step 3 has no blocking validation', () => {
    assert.equal(validateWorkspaceStep(3, form({ name: '' })).ok, true);
  });

  it('step 4 rejects out-of-range counts', () => {
    const result = validateWorkspaceStep(4, form({ counts: { ...validCounts, branch: 21 } }));
    assert.equal(result.errorKey, 'organizations.wizardErrCountRange');
    assert.equal(validateWorkspaceStep(4, form({ counts: { ...validCounts, teamPerDepartment: 0 } })).ok, false);
  });

  it('step 4 rejects structure names over the limit', () => {
    const result = validateWorkspaceStep(4, form({ structureNames: ['ok', 'x'.repeat(ORG_NAME_MAX + 1)] }));
    assert.equal(result.errorKey, 'organizations.wizardErrNameMax');
  });

  it('final step re-validates every step and reports the failing one', () => {
    assert.deepEqual(validateWorkspaceStep(5, form({ slug: 'a' })), {
      ok: false,
      errorKey: 'organizations.workspaceSlugMin',
      step: 2,
    });
    assert.equal(validateWorkspaceStep(5, form()).ok, true);
  });
});
