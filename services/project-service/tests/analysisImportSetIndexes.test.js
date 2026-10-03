/**
 * AnalysisImportSet index naming — no duplicate projectId_1.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('AnalysisImportSet indexes', () => {
  const modelSrc = fs.readFileSync(
    path.join(__dirname, '../src/models/AnalysisImportSet.js'),
    'utf8'
  );

  it('names active unique partial and omits field-level projectId index', () => {
    assert.match(modelSrc, /name:\s*'projectId_1_active_unique'/);
    assert.match(modelSrc, /name:\s*'projectId_1_draft_unique'/);
    assert.doesNotMatch(modelSrc, /projectId:\s*\{[^}]*index:\s*true/s);
  });
});
