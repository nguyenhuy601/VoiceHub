/**
 * Step 2 — Raw derive hooked into runAnalysisEnginePipeline.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runAnalysisEnginePipeline } = require('../src/orchestration/buildAnalysisEngineGraph');

function rawPack(overrides = {}) {
  return {
    functionalRequirements: [
      {
        externalId: 'CR-001',
        name: 'Admin can create student profile',
        actor: 'Admin',
        moduleLabel: 'Student',
        acceptanceCriteria: 'Saved',
        requestId: 'BRQ-001',
      },
      {
        externalId: 'CR-002',
        name: 'Student views schedule',
        actor: 'Student',
        moduleLabel: 'Schedule',
      },
    ],
    nonFunctionalRequirements: [],
    businessRules: [],
    businessGoals: [],
    useCases: [],
    entities: [],
    interfaces: [],
    businessProcesses: [],
    scope: [{ type: 'in', description: 'Student lifecycle' }],
    overview: {
      requirementName: 'Student Management',
      projectObjective: 'Manage students',
      expectedUsers: 'Admin, Student, Lecturer',
      integration: 'University SSO',
      assumption: 'SSO đã sẵn sàng; dữ liệu sinh viên được cung cấp từ phòng đào tạo',
    },
    aiAnalysis: {
      formValidation: { ok: true, recognizedAsCustomerRaw: true, templateType: 'CustomerRaw' },
      workbookDiagnostic: { intakeKind: 'customer_raw', rows: { validFr: 2 } },
      customerRawRows: {
        businessRequests: [
          {
            requestId: 'BRQ-001',
            title: 'Online registration',
            businessGoal: 'Enable online registration',
            expectedBenefit: 'Less paperwork',
          },
        ],
        references: [],
        requirementSources: [],
      },
      canonicalRaw: {
        constraints: {
          assumption: 'Người dùng có tài khoản SSO hợp lệ',
          platform_constraint: 'Web desktop trước',
        },
        content: { scopeOut: ['Mobile app native'] },
      },
    },
    ...overrides,
  };
}

const frFragment = {
  section: 'functionalRequirements',
  items: [
    {
      logicalId: 'CR-001',
      title: 'Admin can create student profile',
      description: 'Create profile',
      origin: { type: 'EXTRACTED', engine: 'fr', section: 'functionalRequirements' },
      provenance: { type: 'EXTRACTED', producer: 'deterministic', rule: 'SOURCE_INGEST', derivedFrom: [] },
    },
  ],
  meta: { generationId: 'raw-derive-test', engineId: 'fr' },
};

describe('rawSectionDerivePipeline', () => {
  it('Customer Raw + mock LLM → BG DERIVED only; UC locked', async () => {
    const invoked = [];
    const invokeFn = async ({ prompt }) => {
      const isUc =
        String(prompt).includes('use_cases') ||
        String(prompt).includes('taskId=uc') ||
        String(prompt).includes('SemanticTask=uc');
      const isBg =
        String(prompt).includes('business_goals') || String(prompt).includes('SemanticTask=bg');
      if (isUc) {
        invoked.push('uc');
        return {
          ok: true,
          data: {
            useCases: [
              {
                ucId: 'UC-1',
                actor: 'Admin',
                goal: 'Manage student profile',
                relatedFrIds: ['CR-001'],
              },
            ],
          },
        };
      }
      if (isBg) {
        invoked.push('bg');
        return {
          ok: true,
          data: {
            goals: [
              {
                goalId: 'BG-1',
                statement: 'Enable online registration',
                relatedFrIds: ['CR-001'],
              },
            ],
          },
        };
      }
      invoked.push('other');
      return { ok: true, data: { items: [] } };
    };

    const out = await runAnalysisEnginePipeline({
      proposalFragment: frFragment,
      pack: rawPack(),
      env: {
        ...process.env,
        AI_PLANNING_LLM: '1',
        PHASE1_RAW_SECTION_DERIVE: '1',
        PHASE1_UC_HEURISTIC_FROM_FR: '0',
        PHASE1_DATA_HEURISTIC_FROM_FR: '0',
        SEMANTIC_NONFR_RUNTIME: '0',
      },
      invokeFn,
    });

    assert.deepEqual(invoked, ['bg']);

    const uc = out.proposal?.generated?.useCases?.items || [];
    assert.equal(uc.length, 0, 'UC locked temporarily');
    assert.equal(out.deriveStatuses?.uc, 'DERIVE_LOCKED');

    const bg = out.proposal?.generated?.businessGoals?.items || [];
    assert.ok(bg.length >= 1, 'BG derived');
    assert.equal(String(bg[0].origin?.type || '').toUpperCase(), 'DERIVED');
    assert.equal(String(bg[0].status || '').toUpperCase(), 'PROPOSED');

    assert.equal(out.proposal?.completeness?.gateDecision?.decision, 'READY');
    assert.ok(out.proposal?.completeness?.gateDecision?.coverage?.FR >= 1);

    const actors = out.proposal?.generated?.actors?.items || [];
    assert.ok(actors.length >= 2, 'actors from FR + expectedUsers');
    assert.notEqual(out.deriveStatuses?.actors, 'DERIVE_LOCKED');

    const assumptions = out.proposal?.generated?.assumptions?.items || [];
    assert.ok(assumptions.length >= 1, 'assumptions from overview/canonicalRaw');
    assert.notEqual(out.deriveStatuses?.assumption, 'DERIVE_LOCKED');

    assert.equal(out.deriveStatuses?.br, 'DERIVE_LOCKED');
    assert.equal(out.deriveStatuses?.bpm, 'DERIVE_LOCKED');

    const scope = out.proposal?.generated?.scope?.items || [];
    assert.ok(scope.length >= 1, 'scope from pack.scope');
  });

  it('BG derive empty → throws RAW_DERIVE_FAILED (abort run)', async () => {
    await assert.rejects(
      () =>
        runAnalysisEnginePipeline({
          proposalFragment: frFragment,
          pack: rawPack(),
          env: {
            ...process.env,
            AI_PLANNING_LLM: '1',
            PHASE1_RAW_SECTION_DERIVE: '1',
            PHASE1_UC_HEURISTIC_FROM_FR: '0',
            SEMANTIC_NONFR_RUNTIME: '0',
          },
          invokeFn: async () => ({ ok: true, data: { goals: [] } }),
        }),
      (err) => {
        assert.equal(err.code, 'RAW_DERIVE_FAILED');
        assert.equal(err.engineId, 'bg');
        assert.match(String(err.message), /BG/);
        return true;
      }
    );
  });

  it('Customer Raw + LLM off → throws RAW_DERIVE_FAILED (abort, toast path)', async () => {
    await assert.rejects(
      () =>
        runAnalysisEnginePipeline({
          proposalFragment: frFragment,
          pack: rawPack(),
          env: {
            ...process.env,
            AI_PLANNING_LLM: '0',
            PHASE1_RAW_SECTION_DERIVE: '1',
            PHASE1_UC_HEURISTIC_FROM_FR: '0',
          },
          invokeFn: async () => ({ ok: false, skipped: true, reason: 'LLM_DISABLED' }),
        }),
      (err) => err.code === 'RAW_DERIVE_FAILED' && err.engineId === 'bg'
    );
  });

  it('kill-switch off → no UC invent on Raw', async () => {
    const out = await runAnalysisEnginePipeline({
      proposalFragment: frFragment,
      pack: rawPack(),
      env: {
        ...process.env,
        AI_PLANNING_LLM: '1',
        PHASE1_RAW_SECTION_DERIVE: '0',
        PHASE1_UC_HEURISTIC_FROM_FR: '0',
      },
      invokeFn: async () => ({
        ok: true,
        data: { useCases: [{ ucId: 'UC-X', goal: 'Should not apply', relatedFrIds: ['CR-001'] }] },
      }),
    });
    const uc = out.proposal?.generated?.useCases?.items || [];
    assert.equal(uc.length, 0);
  });
});
