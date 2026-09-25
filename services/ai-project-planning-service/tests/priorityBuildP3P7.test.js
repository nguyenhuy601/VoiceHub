const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isJevControlEnabled,
  evaluateJev1Context,
  evaluateJev2ModelRoute,
  evaluateJev3Supervisor,
} = require('../src/orchestration/jevControl');
const { decideEvaluateAction } = require('../src/orchestration/evaluatePolicy');
const { isHitlInterruptEnabled } = require('../src/orchestration/hitlInterrupt');
const { selectModel } = require('../src/runtime/intelligenceRuntime');
const {
  getLangGraphCheckpointer,
  _resetLangGraphCheckpointerCacheForTests,
} = require('../src/orchestration/langGraphCheckpointer');

describe('P3 langGraph checkpointer', () => {
  it('forceMemory returns MemorySaver', async () => {
    _resetLangGraphCheckpointerCacheForTests();
    const { kind } = await getLangGraphCheckpointer({ forceMemory: true });
    assert.equal(kind, 'memory');
  });
});

describe('P5 HITL interrupt flag', () => {
  it('defaults off', () => {
    assert.equal(isHitlInterruptEnabled({}), false);
    assert.equal(isHitlInterruptEnabled({ AGENT_CORE_HITL_INTERRUPT: '0' }), false);
  });

  it('enables on 1', () => {
    assert.equal(isHitlInterruptEnabled({ AGENT_CORE_HITL_INTERRUPT: '1' }), true);
  });
});

describe('P6/P7 JEV + G17', () => {
  it('JEV1 scores citations', () => {
    const low = evaluateJev1Context({ citations: [] });
    assert.equal(low.ok, false);
    const ok = evaluateJev1Context({
      citations: [{ citationId: 'c1', score: 0.9 }],
    });
    assert.equal(ok.ok, true);
    assert.ok(ok.score >= 0.15);
  });

  it('JEV2 routes high risk to reasoning', () => {
    assert.equal(evaluateJev2ModelRoute({ riskLevel: 'high' }).route, 'reasoning');
    assert.equal(evaluateJev2ModelRoute({}).route, 'small');
  });

  it('JEV3 suggests RETRIEVE without citations', () => {
    const j = evaluateJev3Supervisor({
      evaluate: { enoughInfoToContinue: false },
      contextPackage: { citations: [] },
      toolResults: [],
    });
    assert.equal(j.suggest, 'RETRIEVE');
  });

  it('JEV_CONTROL wires jev3 onto decideEvaluateAction', () => {
    const prev = process.env.JEV_CONTROL;
    process.env.JEV_CONTROL = '1';
    try {
      assert.equal(isJevControlEnabled(), true);
      const d = decideEvaluateAction({
        evaluate: { enoughInfoToContinue: false },
        contextPackage: { citations: [] },
        toolResults: [],
      });
      assert.equal(d.action, 'RETRIEVE');
      assert.equal(d.jev3?.kind, 'jev3');
    } finally {
      if (prev === undefined) delete process.env.JEV_CONTROL;
      else process.env.JEV_CONTROL = prev;
    }
  });

  it('selectModel exposes timeout budget + optional JEV2', () => {
    const prev = process.env.JEV_CONTROL;
    process.env.JEV_CONTROL = '1';
    try {
      const m = selectModel(
        {
          OLLAMA_MODEL: 'small:1b',
          OLLAMA_REASONING_MODEL: 'reason:7b',
          G17_LLM_TIMEOUT_MS: '90000',
          JEV_CONTROL: '1',
        },
        { riskLevel: 'high' }
      );
      assert.equal(m.timeoutMs, 90000);
      assert.equal(m.jev2?.route, 'reasoning');
      assert.equal(m.model, 'reason:7b');
    } finally {
      if (prev === undefined) delete process.env.JEV_CONTROL;
      else process.env.JEV_CONTROL = prev;
    }
  });
});
