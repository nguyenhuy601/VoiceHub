const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PACK_LIST_LIMIT,
  PACK_LIST_SELECT,
  PACK_WIZARD_SELECT,
  queryRequirementPackList,
  mapRequirementPackList,
  ensurePlanningReadinessOnListRows,
  hasStoredReadiness,
  toRequirementPackWizardItem,
} = require('../src/utils/requirementPackList');

function fatPackRow(overrides = {}) {
  return {
    _id: 'pack-1',
    status: 'draft',
    templateVersion: '1.2',
    sourceFileName: 'req.xlsx',
    projectId: null,
    createdBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    overview: {
      requirementName: 'Portal',
      deadline: new Date('2026-06-01'),
      startDate: new Date('2026-02-01'),
      platform: ['Web'],
      priority: 'High',
      projectObjective: 'x'.repeat(4000),
    },
    aiPlanning: {
      status: 'ready',
      overlay: { engine: 'heuristic', roles: [{ roleKey: 'frontend_developer' }] },
      generatedAt: new Date('2026-01-02'),
    },
    excelPreview: { sheets: [{ name: 'Functional', rows: [{ cells: ['huge'] }] }] },
    previewTree: { nodes: [{ id: 'FR-001' }] },
    importIssues: [{ code: 'REQ_X' }],
    planningReadiness: {
      score: 100,
      readyForHeuristic: true,
      readyForFullEngine: true,
      leafCount: 1,
      leavesWithHours: 1,
      allLeavesStaffed: true,
      missingLeafIds: [],
    },
    ...overrides,
  };
}

function createFindChain(result) {
  const calls = {};
  const chain = {
    select(arg) {
      calls.select = arg;
      return chain;
    },
    sort(arg) {
      calls.sort = arg;
      return chain;
    },
    limit(arg) {
      calls.limit = arg;
      return chain;
    },
    lean() {
      return Promise.resolve(result);
    },
  };
  return {
    calls,
    model: {
      find(filter) {
        calls.filter = filter;
        return chain;
      },
    },
  };
}

describe('requirementPackList select', () => {
  it('excludes Mixed blobs and FR arrays from inclusion select', () => {
    assert.equal(PACK_LIST_SELECT.includes('excelPreview'), false);
    assert.equal(PACK_LIST_SELECT.includes('previewTree'), false);
    assert.equal(PACK_LIST_SELECT.includes('importIssues'), false);
    assert.equal(PACK_LIST_SELECT.includes('overlay'), false);
    assert.equal(PACK_LIST_SELECT.includes('functionalRequirements'), false);
    assert.equal(PACK_LIST_SELECT.includes('staffingPlan'), false);
    assert.ok(PACK_LIST_SELECT.includes('planningReadiness'));
    assert.ok(PACK_LIST_SELECT.includes('overview.requirementName'));
  });
});

describe('PACK_WIZARD_SELECT', () => {
  it('includes overview + aiPlanning overlay path, excludes FR and preview blobs', () => {
    assert.ok(PACK_WIZARD_SELECT.includes('overview'));
    assert.ok(PACK_WIZARD_SELECT.includes('aiPlanning'));
    assert.ok(PACK_WIZARD_SELECT.includes('planningReadiness'));
    assert.equal(PACK_WIZARD_SELECT.includes('functionalRequirements'), false);
    assert.equal(PACK_WIZARD_SELECT.includes('excelPreview'), false);
    assert.equal(PACK_WIZARD_SELECT.includes('previewTree'), false);
    assert.equal(PACK_WIZARD_SELECT.includes('staffingPlan'), false);
  });
});

describe('toRequirementPackWizardItem', () => {
  it('maps slim wizard DTO with overlay and projectObjective', () => {
    const item = toRequirementPackWizardItem(fatPackRow());
    assert.equal(item._id, 'pack-1');
    assert.equal(item.overview.requirementName, 'Portal');
    assert.equal(item.overview.projectObjective.length, 4000);
    assert.equal(item.aiPlanning.status, 'ready');
    assert.equal(item.aiPlanning.overlay.engine, 'heuristic');
    assert.equal(item.planningReadiness.score, 100);
    assert.equal('excelPreview' in item, false);
    assert.equal('functionalRequirements' in item, false);
    assert.equal('previewTree' in item, false);
  });

  it('does not invent readiness without FR when stored summary missing', () => {
    const item = toRequirementPackWizardItem(
      fatPackRow({ planningReadiness: null, functionalRequirements: undefined })
    );
    assert.equal(item.planningReadiness, null);
  });
});

describe('queryRequirementPackList', () => {
  it('finds with select, sort updatedAt, and limit 100', async () => {
    const rows = [fatPackRow()];
    const { model, calls } = createFindChain(rows);
    const filter = { organizationId: 'org-1', isActive: true };
    const result = await queryRequirementPackList(model, filter);
    assert.deepEqual(calls.filter, filter);
    assert.equal(calls.select, PACK_LIST_SELECT);
    assert.deepEqual(calls.sort, { updatedAt: -1 });
    assert.equal(calls.limit, PACK_LIST_LIMIT);
    assert.equal(calls.limit, 100);
    assert.equal(result, rows);
  });
});

describe('mapRequirementPackList', () => {
  it('returns slim DTO from denormalized planningReadiness', () => {
    const [item] = mapRequirementPackList([fatPackRow()]);
    assert.equal(item._id, 'pack-1');
    assert.equal(item.status, 'draft');
    assert.equal(item.overview.requirementName, 'Portal');
    assert.equal(item.sourceFileName, 'req.xlsx');
    assert.equal('excelPreview' in item, false);
    assert.equal('previewTree' in item, false);
    assert.equal('importIssues' in item, false);
    assert.equal('functionalRequirements' in item, false);
    assert.equal('staffingPlan' in item, false);
    assert.equal(item.aiPlanning.status, 'ready');
    assert.equal('overlay' in item.aiPlanning, false);
    assert.equal(item.planningReadiness.score, 100);
    assert.equal(item.planningReadiness.allLeavesStaffed, true);
    assert.equal(item.planningReadiness.leafCount, 1);
  });

  it('uses stored unreadiness without FR hydrate', () => {
    const [item] = mapRequirementPackList([
      fatPackRow({
        planningReadiness: {
          score: 40,
          readyForHeuristic: true,
          readyForFullEngine: false,
          leafCount: 1,
          leavesWithHours: 0,
          allLeavesStaffed: false,
          missingLeafIds: ['FR-010'],
        },
      }),
    ]);
    assert.equal(item.planningReadiness.allLeavesStaffed, false);
    assert.ok(item.planningReadiness.missingLeafIds.includes('FR-010'));
  });
});

describe('ensurePlanningReadinessOnListRows', () => {
  it('backfills missing summary from FR batch and returns enriched rows', async () => {
    const ops = [];
    const model = {
      find(filter) {
        assert.deepEqual(filter._id.$in.map(String), ['pack-legacy']);
        return {
          select() {
            return this;
          },
          lean() {
            return Promise.resolve([
              {
                _id: 'pack-legacy',
                overview: { deadline: new Date('2026-06-01'), platform: ['Web'] },
                staffingPlan: {},
                functionalRequirements: [
                  {
                    externalId: 'FR-010',
                    level: 'Task',
                    parentExternalId: '',
                    name: 'Query',
                    suggestedSkills: ['SQL'],
                    estimateHours: 4,
                    suggestedRoleKey: 'backend_developer',
                  },
                ],
              },
            ]);
          },
        };
      },
      bulkWrite(bulkOps) {
        ops.push(...bulkOps);
        return Promise.resolve({ ok: 1 });
      },
    };

    const rows = [
      {
        _id: 'pack-legacy',
        status: 'draft',
        overview: { requirementName: 'Legacy' },
        aiPlanning: { status: 'none' },
      },
    ];
    const ensured = await ensurePlanningReadinessOnListRows(model, rows);
    assert.equal(hasStoredReadiness(ensured[0]), true);
    assert.equal(ensured[0].planningReadiness.allLeavesStaffed, true);
    assert.equal(ops.length, 1);
  });
});
