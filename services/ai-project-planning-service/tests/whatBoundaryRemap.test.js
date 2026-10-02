const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MACRO,
  STEP2_SUBSTEPS,
  STEP3_SUBSTEPS,
  STEP4_SUBSTEPS,
  macroForSubstep,
} = require('../src/orchestration/whatStepBoundaries');
const { SUBSTEPS } = require('../src/engines/g4/pipelineProgress');

describe('whatBoundaryRemap', () => {
  it('maps Step 2 understanding substeps before semantic', () => {
    for (const s of STEP2_SUBSTEPS) {
      const m = macroForSubstep(s);
      assert.equal(m.step, MACRO.UNDERSTANDING);
      assert.equal(SUBSTEPS[s].step, 2);
    }
    assert.ok(STEP2_SUBSTEPS.indexOf('quality') > STEP2_SUBSTEPS.indexOf('parse'));
    assert.equal(STEP2_SUBSTEPS.includes('gate_preview'), false);
  });

  it('maps Step 3 semantic fetch including context_fetch', () => {
    assert.deepEqual(
      STEP3_SUBSTEPS.slice(0, 2),
      ['context_fetch', 'assemble_context']
    );
    for (const s of STEP3_SUBSTEPS) {
      assert.equal(macroForSubstep(s).step, MACRO.SEMANTIC_FETCH);
      assert.equal(SUBSTEPS[s].step, 3);
    }
  });

  it('maps Step 4 agentic substeps linear (no evaluate loop keys)', () => {
    for (const s of STEP4_SUBSTEPS) {
      assert.equal(macroForSubstep(s).step, MACRO.AGENTIC);
    }
    assert.ok(STEP4_SUBSTEPS.includes('plan'));
    assert.ok(STEP4_SUBSTEPS.includes('observe'));
    assert.ok(STEP4_SUBSTEPS.includes('evaluate_local'));
    assert.ok(STEP4_SUBSTEPS.includes('meta_gate'));
    // gate_preview remapped away from HITL identity
    assert.equal(macroForSubstep('gate_preview').substep, 'quality');
    assert.equal(SUBSTEPS.gate_preview.substep, 'quality');
  });

  it('macro order is Input → Understanding → Semantic → Agentic', () => {
    assert.ok(MACRO.INPUT < MACRO.UNDERSTANDING);
    assert.ok(MACRO.UNDERSTANDING < MACRO.SEMANTIC_FETCH);
    assert.ok(MACRO.SEMANTIC_FETCH < MACRO.AGENTIC);
    assert.ok(MACRO.AGENTIC < MACRO.GATE1);
  });
});
