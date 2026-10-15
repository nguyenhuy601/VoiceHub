/**
 * Customer Raw: pack Analysis arrays after materialize must NOT skip LLM (SHEET_PRESENT).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { runAllRawSectionDerives } = require('../src/semantic/runRawSectionDerive');
const { TASK_POLICIES } = require('../src/semantic/semanticTaskRegistry');

describe('Customer Raw SHEET_PRESENT policy', () => {
  it('does not skip bg/br when pack has leftover Analysis rows', async () => {
    const pack = {
      functionalRequirements: [{ id: 'FR-1', name: 'Login' }],
      businessGoals: [{ id: 'BG-1', name: 'Old goal' }],
      businessRules: [{ id: 'BR-1', name: 'Old rule' }],
      useCases: [{ id: 'UC-1', name: 'Old UC' }],
      businessProcesses: [{ id: 'BPM-1', name: 'Old process' }],
      entities: [],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true, templateType: 'CustomerRaw' },
        customerRawRows: { businessRequests: [{ id: 'BRQ-1', statement: 'Need login' }] },
      },
    };

    const called = [];
    const out = await runAllRawSectionDerives({
      pack,
      env: {
        PHASE1_RAW_SECTION_DERIVE: '1',
        PHASE1_RAW_DERIVE_SECTIONS: 'bg,br',
        PHASE1_RAW_DERIVE_CRITICAL: 'bg,br',
        AI_PLANNING_LLM: '1',
      },
      order: ['bg', 'br'],
      invokeFn: async ({ prompt }) => {
        called.push(String(prompt || '').slice(0, 80));
        return {
          ok: true,
          data: {
            goals: [{ goalId: 'BG-N', statement: 'New goal', relatedFrIds: ['FR-1'] }],
            rules: [{ ruleId: 'BR-N', statement: 'New rule', relatedFrIds: ['FR-1'] }],
          },
        };
      },
    });

    assert.equal(called.length, 2, 'LLM must run for bg+br despite pack leftover rows');
    for (const id of ['bg', 'br']) {
      assert.ok(out[id], `missing result for ${id}`);
      assert.notEqual(out[id].reason, 'SHEET_PRESENT', `${id} should not SHEET_PRESENT on Customer Raw`);
      assert.equal(out[id].status, TASK_POLICIES.RUN);
      assert.ok(out[id].items?.length >= 1, `${id} should have derived items`);
    }
  });

  it('still SHEET_PRESENT for Analysis workbook when pack rows exist', async () => {
    const pack = {
      functionalRequirements: [{ id: 'FR-1', name: 'Login' }],
      businessGoals: [{ id: 'BG-1', name: 'From sheet' }],
      overview: { projectObjective: 'X' },
      // Not Customer Raw — no formValidation / customerRaw markers
    };

    const out = await runAllRawSectionDerives({
      pack,
      env: {
        PHASE1_RAW_SECTION_DERIVE: '1',
        PHASE1_RAW_DERIVE_SECTIONS: 'bg',
        AI_PLANNING_LLM: '1',
      },
      order: ['bg'],
      invokeFn: async () => ({ ok: true, data: { goals: [] } }),
    });

    // shouldRawDeriveSection false for non-CR → loop continues without entry
    // OR if somehow entered, SHEET_PRESENT. Non-CR + no CR markers → shouldRawDerive false.
    assert.equal(out.bg, undefined);
  });
});
