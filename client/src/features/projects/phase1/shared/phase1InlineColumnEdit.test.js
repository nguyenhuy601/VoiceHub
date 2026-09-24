import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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

  it('planning locks status/externalKey', () => {
    assert.equal(resolvePlanningInlineEditTarget({ id: 'status' }), null);
    assert.equal(resolvePlanningInlineEditTarget({ id: 'externalKey' }), null);
    assert.equal(resolvePlanningInlineEditTarget({ id: 'title' })?.key, 'title');
  });
});
