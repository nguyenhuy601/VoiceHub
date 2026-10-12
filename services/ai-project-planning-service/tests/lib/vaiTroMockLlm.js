/**
 * Deterministic mock JSON for eval when remote LLM unavailable (404/key).
 * Simulates plausible model output from monolithic vs golden FR packs.
 */

function mockGenerateJson(opts = {}) {
  const prompt = String(opts.prompt || '');
  const model = 'mock-eval';
  let data = null;

  if (/Requirement Semantic Projection/i.test(prompt)) {
    data = {
      items: [
        {
          frId: 'CR-ROLE-01',
          semanticInterpretation: { capability: 'Role management', intent: 'CRUD and salary config' },
          ambiguities: [
            { field: 'duplicate', issue: 'Unclear if save is blocked on duplicate name' },
            { field: 'kpi', issue: 'KPI structure not specified' },
          ],
          relationships: [],
          evidence: [{ type: 'source_fr', id: 'CR-ROLE-01' }],
        },
      ],
    };
  } else if (/Synthesize Requirement Understanding/i.test(prompt)) {
    data = {
      understanding: 'Single FR bundles role CRUD, list, salary formula, KPI.',
      capabilities: [{ name: 'Manage roles', sourceFrIds: ['CR-ROLE-01'] }],
      openQuestions: ['Soft vs hard delete?', 'KPI fields?'],
      gaps: ['No separate FR for edit/delete/list'],
      crossModule: [],
    };
  } else if (/SemanticTask=uc/i.test(prompt)) {
    data = {
      useCases: [
        {
          id: 'UC-1',
          name: 'Quản lý vai trò',
          primaryActor: 'Admin',
          goal: 'Thêm/sửa/xóa và xem danh sách',
          sourceRefs: ['CR-ROLE-01'],
        },
      ],
    };
  } else if (/SemanticTask=br/i.test(prompt)) {
    data = {
      rules: [
        {
          id: 'BR-1',
          statement: 'Cảnh báo khi tên vai trò trùng',
          sourceRefs: ['CR-ROLE-01'],
        },
      ],
    };
  } else if (/SemanticTask=bg/i.test(prompt)) {
    data = {
      goals: [
        {
          goalId: 'BG-1',
          statement: 'Quản lý vai trò và cấu hình lương/KPI',
          relatedFrIds: ['CR-ROLE-01'],
          sourceRefs: ['CR-ROLE-01'],
        },
      ],
    };
  } else if (/SemanticTask=data/i.test(prompt)) {
    data = {
      entities: [{ id: 'ENT-1', name: 'Role', attributes: ['name', 'commissionPct'], sourceRefs: ['CR-ROLE-01'] }],
    };
  } else if (/WBS leaves JSON/i.test(prompt)) {
    data = {
      nodes: [
        {
          id: 'T-CR-ROLE-01-1',
          name: 'API vai trò CRUD',
          level: 'task',
          parentId: null,
          sourceFrIds: ['CR-ROLE-01'],
          effortSeedHours: 16,
          area: 'backend',
        },
      ],
    };
  } else {
    data = { items: [] };
  }

  return Promise.resolve({
    ok: true,
    model,
    data,
    usage: { promptEvalCount: 100, evalCount: 80 },
  });
}

module.exports = { mockGenerateJson };
