const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildEmailConflictDetails } = require('../src/utils/orgImportEmailGate');

describe('orgImportEmailGate', () => {
  it('flags emails already members and pending invites', () => {
    const rows = [
      { rowNumber: 3, email: 'nv.be.lead@voicehub.local' },
      { rowNumber: 4, email: 'new.hire@voicehub.local' },
      { rowNumber: 5, email: 'pending@voicehub.local' },
    ];
    const details = buildEmailConflictDetails(
      rows,
      new Set(['nv.be.lead@voicehub.local']),
      new Set(['pending@voicehub.local'])
    );
    assert.equal(details.length, 2);
    assert.equal(details[0].errorCode, 'VALIDATION_EMAIL_ALREADY_MEMBER');
    assert.equal(details[0].rowNumber, 3);
    assert.equal(details[1].errorCode, 'VALIDATION_EMAIL_PENDING_INVITE');
    assert.equal(details[1].rowNumber, 5);
  });

  it('is case-insensitive via pre-normalized sets', () => {
    const details = buildEmailConflictDetails(
      [{ rowNumber: 1, email: 'A@VoiceHub.Local' }],
      new Set(['a@voicehub.local']),
      new Set()
    );
    // caller must normalize row email — gate normalizes inside build
    assert.equal(details.length, 1);
    assert.equal(details[0].errorCode, 'VALIDATION_EMAIL_ALREADY_MEMBER');
  });

  it('returns empty when no overlap', () => {
    const details = buildEmailConflictDetails(
      [{ rowNumber: 1, email: 'fresh@voicehub.local' }],
      new Set(['other@voicehub.local']),
      new Set()
    );
    assert.equal(details.length, 0);
  });
});
