/**
 * NFR Category — free-form string (sanitize only; no fixed catalog).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const constants = require('../src/constants/requirementTemplate.constants');
const { validateBusinessLayer } = require('../src/utils/requirement/requirementTemplateValidate');
const { normProse } = require('../src/utils/requirement/requirementTemplateTextNorm');

describe('nfrCategorySanitize', () => {
  it('does not export NFR_CATEGORIES catalog', () => {
    assert.equal('NFR_CATEGORIES' in constants, false);
  });

  it('normProse trims and collapses whitespace', () => {
    assert.equal(normProse('  Latency   &  SLA  '), 'Latency & SLA');
  });

  it('does not warn on free-form NFR category', () => {
    const issues = validateBusinessLayer({
      templateVersion: '2.0',
      sheetNames: [],
      overview: {},
      scope: [],
      functionalRequirements: [],
      nonFunctionalRequirements: [
        {
          externalId: 'NFR-001',
          category: 'Latency & SLA',
          requirement: 'p95 API under 200ms',
          target: '200ms',
          priority: 'High',
          _rowNumber: 2,
        },
      ],
      technology: [],
      integration: [],
      constraints: [],
      dependencies: [],
      assumptions: [],
    });
    assert.equal(
      issues.some((i) => i.code === 'REQ_NFR_INVALID_CATEGORY'),
      false
    );
  });
});
