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

function epicFeatureStoryTaskTree(overrides = {}) {
  return {
    overview: baseOverview,
    templateVersion: '1.2',
    functionalRequirements: [
      {
        externalId: 'FR-001',
        level: 'Epic',
        parentExternalId: '',
        name: 'Auth',
        description: '',
        priority: 'High',
        _rowNumber: 2,
      },
      {
        externalId: 'FR-002',
        level: 'Feature',
        parentExternalId: 'FR-001',
        name: 'Login feature',
        description: '',
        priority: 'High',
        _rowNumber: 3,
      },
      {
        externalId: 'FR-003',
        level: 'Story',
        parentExternalId: 'FR-002',
        name: 'Login story',
        description: 'As a user',
        priority: 'High',
        suggestedRoleKey: 'product_owner',
        _rowNumber: 4,
      },
      {
        externalId: 'FR-004',
        level: 'Task',
        parentExternalId: 'FR-003',
        name: 'Login email',
        description: 'Desc',
        priority: 'High',
        suggestedSkills: ['React'],
        estimateHours: 8,
        suggestedRoleKey: 'frontend_developer',
        _rowNumber: 5,
        ...overrides.task,
      },
    ],
  };
}

describe('requirementTemplateValidate', () => {
  it('rejects orphan Parent ID', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      templateVersion: '1.2',
      functionalRequirements: [
        {
          externalId: 'FR-004',
          level: 'Task',
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

  it('rejects invalid hierarchy Task under Epic', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      templateVersion: '1.2',
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Epic',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          _rowNumber: 2,
        },
        {
          externalId: 'FR-004',
          level: 'Task',
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

  it('Epic/Feature without role is valid; optional role accepts any known project role', () => {
    const noRole = validateBusinessLayer({
      overview: baseOverview,
      templateVersion: '1.2',
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Epic',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          _rowNumber: 2,
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Login',
          description: '',
          priority: 'High',
          _rowNumber: 3,
        },
      ],
    });
    assert.equal(noRole.some((i) => i.severity === 'error'), false);

    const withDevRole = validateBusinessLayer({
      overview: baseOverview,
      templateVersion: '1.2',
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Epic',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          suggestedRoleKey: 'frontend_developer',
          _rowNumber: 2,
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Login',
          description: '',
          priority: 'High',
          suggestedRoleKey: 'technical_lead',
          _rowNumber: 3,
        },
      ],
    });
    assert.equal(withDevRole.some((i) => i.severity === 'error'), false);
  });

  it('errors when Task missing skills hours or role', () => {
    const issues = validateBusinessLayer(
      epicFeatureStoryTaskTree({
        task: {
          suggestedSkills: [],
          estimateHours: null,
          suggestedRoleKey: '',
        },
      })
    );
    assert.ok(issues.some((i) => i.code === 'REQ_FR_LEAF_SKILLS_REQUIRED' && i.severity === 'error'));
    assert.ok(issues.some((i) => i.code === 'REQ_FR_LEAF_HOURS_REQUIRED' && i.severity === 'error'));
    assert.ok(issues.some((i) => i.code === 'REQ_FR_LEAF_ROLE_REQUIRED' && i.severity === 'error'));
  });

  it('errors on unknown skill and role', () => {
    const issues = validateBusinessLayer(
      epicFeatureStoryTaskTree({
        task: {
          suggestedSkills: ['UnknownSkillX'],
          estimateHours: 8,
          suggestedRoleKey: 'unknown_role_x',
        },
      })
    );
    assert.ok(issues.some((i) => i.code === 'REQ_FR_NEW_SKILL' && i.severity === 'warning'));
    assert.equal(issues.some((i) => i.code === 'REQ_FR_UNKNOWN_SKILL' && i.severity === 'error'), false);
    assert.ok(issues.some((i) => i.code === 'REQ_FR_UNKNOWN_ROLE' && i.severity === 'error'));
  });

  it('maps legacy v1.1 Module/Feature/Requirement levels via alias', () => {
    const issues = validateBusinessLayer({
      overview: baseOverview,
      templateVersion: '1.1',
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
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: 'frontend_developer',
          _rowNumber: 5,
        },
      ],
    });
    assert.equal(issues.some((i) => i.code === 'REQ_FR_INVALID_LEVEL' && i.severity === 'error'), false);
    assert.equal(issues.some((i) => i.severity === 'error'), false);
  });

  it('builds preview tree from ID/Parent ID', () => {
    const tree = buildFunctionalPreviewTree([
      {
        externalId: 'FR-001',
        level: 'Epic',
        parentExternalId: '',
        name: 'Authentication',
        sortOrder: 0,
      },
      {
        externalId: 'FR-003',
        level: 'Story',
        parentExternalId: 'FR-001',
        name: 'Login',
        sortOrder: 1,
      },
      {
        externalId: 'FR-004',
        level: 'Task',
        parentExternalId: 'FR-003',
        name: 'Login with email',
        sortOrder: 2,
        estimateHours: 8,
      },
    ]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].externalId, 'FR-001');
    assert.equal(tree[0].children[0].externalId, 'FR-003');
    assert.equal(tree[0].children[0].children[0].externalId, 'FR-004');
  });
});
