import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCustomerRawFormOk,
  formatCustomerRawFormIssues,
  formatCustomerRawFormTooltip,
  isLlmInsufficientReason,
  labelLlmInsufficientReason,
} from './customerRawFormSummary.js';

const t = (key) => {
  const map = {
    'workspace.phase1RawFormMissingSheet': 'Missing sheet: {sheet}',
    'workspace.phase1RawFormMissingCols': '{sheet}: missing columns {cols}',
    'workspace.phase1RawFormOkTooltip': 'workspace.phase1RawFormOkTooltip',
    'requirements.phase1LlmInsufficientEmpty': 'requirements.phase1LlmInsufficientEmpty',
  };
  return map[key] || key;
};

describe('customerRawFormSummary', () => {
  it('isCustomerRawFormOk only when ok===true', () => {
    assert.equal(isCustomerRawFormOk(null), false);
    assert.equal(isCustomerRawFormOk({ ok: false }), false);
    assert.equal(isCustomerRawFormOk({ ok: true }), true);
  });

  it('formats missing sheet and columns', () => {
    const issues = formatCustomerRawFormIssues(
      {
        ok: false,
        recognizedAsCustomerRaw: true,
        missingSheets: ['02_Business_Request'],
        missingHeadersBySheet: { '03_Requirement': ['Requirement ID'] },
      },
      t
    );
    assert.ok(issues.some((s) => s.includes('02_Business_Request')));
    assert.ok(issues.some((s) => s.includes('Requirement ID')));
  });

  it('tooltip for form OK', () => {
    const tip = formatCustomerRawFormTooltip({ ok: true }, t);
    assert.equal(tip, 'workspace.phase1RawFormOkTooltip');
  });

  it('LLM insufficient reasons', () => {
    assert.equal(isLlmInsufficientReason('SOURCE_SHEET_EMPTY'), true);
    assert.equal(isLlmInsufficientReason('SOURCE_SHEET_ABSENT'), true);
    assert.equal(isLlmInsufficientReason('NO_DATA'), false);
    assert.match(
      labelLlmInsufficientReason('SOURCE_SHEET_EMPTY', t),
      /phase1LlmInsufficientEmpty|Không đủ/
    );
  });
});
