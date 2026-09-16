import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterOrgFilesByScope,
  flattenChannelsFromStructure,
  resolveOrgFileOpenUrl,
  toDriveAttachmentRef,
} from './orgDocumentUtils.js';

describe('flattenChannelsFromStructure', () => {
  it('gắn departmentId và teamId lên kênh', () => {
    const channels = flattenChannelsFromStructure([
      {
        divisions: [
          {
            departments: [
              {
                _id: 'dept1',
                channels: [{ _id: 'ch-dept', name: 'announce', type: 'announcement' }],
                teams: [
                  {
                    _id: 'team-a',
                    channels: [{ _id: 'ch-team-a', name: 'general', type: 'chat' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const deptCh = channels.find((c) => c._id === 'ch-dept');
    const teamCh = channels.find((c) => c._id === 'ch-team-a');
    assert.equal(deptCh.departmentId, 'dept1');
    assert.equal(deptCh.teamId, '');
    assert.equal(teamCh.departmentId, 'dept1');
    assert.equal(teamCh.teamId, 'team-a');
  });
});

describe('resolveOrgFileOpenUrl', () => {
  it('ưu tiên url trực tiếp', () => {
    assert.equal(
      resolveOrgFileOpenUrl({ url: 'https://cdn.example/a.md' }),
      'https://cdn.example/a.md'
    );
  });

  it('lấy từ raw.signedReadUrl khi thiếu url', () => {
    assert.equal(
      resolveOrgFileOpenUrl({
        url: '',
        raw: { signedReadUrl: 'https://cdn.example/signed.md' },
      }),
      'https://cdn.example/signed.md'
    );
  });

  it('rỗng khi không có URL mở được', () => {
    assert.equal(resolveOrgFileOpenUrl({ name: 'x', raw: { foo: 1 } }), '');
  });
});

describe('toDriveAttachmentRef', () => {
  it('không nuốt storage path khi file.url rỗng', () => {
    const ref = toDriveAttachmentRef({
      name: 'demo.md',
      url: '',
      storagePath: '',
      raw: { url: 'temp/u1/x_demo.md', name: 'demo.md' },
    });
    assert.equal(ref.url, 'temp/u1/x_demo.md');
    assert.equal(ref.storagePath, 'temp/u1/x_demo.md');
  });
});
describe('filterOrgFilesByScope', () => {
  const files = [
    { id: '1', source: 'message', category: 'channel_chat', teamId: 'team-a', roomId: 'ch-a', departmentId: 'd1' },
    { id: '2', source: 'message', category: 'channel_chat', teamId: 'team-b', roomId: 'ch-b', departmentId: 'd1' },
    { id: '3', source: 'library', category: 'library', roomId: '', departmentId: '' },
    { id: '4', source: 'message', category: 'announcement', roomId: 'ch-dept', departmentId: 'd1' },
  ];

  it('team Be-1 không lẫn file Be-2', () => {
    const scoped = filterOrgFilesByScope(files, {
      departmentId: 'd1',
      teamId: 'team-a',
      teamChannelIds: ['ch-a'],
    });
    const ids = scoped.map((f) => f.id).sort();
    assert.deepEqual(ids, ['1', '3']);
  });

  it('project chỉ giữ file cùng projectId', () => {
    const mixed = [
      { id: 'p1', projectId: 'proj-a', source: 'library', category: 'library' },
      { id: 'p2', projectId: 'proj-b', source: 'library', category: 'library' },
      { id: 'p3', source: 'library', category: 'library' },
    ];
    const scoped = filterOrgFilesByScope(mixed, { projectId: 'proj-a' });
    assert.deepEqual(scoped.map((f) => f.id), ['p1']);
  });

  it('phòng gồm announce + library shared', () => {
    const scoped = filterOrgFilesByScope(files, {
      departmentId: 'd1',
      departmentChannelIds: ['ch-dept', 'ch-a', 'ch-b'],
    });
    const ids = scoped.map((f) => f.id).sort();
    assert.deepEqual(ids, ['1', '2', '3', '4']);
  });
});
