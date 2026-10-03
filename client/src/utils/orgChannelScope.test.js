import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  channelsForTeam,
  channelsUnderDepartment,
  resolveScopedWorkspaceChannels,
  isProjectScopedChannel,
  groupProjectChannelsByProject,
  preferDefaultTextChannelId,
  channelBelongsToTeamScope,
  resolveLineChatScope,
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

describe('channelsUnderDepartment', () => {
  it('gồm kênh phòng + kênh team con, loại project', () => {
    const list = channelsUnderDepartment(
      [
        { _id: 'dept-g', department: 'd1', team: null, name: 'general' },
        { _id: 'team-g', department: 'd1', team: 't1', name: 'general' },
        { _id: 'other', department: 'd2', team: null, name: 'general' },
        { _id: 'pj', projectId: 'p1', department: 'd1', name: 'general' },
      ],
      'd1'
    );
    assert.deepEqual(
      list.map((c) => c._id).sort(),
      ['dept-g', 'team-g']
    );
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

  it('excludes project channels from org workspace scope', () => {
    const channels = [
      { _id: 'team-g', department: 'd1', team: 't1', name: 'general' },
      { _id: 'pj-g', projectId: 'p1', projectChannelKind: 'general', name: 'general' },
    ];
    const scoped = resolveScopedWorkspaceChannels(channels, { teamId: 't1', departmentId: 'd1' });
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0]._id, 'team-g');
    assert.equal(isProjectScopedChannel({ projectId: 'p1' }), true);
  });

  it('groups project channels by projectId', () => {
    const groups = groupProjectChannelsByProject([
      { _id: 'c2', projectId: 'p1', projectChannelKind: 'announcement', projectName: 'Coffee' },
      { _id: 'c1', projectId: 'p1', projectChannelKind: 'general', projectName: 'Coffee' },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].projectName, 'Coffee');
    assert.equal(groups[0].channels[0].projectChannelKind, 'general');
  });
});

describe('preferDefaultTextChannelId (org scope)', () => {
  const channels = [
    { _id: 'dept-g', department: 'd1', team: null, name: 'general', type: 'chat' },
    { _id: 'team-a', department: 'd1', team: 't1', name: 'general', type: 'chat' },
  ];

  it('team có kênh → id team, không lấy phòng', () => {
    assert.equal(preferDefaultTextChannelId(channels, 't1', null, 'd1', false), 'team-a');
  });

  it('team không có kênh → rỗng', () => {
    assert.equal(preferDefaultTextChannelId(channels, 't-missing', null, 'd1', false), '');
  });
});

describe('resolveLineChatScope', () => {
  it('team thắng phòng khi có selectedTeamId', () => {
    assert.equal(
      resolveLineChatScope({
        departmentWorkspaceActive: true,
        selectedTeamId: 't1',
        channel: { department: 'd1', team: 't1' },
      }),
      'team'
    );
  });

  it('phòng khi workspace phòng và không team', () => {
    assert.equal(
      resolveLineChatScope({
        departmentWorkspaceActive: true,
        selectedTeamId: '',
        channel: { department: 'd1', team: null },
      }),
      'dept'
    );
  });

  it('null trên kênh dự án', () => {
    assert.equal(
      resolveLineChatScope({
        departmentWorkspaceActive: true,
        selectedTeamId: '',
        channel: { projectId: 'p1', name: 'general' },
      }),
      null
    );
  });
});

describe('channelBelongsToTeamScope', () => {
  it('kênh phòng không thuộc team trên URL', () => {
    assert.equal(
      channelBelongsToTeamScope({ _id: 'dept-g', department: 'd1', team: null }, 't1'),
      false
    );
  });

  it('kênh team khớp teamId', () => {
    assert.equal(
      channelBelongsToTeamScope({ _id: 'team-g', department: 'd1', team: 't1' }, 't1'),
      true
    );
  });
});
