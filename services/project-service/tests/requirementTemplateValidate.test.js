const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBusinessLayer,
  buildFunctionalPreviewTree,
} = require('../src/utils/requirementTemplateValidate');

const baseOverview = {
  requirementName: 'Test',
  projectObjective: 'Obj',
  businessScope: 'Scope',
  platform: 'Web',
  expectedUsers: '1000',
  deadline: '2026-12-30',
  priority: 'High',
};

describe('requirementTemplateValidate', () => {
  it('rejects orphan Parent ID', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      functionalRequirements: [
        {
          externalId: 'FR-004',
          level: 'Requirement',
          parentExternalId: 'FR-999',
          name: 'Login',
          description: 'Desc',
          priority: 'High',
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: 'frontend_developer',
          _rowNumber: 5,
        },
      ],
    });
    assert.ok(issues.some((i) => i.code === 'REQ_FR_ORPHAN_PARENT'));
  });

  it('rejects invalid hierarchy Requirement under Module', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          _rowNumber: 2,
        },
        {
          externalId: 'FR-004',
          level: 'Requirement',
          parentExternalId: 'FR-001',
          name: 'Login',
          description: 'Desc',
          priority: 'High',
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: 'frontend_developer',
          _rowNumber: 5,
        },
      ],
    });
    assert.ok(issues.some((i) => i.code === 'REQ_FR_INVALID_HIERARCHY'));
  });

  it('errors when Requirement leaf missing skills hours or role', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          _rowNumber: 2,
        },
        {
          externalId: 'FR-003',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Login',
          description: '',
          priority: 'High',
          _rowNumber: 3,
        },
        {
          externalId: 'FR-004',
          level: 'Requirement',
          parentExternalId: 'FR-003',
          name: 'Login email',
          description: 'Desc',
          priority: 'High',
          suggestedSkills: [],
          estimateHours: null,
          suggestedRoleKey: '',
          _rowNumber: 5,
        },
      ],
    });
    assert.ok(issues.some((i) => i.code === 'REQ_FR_LEAF_SKILLS_REQUIRED' && i.severity === 'error'));
    assert.ok(issues.some((i) => i.code === 'REQ_FR_LEAF_HOURS_REQUIRED' && i.severity === 'error'));
    assert.ok(issues.some((i) => i.code === 'REQ_FR_LEAF_ROLE_REQUIRED' && i.severity === 'error'));
  });

  it('errors on unknown skill and role', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          _rowNumber: 2,
        },
        {
          externalId: 'FR-003',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Login',
          description: '',
          priority: 'High',
          _rowNumber: 3,
        },
        {
          externalId: 'FR-004',
          level: 'Requirement',
          parentExternalId: 'FR-003',
          name: 'Login email',
          description: 'Desc',
          priority: 'High',
          suggestedSkills: ['UnknownSkillX'],
          estimateHours: 8,
          suggestedRoleKey: 'unknown_role_x',
          _rowNumber: 5,
        },
      ],
    });
    assert.ok(issues.some((i) => i.code === 'REQ_FR_UNKNOWN_SKILL' && i.severity === 'error'));
    assert.ok(issues.some((i) => i.code === 'REQ_FR_UNKNOWN_ROLE' && i.severity === 'error'));
  });

  it('builds preview tree from ID/Parent ID', () => {
    const tree = buildFunctionalPreviewTree([
      {
        externalId: 'FR-001',
        level: 'Module',
        parentExternalId: '',
        name: 'Authentication',
        sortOrder: 0,
      },
      {
        externalId: 'FR-003',
        level: 'Feature',
        parentExternalId: 'FR-001',
        name: 'Login',
        sortOrder: 1,
      },
      {
        externalId: 'FR-004',
        level: 'Requirement',
        parentExternalId: 'FR-003',
        name: 'Login with email',
        sortOrder: 2,
      },
    ]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].externalId, 'FR-001');
    assert.equal(tree[0].children[0].externalId, 'FR-003');
    assert.equal(tree[0].children[0].children[0].externalId, 'FR-004');
  });
});
