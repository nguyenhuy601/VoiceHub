/**
 * WHAT prompt builders include intakeCorpus block (Pass A/B + classic).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPassADataCapabilityPrompt,
  buildPassBGapPrompt,
  buildPassCWbsPrompt,
} = require('../src/utils/aiAnalysis/aiAnalysisCompactPrompts');
const { buildDataPrompt } = require('../src/utils/aiAnalysis/aiAnalysisData');
const { buildReasoningPrompt } = require('../src/utils/tools/runRequirementReasoning');

const INTAKE = '--- INTAKE_CORPUS ---\n### raw.txt\nCustomer wants portal\n--- END_INTAKE_CORPUS ---';

describe('whatIntakePromptInject', () => {
  it('Pass A/B include intake; Pass C does not accept intake param', () => {
    const a = buildPassADataCapabilityPrompt({
      context: { name: 'P' },
      frRows: 'id|module|title|desc|ac',
      intakeBlock: INTAKE,
    });
    const b = buildPassBGapPrompt({
      context: { name: 'P' },
      flagRows: '',
      frRows: 'id|module|title|desc|ac',
      intakeBlock: INTAKE,
    });
    assert.match(a, /INTAKE_CORPUS/);
    assert.match(b, /INTAKE_CORPUS/);
    const c = buildPassCWbsPrompt({ capsRows: 'c1|Cap|' });
    assert.doesNotMatch(c, /INTAKE_CORPUS/);
  });

  it('classic data prompt includes intake', () => {
    assert.match(
      buildDataPrompt({
        context: {},
        dataHints: {},
        frChunk: [],
        chunkIndex: 0,
        chunkTotal: 1,
        intakeBlock: INTAKE,
      }),
      /INTAKE_CORPUS/
    );
  });

  it('insights reasoning prompt includes intake', () => {
    const p = buildReasoningPrompt({
      context: {},
      verifiedFactsBlock: 'VERIFIED_FACTS: none',
      whatSummary: null,
      intakeBlock: INTAKE,
    });
    assert.match(p, /INTAKE_CORPUS/);
  });
});
