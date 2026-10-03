/**
 * T4 — No cross-fill: BR empty sheet must not invent items from FR
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runAnalysisEnginePipeline } = require('../src/orchestration/buildAnalysisEngineGraph');

describe('noCrossFillEmptySheet', () => {
  it('BR empty → no BR items even when FR fragment present', async () => {
    const proposalFragment = {
      section: 'functionalRequirements',
      items: [
        {
          logicalId: 'CR-001',
          title: 'Login',
          description: 'User can log in',
          origin: { type: 'EXTRACTED', engine: 'fr', section: 'functionalRequirements' },
          provenance: { type: 'EXTRACTED', producer: 'deterministic', rule: 'SOURCE_INGEST', derivedFrom: [] },
        },
      ],
      meta: { generationId: 'test-run', engineId: 'fr' },
    };

    const out = await runAnalysisEnginePipeline({
      proposalFragment,
      pack: {
        businessRules: [],
        businessGoals: [],
        functionalRequirements: [{ id: 'CR-001', title: 'Login' }],
      },
      env: {
        ...process.env,
        AI_PLANNING_LLM: '0',
        SEMANTIC_NONFR_RUNTIME: '1',
        PHASE1_UC_HEURISTIC_FROM_FR: '0',
        PHASE1_DATA_HEURISTIC_FROM_FR: '0',
      },
    });

    const brItems = out.proposal?.generated?.businessRules?.items || [];
    assert.equal(brItems.length, 0, 'BR must stay empty — no cross-fill from FR');
    const frItems = out.proposal?.generated?.functionalRequirements?.items || [];
    assert.ok(frItems.length >= 1);
  });

  it('UC heuristic from FR default off when no UC sheet', async () => {
    const out = await runAnalysisEnginePipeline({
      proposalFragment: {
        section: 'functionalRequirements',
        items: [
          {
            logicalId: 'CR-002',
            title: 'Checkout',
            description: 'Pay order',
            origin: { type: 'EXTRACTED', engine: 'fr', section: 'functionalRequirements' },
            provenance: {
              type: 'EXTRACTED',
              producer: 'deterministic',
              rule: 'SOURCE_INGEST',
              derivedFrom: [],
            },
          },
        ],
        meta: { generationId: 't2', engineId: 'fr' },
      },
      pack: { useCases: [], entities: [] },
      env: {
        ...process.env,
        AI_PLANNING_LLM: '0',
        PHASE1_UC_HEURISTIC_FROM_FR: '0',
        PHASE1_DATA_HEURISTIC_FROM_FR: '0',
        PHASE1_RAW_SECTION_DERIVE: '0',
      },
    });
    const uc = out.proposal?.generated?.useCases?.items || [];
    assert.equal(uc.length, 0);
  });

  it('Analysis workbook (not Raw) + FR present → BR stays empty (no cross-fill)', async () => {
    const out = await runAnalysisEnginePipeline({
      proposalFragment: {
        section: 'functionalRequirements',
        items: [
          {
            logicalId: 'FR-1',
            title: 'Login',
            origin: { type: 'EXTRACTED', engine: 'fr', section: 'functionalRequirements' },
            provenance: { type: 'EXTRACTED', producer: 'deterministic', rule: 'SOURCE_INGEST', derivedFrom: [] },
          },
        ],
        meta: { generationId: 'analysis-path', engineId: 'fr' },
      },
      pack: {
        functionalRequirements: [{ externalId: 'FR-1', name: 'Login' }],
        businessRules: [],
        aiAnalysis: { formValidation: { ok: false } },
      },
      env: {
        ...process.env,
        AI_PLANNING_LLM: '1',
        PHASE1_RAW_SECTION_DERIVE: '1',
        SEMANTIC_NONFR_RUNTIME: '1',
      },
      invokeFn: async () => ({
        ok: true,
        data: { rules: [{ ruleId: 'BR-HACK', ruleCondition: 'x', ruleAction: 'y', relatedFrIds: ['FR-1'] }] },
      }),
    });
    const br = out.proposal?.generated?.businessRules?.items || [];
    assert.equal(br.length, 0, 'Analysis path must not raw-derive BR from FR');
  });
});
