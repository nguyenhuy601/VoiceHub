/**
 * Shared fixtures for Sprint HOW multi-context tests (graph + enrich + policy).
 */

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sprintFixture(overrides = {}) {
  const base = {
    pack: {
      name: 'VoiceHub Demo',
      overview: { name: 'VoiceHub Demo' },
      businessGoals: [{ name: 'Giao Sprint 1' }],
      locale: 'vi',
    },
    container: {
      planning: {
        tasks: [
          { id: 'ST1', level: 'story', name: 'Đăng nhập', parentId: null, priority: 'high' },
          {
            id: 'ST1-t1',
            level: 'task',
            parentId: 'ST1',
            effortHours: 8,
            suggestedRoleKey: 'backend_developer',
          },
          {
            id: 'ST1-t2',
            level: 'task',
            parentId: 'ST1',
            effortHours: 4,
            suggestedRoleKey: 'frontend_developer',
          },
          { id: 'ST2', level: 'story', name: 'Hồ sơ', parentId: null, priority: 'medium' },
          {
            id: 'ST2-t1',
            level: 'task',
            parentId: 'ST2',
            effortHours: 8,
            suggestedRoleKey: 'backend_developer',
          },
          { id: 'ST3', level: 'story', name: 'Thông báo', parentId: null, priority: 'low' },
          {
            id: 'ST3-t1',
            level: 'task',
            parentId: 'ST3',
            effortHours: 6,
            suggestedRoleKey: 'backend_developer',
          },
        ],
        schedulePlan: {
          sprints: [
            {
              id: 'S1',
              name: 'Sprint 1',
              startDate: '2026-01-05',
              endDate: '2026-01-16',
              capacityHours: 40,
              taskIds: [],
              pbiIds: [],
            },
            {
              id: 'S2',
              name: 'Sprint 2',
              startDate: '2026-01-19',
              endDate: '2026-01-30',
              capacityHours: 40,
              taskIds: [],
              pbiIds: [],
            },
          ],
          releases: [
            {
              id: 'R1',
              name: 'Release 1',
              sprintIds: ['S1', 'S2'],
              taskIds: [],
              taskCount: 0,
              effortHours: 0,
            },
          ],
          unallocated: [],
          meta: {
            sprintLengthDays: 14,
            teamCapacityHoursPerSprint: 40,
          },
        },
        theoreticalCpm: { projectDurationHours: 26, nodes: [], criticalPath: [] },
        backlog: {
          stories: [
            { id: 'ST1', name: 'Đăng nhập', priority: 'high' },
            { id: 'ST2', name: 'Hồ sơ', priority: 'medium' },
            { id: 'ST3', name: 'Thông báo', priority: 'low' },
          ],
        },
      },
      resource: {
        capacityPlan: {
          hardGate: false,
          totalSupplyHours: 160,
          totalDemandHours: 26,
          totalGapHours: 0,
          byRole: [
            { roleKey: 'backend_developer', supplyHours: 100, demandHours: 22 },
            { roleKey: 'frontend_developer', supplyHours: 60, demandHours: 4 },
          ],
        },
        capacityConflicts: [],
      },
      analyses: {
        dependency: {
          analysisStatus: 'COMPLETE_NO_EDGES',
          meta: {
            analysisComplete: true,
            coverageVerified: true,
            conclusion: 'NO_SUPPORTED_DEPENDENCIES',
          },
          dependencies: [],
          edges: [],
        },
      },
    },
  };

  const merged = deepClone(base);
  if (overrides.container) {
    merged.container = {
      ...merged.container,
      ...overrides.container,
      planning: {
        ...merged.container.planning,
        ...(overrides.container.planning || {}),
        schedulePlan: {
          ...merged.container.planning.schedulePlan,
          ...(overrides.container.planning?.schedulePlan || {}),
          meta: {
            ...merged.container.planning.schedulePlan.meta,
            ...(overrides.container.planning?.schedulePlan?.meta || {}),
          },
        },
      },
      resource: {
        ...merged.container.resource,
        ...(overrides.container.resource || {}),
      },
      analyses: {
        ...merged.container.analyses,
        ...(overrides.container.analyses || {}),
      },
    };
  }
  if (overrides.pack) merged.pack = { ...merged.pack, ...overrides.pack };
  return merged;
}

function envLlmOff(extra = {}) {
  return {
    ...process.env,
    AI_PLANNING_LLM: '0',
    OLLAMA_ENABLED: '0',
    LLM_ENABLED: '0',
    ...extra,
  };
}

function envLlmOn(extra = {}) {
  return {
    ...process.env,
    AI_PLANNING_LLM: '1',
    OLLAMA_ENABLED: '1',
    LLM_ENABLED: '1',
    SPRINT_LLM_MAX_API_CALLS: '3',
    SPRINT_LLM_MAX_VALIDATION_REPAIRS: '2',
    ...extra,
  };
}

function mockGenerateJson(data) {
  return async () => ({
    ok: true,
    data,
    model: 'mock-sprint',
    cacheHit: false,
  });
}

module.exports = {
  sprintFixture,
  envLlmOff,
  envLlmOn,
  mockGenerateJson,
  deepClone,
};
