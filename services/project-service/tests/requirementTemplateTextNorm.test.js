const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normKey, normalizeScopeType } = require('../src/utils/requirement/requirementTemplateTextNorm');
const {
  validateAnalysisWorkbook,
} = require('../src/utils/requirement/requirementAnalysisTemplateValidate');

describe('normKey priority', () => {
  it('maps MoSCoW onto Critical, High, Medium, Low', () => {
    assert.equal(normKey('Must', { kind: 'priority' }), 'Critical');
    assert.equal(normKey('Should', { kind: 'priority' }), 'High');
    assert.equal(normKey('Could', { kind: 'priority' }), 'Medium');
    assert.equal(normKey("Won't", { kind: 'priority' }), 'Low');
    assert.equal(normKey('Wont', { kind: 'priority' }), 'Low');
  });

  it('keeps the four canonical levels', () => {
    assert.equal(normKey('Critical', { kind: 'priority' }), 'Critical');
    assert.equal(normKey('high', { kind: 'priority' }), 'High');
    assert.equal(normKey(' Medium ', { kind: 'priority' }), 'Medium');
    assert.equal(normKey('Low', { kind: 'priority' }), 'Low');
  });

  it('maps known scope labels and keeps a typed value', () => {
    assert.equal(normalizeScopeType('Out of Scope'), 'out');
    assert.equal(normalizeScopeType('In Scope'), 'in');
    assert.equal(normalizeScopeType('Ngoài phạm vi'), 'out');
    assert.equal(normalizeScopeType('Trong phạm vi'), 'in');
    assert.equal(normalizeScopeType('Phase 2 only'), 'Phase 2 only');
  });

  it('does not warn when Must was normalized before validate', () => {
    const { issues } = validateAnalysisWorkbook({
      fileName: 'Requirement_Analysis.xlsx',
      fileSize: 128,
      parsed: {
        sheetNames: [],
        functionalRequirements: [
          {
            externalId: 'FR-001',
            level: 'Module',
            priority: normKey('Must', { kind: 'priority' }),
            _rowNumber: 2,
          },
        ],
      },
    });
    assert.equal(
      issues.some((item) => item.code === 'RA_FR_PRIORITY_INVALID'),
      false
    );
  });
});
