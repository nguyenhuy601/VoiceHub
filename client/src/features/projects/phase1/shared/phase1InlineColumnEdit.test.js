import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getArtifactListColumnCatalog } from '../ra/artifactListColumns.js';
import {
  readInlineFormValue,
  resolvePlanningInlineEditTarget,
  resolveRaInlineEditTarget,
  writeInlineFormValue,
} from './phase1InlineColumnEdit.js';

describe('phase1InlineColumnEdit', () => {
  it('maps title to top scope', () => {
    const t = resolveRaInlineEditTarget({ id: 'title' }, 'BG');
    assert.deepEqual(t, { scope: 'top', key: 'title' });
  });

  it('locks id/status columns', () => {
    assert.equal(resolveRaInlineEditTarget({ id: 'id' }, 'BG'), null);
    assert.equal(resolveRaInlineEditTarget({ id: 'status', isStatus: true }, 'BG'), null);
  });

  it('maps scope content columns, including analysis status', () => {
    const description = resolveRaInlineEditTarget({ id: 'scopeDescription' }, 'SCOPE');
    assert.equal(description?.key, 'description');
    assert.equal(description?.multiline, true);
    const source = resolveRaInlineEditTarget({ id: 'workbookSource' }, 'SCOPE');
    assert.equal(source?.key, 'source');
    const analysis = resolveRaInlineEditTarget({ id: 'analysisStatus' }, 'SCOPE');
    assert.equal(analysis?.key, 'status');
    assert.equal(analysis?.choice, true);
    const scopeType = resolveRaInlineEditTarget({ id: 'scopeType' }, 'SCOPE');
    assert.equal(scopeType?.choice, true);
    assert.equal(resolveRaInlineEditTarget({ id: 'source' }, 'SCOPE'), null);
    assert.equal(resolveRaInlineEditTarget({ id: 'importSet' }, 'SCOPE'), null);
  });

  it('maps kind-specific columns on FR and UC', () => {
    assert.equal(resolveRaInlineEditTarget({ id: 'precondition' }, 'FR')?.key, 'preconditions');
    assert.equal(resolveRaInlineEditTarget({ id: 'precondition' }, 'UC')?.key, 'precondition');
    assert.equal(resolveRaInlineEditTarget({ id: 'exception' }, 'UC')?.key, 'exceptionFlow');
    assert.equal(resolveRaInlineEditTarget({ id: 'businessRule' }, 'UC')?.key, 'businessRules');
    assert.deepEqual(resolveRaInlineEditTarget({ id: 'artifact' }, 'FR'), {
      scope: 'top',
      key: 'title',
    });
    assert.equal(resolveRaInlineEditTarget({ id: 'priority' }, 'FR')?.choice, true);
  });

  it('aliases expectedOutcome → expectedBusinessOutcome', () => {
    const t = resolveRaInlineEditTarget({ id: 'expectedOutcome' }, 'BG');
    assert.equal(t?.scope, 'structured');
    assert.equal(t?.key, 'expectedBusinessOutcome');
    assert.equal(t?.multiline, true);
  });

  it('read/write form values', () => {
    let form = { top: { title: 'A' }, structured: { priority: 'High' } };
    assert.equal(readInlineFormValue(form, { scope: 'top', key: 'title' }), 'A');
    form = writeInlineFormValue(form, { scope: 'structured', key: 'priority' }, 'Critical');
    assert.equal(form.structured.priority, 'Critical');
  });

  it('every analysis content column can be edited', () => {
    const locked = new Set(['id', 'status', 'source', 'importSet']);
    const missed = [];
    for (const kind of ['BG', 'BR', 'BPM', 'FR', 'UC', 'NFR', 'SCOPE', 'INTERFACE', 'DATA', 'GLOSSARY', 'ASSUMPTION']) {
      for (const col of getArtifactListColumnCatalog(kind)) {
        const target = resolveRaInlineEditTarget(col, kind);
        if (locked.has(col.id)) {
          if (target) missed.push(`${kind}:${col.id} should be locked`);
        } else if (!target) {
          missed.push(`${kind}:${col.id}`);
        }
      }
    }
    assert.deepEqual(missed, []);
  });

  it('planning locks status/externalKey', () => {
    assert.equal(resolvePlanningInlineEditTarget({ id: 'status' }), null);
    assert.equal(resolvePlanningInlineEditTarget({ id: 'externalKey' }), null);
    assert.equal(resolvePlanningInlineEditTarget({ id: 'title' })?.key, 'title');
  });
});
