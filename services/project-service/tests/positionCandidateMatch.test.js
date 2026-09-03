const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePositionKeyFromJobTitle,
  preferredPositionsForProjectRole,
  inferProjectRoleKeysFromJobTitle,
  scorePositionMatch,
} = require('../src/utils/positionCandidateMatch');

describe('positionCandidateMatch', () => {
  it('resolves jobTitle to master position key', () => {
    assert.equal(resolvePositionKeyFromJobTitle('Software Developer'), 'software_developer');
    assert.equal(resolvePositionKeyFromJobTitle('qa engineer'), 'qa_engineer');
  });

  it('respects enabledPositionKeys subset', () => {
    assert.equal(
      resolvePositionKeyFromJobTitle('Software Developer', ['qa_engineer']),
      ''
    );
    assert.equal(
      resolvePositionKeyFromJobTitle('QA Engineer', ['qa_engineer']),
      'qa_engineer'
    );
  });

  it('preferred positions for project role boost scoring', () => {
    const prefs = preferredPositionsForProjectRole('backend_developer');
    assert.ok(prefs.includes('software_developer'));

    const preferred = scorePositionMatch({
      jobTitle: 'Software Developer',
      projectRoleKey: 'backend_developer',
      enabledPositionKeys: null,
    });
    assert.equal(preferred.matchKey, 'software_developer');
    assert.equal(preferred.preferred, true);
    assert.equal(preferred.boost, 15);
    assert.equal(preferred.reason, 'position_preferred');

    const enabledOnly = scorePositionMatch({
      jobTitle: 'UX Designer',
      projectRoleKey: 'backend_developer',
      enabledPositionKeys: null,
    });
    assert.equal(enabledOnly.matchKey, 'ux_designer');
    assert.equal(enabledOnly.preferred, false);
    assert.equal(enabledOnly.boost, 8);
    assert.equal(enabledOnly.reason, 'position_enabled');
  });

  it('no jobTitle → zero boost', () => {
    const empty = scorePositionMatch({
      jobTitle: '',
      projectRoleKey: 'qa_engineer',
      enabledPositionKeys: null,
    });
    assert.equal(empty.boost, 0);
    assert.equal(empty.reason, null);
  });

  it('inferProjectRoleKeysFromJobTitle reverse-maps position to project roles', () => {
    const roles = inferProjectRoleKeysFromJobTitle('Software Developer');
    assert.ok(roles.includes('frontend_developer'));
    assert.ok(roles.includes('backend_developer'));
    assert.deepEqual(inferProjectRoleKeysFromJobTitle(''), []);
  });
});
