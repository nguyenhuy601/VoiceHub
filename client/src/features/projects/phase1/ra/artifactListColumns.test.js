/**
 * DEC R1 — column catalog / visibility helpers (no DOM).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getArtifactListColumnCatalog,
  getDefaultVisibleColumnIds,
  resolveVisibleColumns,
} from './artifactListColumns.js';

describe('artifactListColumns DEC R1', () => {
  it('FR catalog includes Excel-aligned fields; defaults show Excel primary columns', () => {
    const catalog = getArtifactListColumnCatalog('FR');
    const ids = catalog.map((c) => c.id);
    assert.ok(ids.includes('module'));
    assert.ok(ids.includes('feature'));
    assert.ok(ids.includes('mainBehavior'));
    assert.ok(ids.includes('acceptance'));
    assert.ok(ids.includes('trigger'));
    assert.ok(ids.includes('capability'));
    assert.ok(ids.includes('brIds'));
    assert.ok(ids.includes('bpmIds'));

    const defaults = getDefaultVisibleColumnIds('FR');
    assert.ok(defaults.includes('module'));
    assert.ok(defaults.includes('mainBehavior'));
    assert.ok(defaults.includes('acceptance'));
    assert.ok(defaults.includes('trigger'));
    assert.ok(defaults.includes('capability'));
    assert.ok(defaults.includes('parent'));
    assert.ok(defaults.includes('brIds'));
    assert.ok(defaults.includes('bpmIds'));
  });

  it('resolveVisibleColumns always keeps id and drops unknown', () => {
    const cols = resolveVisibleColumns('FR', ['acceptance', 'bogus', 'module']);
    assert.equal(cols[0].id, 'id');
    assert.deepEqual(
      cols.map((c) => c.id),
      ['id', 'acceptance', 'module']
    );
  });

  it('BG/BR defaults include Excel business fields', () => {
    const bgDef = getDefaultVisibleColumnIds('BG');
    assert.ok(bgDef.includes('businessProblem'));
    assert.ok(bgDef.includes('expectedOutcome'));
    assert.ok(bgDef.includes('customerRequirementIds'));

    const brDef = getDefaultVisibleColumnIds('BR');
    assert.ok(brDef.includes('businessRule'));
    assert.ok(brDef.includes('successCriteria'));
    assert.ok(brDef.includes('relatedBg'));
  });

  it('SCOPE/IF/DATA/GLOSSARY/ASSUMPTION defaults cover Excel columns', () => {
    for (const id of [
      'scopeType',
      'scopeDescription',
      'customerRequirementIds',
      'workbookSource',
      'dateRaised',
      'analysisStatus',
      'baNote',
    ]) {
      assert.ok(getDefaultVisibleColumnIds('SCOPE').includes(id), `SCOPE ${id}`);
    }
    assert.ok(getDefaultVisibleColumnIds('INTERFACE').includes('relatedArtifactIds'));
    assert.ok(getDefaultVisibleColumnIds('DATA').includes('relatedArtifactIds'));
    assert.ok(getDefaultVisibleColumnIds('GLOSSARY').includes('relatedArtifactIds'));
    assert.ok(getDefaultVisibleColumnIds('ASSUMPTION').includes('impactIfInvalid'));
    assert.ok(getDefaultVisibleColumnIds('BPM').includes('relatedCr'));
    assert.ok(getDefaultVisibleColumnIds('BPM').includes('relatedBr'));
    assert.ok(getDefaultVisibleColumnIds('NFR').includes('nfrScope'));
  });
});
