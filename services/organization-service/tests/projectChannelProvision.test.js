const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CORE_KIND_DEFS,
  coreFindFilter,
  teamFindFilter,
} = require('../src/services/projectChannelProvision.service');

describe('projectChannelProvision queries', () => {
  it('seeds exactly three core kinds — no sprint/work/cr', () => {
    assert.deepEqual(
      CORE_KIND_DEFS.map((d) => d.kind).sort(),
      ['announcement', 'cross_team', 'general']
    );
    assert.equal(
      CORE_KIND_DEFS.some((d) => /sprint|(?:^|[-_])work(?:$|[-_])|(?:^|[-_])cr(?:$|[-_])/i.test(d.name)),
      false
    );
  });

  it('core find is scoped by organization + projectId + kind', () => {
    const q = coreFindFilter('org1', 'proj1', 'general');
    assert.equal(q.organization, 'org1');
    assert.equal(q.projectId, 'proj1');
    assert.equal(q.projectChannelKind, 'general');
    assert.equal(q.team, undefined);
  });

  it('team find uses org Team id — not a work key', () => {
    const q = teamFindFilter('org1', 'proj1', 'team-be');
    assert.equal(q.projectChannelKind, 'team');
    assert.equal(q.team, 'team-be');
  });
});
