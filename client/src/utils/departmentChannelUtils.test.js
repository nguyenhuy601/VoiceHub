import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preferDefaultTextChannelId } from './departmentChannelUtils.js';

describe('preferDefaultTextChannelId', () => {
  const channels = [
    { _id: 'dept-g', department: 'd1', team: null, name: 'general', type: 'chat' },
    { _id: 'team-a', department: 'd1', team: 't1', name: 'general', type: 'chat' },
  ];

  it('team có kênh riêng → không lấy kênh phòng', () => {
    const id = preferDefaultTextChannelId(channels, {
      preferredTeamId: 't1',
      preferredDepartmentId: 'd1',
    });
    assert.equal(id, 'team-a');
  });

  it('team không có kênh → rỗng (không fallback phòng)', () => {
    const id = preferDefaultTextChannelId(channels, {
      preferredTeamId: 't-missing',
      preferredDepartmentId: 'd1',
    });
    assert.equal(id, '');
  });

  it('deptOnly → kênh phòng', () => {
    const id = preferDefaultTextChannelId(channels, {
      preferredDepartmentId: 'd1',
      deptOnly: true,
    });
    assert.equal(id, 'dept-g');
  });
});
