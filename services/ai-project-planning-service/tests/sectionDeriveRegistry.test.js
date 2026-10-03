/**
 * Per-section derive registry + slim V2 inputs (unlock path).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  LLM_DERIVE_ORDER,
  resolveSectionMaxTokens,
  RESULT_KEY_BY_ENGINE,
} = require('../src/semantic/sectionDeriveRegistry');
const {
  buildDeriveInputForSection,
  buildBrDeriveInput,
} = require('../src/semantic/buildSectionDeriveInputs');
const { buildRawDeriveInput } = require('../src/semantic/buildRawDeriveInput');
const { extractArray, buildDerivePrompt } = require('../src/semantic/runRawSectionDerive');
const { getActiveLlmDeriveSections } = require('../src/semantic/rawSectionDerivePolicy');

const rawPack = {
  overview: { requirementName: 'Emp', projectObjective: 'Manage staff', businessScope: 'HR' },
  functionalRequirements: [
    { externalId: 'CR-001', name: 'Create employee', module: 'Core', actor: 'HR' },
    { externalId: 'CR-002', name: 'Approve leave', module: 'Leave', actor: 'Manager' },
  ],
  nonFunctionalRequirements: [{ id: 'NFR-1', category: 'Security', statement: 'SSO required' }],
  aiAnalysis: {
    formValidation: { ok: true, recognizedAsCustomerRaw: true },
    customerRawRows: {
      businessRequests: [
        { requestId: 'BRQ-1', businessGoal: 'Centralize employee data', title: 'Core HR' },
      ],
    },
  },
};

describe('sectionDeriveRegistry', () => {
  it('unlock order starts with bg then br', () => {
    assert.deepEqual(LLM_DERIVE_ORDER.slice(0, 2), ['bg', 'br']);
  });

  it('resolves per-sec max tokens from env', () => {
    assert.equal(resolveSectionMaxTokens('br', { PHASE1_BR_DERIVE_MAX_TOKENS: '256' }), 256);
    assert.equal(resolveSectionMaxTokens('bg', { PHASE1_BG_DERIVE_MAX_TOKENS: '384' }), 384);
  });

  it('parses PHASE1_RAW_DERIVE_SECTIONS unlock list', () => {
    assert.deepEqual(
      getActiveLlmDeriveSections({ PHASE1_RAW_DERIVE_SECTIONS: 'bg,br' }),
      ['bg', 'br']
    );
  });
});

describe('buildSectionDeriveInputs V2', () => {
  it('BR input is slim v2 without AC dump', () => {
    const input = buildBrDeriveInput(rawPack);
    assert.equal(input.mode, 'raw_derive_v2');
    assert.ok(input.frSlim.length >= 1);
    assert.ok(!('requirementUnderstanding' in input));
    assert.ok(!JSON.stringify(input).includes('acceptanceCriteria'));
  });

  it('buildRawDeriveInput routes all LLM secs to v2', () => {
    for (const id of ['bg', 'br', 'uc', 'bpm', 'data', 'interface']) {
      const input = buildRawDeriveInput(id, rawPack);
      assert.equal(input.mode, 'raw_derive_v2', id);
    }
  });

  it('V2 prompt omits schema dump', () => {
    const input = buildDeriveInputForSection('br', rawPack);
    const prompt = buildDerivePrompt('br', input, {
      promptPolicy: 'rules only',
      semanticSchema: { huge: 'x'.repeat(5000) },
    });
    assert.ok(!prompt.includes('Schema hint'));
    assert.ok(prompt.includes('raw_derive_v2'));
  });

  it('extractArray accepts section aliases', () => {
    assert.equal(extractArray('br', { rules: [{ id: '1' }] }).length, 1);
    assert.equal(extractArray('br', { businessRules: [{ id: '2' }] }).length, 1);
    assert.equal(extractArray('uc', { useCases: [{ id: '3' }] }).length, 1);
    assert.equal(RESULT_KEY_BY_ENGINE.interface, 'interfaces');
  });
});
