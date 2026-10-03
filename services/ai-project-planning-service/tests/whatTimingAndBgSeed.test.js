/**
 * PERF round-1: BRQ seed + G4 policy defaults.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDeterministicBgGoalsFromBrq,
} = require('../src/semantic/buildBgDeriveInput');
const { runRawSectionDerive } = require('../src/semantic/runRawSectionDerive');
const { resolveAiG4Policy } = require('../src/config/aiG4Policy');

describe('buildDeterministicBgGoalsFromBrq', () => {
  it('seeds goals from BRQ.businessGoal', () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'A', actor: 'Admin' }],
      aiAnalysis: {
        workbookDiagnostic: { intakeKind: 'customer_raw' },
        customerRawRows: {
          businessRequests: [
            { requestId: 'BRQ-1', businessGoal: 'Goal one' },
            { requestId: 'BRQ-2', businessGoal: 'Goal two' },
            { requestId: 'BRQ-3', businessGoal: 'Goal three' },
          ],
        },
      },
    };
    const out = buildDeterministicBgGoalsFromBrq(pack);
    assert.ok(out.items.length >= 3);
    assert.equal(out.reason, 'BRQ_SEED');
    assert.match(out.items[0].statement, /Goal/);
  });
});

describe('runRawSectionDerive BRQ_SEED', () => {
  it('default OFF — calls LLM even when BRQ goals exist', async () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'Create profile', actor: 'HR' }],
      overview: { projectObjective: 'HR system' },
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        workbookDiagnostic: { intakeKind: 'customer_raw' },
        customerRawRows: {
          businessRequests: [
            { requestId: 'BRQ-1', businessGoal: 'Standardize employee records' },
            { requestId: 'BRQ-2', businessGoal: 'Automate leave workflow' },
          ],
        },
      },
    };
    let llmCalls = 0;
    const out = await runRawSectionDerive({
      engineId: 'bg',
      pack,
      env: {
        ...process.env,
        PHASE1_BG_BRQ_SEED: '0',
        PHASE1_BG_FORCE_LLM: '1',
        PHASE1_RAW_SECTION_DERIVE: '1',
        PHASE1_RAW_DERIVE_SECTIONS: 'bg',
        OLLAMA_BASE_URL: 'http://127.0.0.1:9',
      },
      invokeFn: async () => {
        llmCalls += 1;
        return {
          ok: true,
          data: {
            goals: [
              { goalId: 'BG-1', statement: 'From LLM', relatedFrIds: ['CR-001'], sourceRefs: [] },
            ],
          },
          usage: { evalCount: 10 },
        };
      },
    });
    assert.equal(llmCalls, 1);
    assert.notEqual(out.reason, 'BRQ_SEED');
    assert.ok(out.items.length >= 1);
  });

  it('skips LLM when enough BRQ goals', async () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'Create profile', actor: 'HR' }],
      overview: { projectObjective: 'HR system' },
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        workbookDiagnostic: { intakeKind: 'customer_raw' },
        customerRawRows: {
          businessRequests: [
            { requestId: 'BRQ-1', businessGoal: 'Standardize employee records' },
            { requestId: 'BRQ-2', businessGoal: 'Automate leave workflow' },
          ],
        },
      },
    };
    let llmCalls = 0;
    const out = await runRawSectionDerive({
      engineId: 'bg',
      pack,
      env: { ...process.env, PHASE1_BG_BRQ_SEED: '1', PHASE1_RAW_SECTION_DERIVE: '1' },
      invokeFn: async () => {
        llmCalls += 1;
        return { ok: true, data: { goals: [] } };
      },
    });
    assert.equal(out.reason, 'BRQ_SEED');
    assert.ok(out.items.length >= 2);
    assert.equal(out.llmCalls, 0);
    assert.equal(llmCalls, 0);
  });
});

describe('aiG4Policy 3b defaults', () => {
  it('uses tighter semantic budget by default', () => {
    const p = resolveAiG4Policy({});
    assert.equal(p.llm.semanticProjection.maxCalls, 1);
    assert.ok(p.llm.semanticProjection.maxInputTokens <= 1400);
    assert.ok(p.llm.semanticProjection.maxOutputTokens <= 256);
  });
});
