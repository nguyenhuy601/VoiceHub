import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  channelsForTeam,
  resolveScopedWorkspaceChannels,
} from './orgChannelScope.js';

describe('channelsForTeam', () => {
  it('dedupe theo _id', () => {
    const list = channelsForTeam(
      [
        { _id: 'c1', team: 't1', name: 'general' },
        { _id: 'c1', team: 't1', name: 'general' },
        { _id: 'c2', team: 't2', name: 'general' },
      ],
      't1'
    );
    assert.equal(list.length, 1);
    assert.equal(list[0]._id, 'c1');
  });
});

describe('resolveScopedWorkspaceChannels', () => {
  it('khi có teamId chỉ trả kênh team — không lẫn kênh phòng cùng tên', () => {
    const channels = [
      { _id: 'dept-g', department: 'd1', team: null, name: 'general', type: 'chat' },
      { _id: 'dept-v', department: 'd1', team: null, name: 'voice', type: 'voice' },
      { _id: 'team-g', department: 'd1', team: 't1', name: 'general', type: 'chat' },
      { _id: 'team-v', department: 'd1', team: 't1', name: 'voice', type: 'voice' },
    ];
    const scoped = resolveScopedWorkspaceChannels(channels, {
      teamId: 't1',
      departmentId: 'd1',
    });
    assert.equal(scoped.length, 2);
    assert.deepEqual(
      scoped.map((c) => c._id).sort(),
      ['team-g', 'team-v']
    );
  });

  it('departmentOnly / chỉ dept → kênh phòng', () => {
    const channels = [
      { _id: 'dept-g', department: 'd1', team: null, name: 'general' },
      { _id: 'team-g', department: 'd1', team: 't1', name: 'general' },
    ];
    const scoped = resolveScopedWorkspaceChannels(channels, {
      departmentId: 'd1',
      departmentOnly: true,
    });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]._id, 'dept-g');
  });
});
