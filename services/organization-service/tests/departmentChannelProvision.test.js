const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_DEPT_CHANNEL_DEFS,
  buildExistingDefaultChannelQuery,
  isDepartmentDefaultAnnounceChannel,
  selectDepartmentAnnounceKeepers,
} = require('../src/services/departmentChannelProvision.logic');

describe('departmentChannelProvision', () => {
  it('seeds announcement-only default def', () => {
    assert.equal(DEFAULT_DEPT_CHANNEL_DEFS.length, 1);
    assert.equal(DEFAULT_DEPT_CHANNEL_DEFS[0].name, 'announcements');
    assert.equal(DEFAULT_DEPT_CHANNEL_DEFS[0].type, 'announcement');
  });

  it('existing query matches type or name (case-insensitive)', () => {
    const q = buildExistingDefaultChannelQuery('org1', 'dept1', DEFAULT_DEPT_CHANNEL_DEFS[0]);
    assert.equal(q.organization, 'org1');
    assert.equal(q.department, 'dept1');
    assert.equal(q.team, null);
    assert.equal(q.isActive, true);
    assert.ok(Array.isArray(q.$or));
    assert.equal(q.$or[0].type, 'announcement');
    assert.ok(q.$or[1].name.test('Announcements'));
    assert.ok(q.$or[1].name.test('announcements'));
    assert.equal(q.$or[1].name.test('general'), false);
  });

  it('keeps oldest announce per department and drops later duplicates', () => {
    const channels = [
      {
        _id: 'a1',
        department: 'd1',
        team: null,
        type: 'announcement',
        name: 'announcements',
        createdAt: '2024-01-02T00:00:00.000Z',
        isActive: true,
      },
      {
        _id: 'a0',
        department: 'd1',
        team: null,
        type: 'announcement',
        name: 'announcements',
        createdAt: '2024-01-01T00:00:00.000Z',
        isActive: true,
      },
      {
        _id: 'a2',
        department: 'd1',
        team: null,
        type: 'chat',
        name: 'announcements',
        createdAt: '2024-01-03T00:00:00.000Z',
        isActive: true,
      },
      {
        _id: 'g1',
        department: 'd1',
        team: null,
        type: 'chat',
        name: 'general',
        createdAt: '2024-01-01T00:00:00.000Z',
        isActive: true,
      },
      {
        _id: 'b0',
        department: 'd2',
        team: null,
        type: 'announcement',
        name: 'announcements',
        createdAt: '2024-02-01T00:00:00.000Z',
        isActive: true,
      },
    ];

    assert.equal(isDepartmentDefaultAnnounceChannel(channels[0]), true);
    assert.equal(isDepartmentDefaultAnnounceChannel(channels[3]), false);

    const keepers = selectDepartmentAnnounceKeepers(channels);
    assert.deepEqual([...keepers].sort(), ['a0', 'b0']);
  });
});
