import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatReworkNoteDisplay } from './formatReworkNoteDisplay.js';

describe('formatReworkNoteDisplay', () => {
  it('extracts bug title from legacy duplicated note', () => {
    const raw =
      'QA mở bug → về To Do. Bug: [Bug] TC-11: o | Đã mở bug: [Bug] TC-11: o';
    assert.equal(formatReworkNoteDisplay(raw).bugTitle, 'TC-11: o');
  });

  it('extracts bug title from short BE note', () => {
    assert.equal(
      formatReworkNoteDisplay('QA mở bug · [Bug] Login fail').bugTitle,
      'Login fail'
    );
  });

  it('returns empty for blank', () => {
    assert.equal(formatReworkNoteDisplay('').bugTitle, '');
    assert.equal(formatReworkNoteDisplay(null).bugTitle, '');
  });
});
