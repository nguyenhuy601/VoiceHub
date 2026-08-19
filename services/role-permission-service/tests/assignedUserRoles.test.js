const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mongoose } = require('@enterprise/shared/config/mongo');
const {
  parseObjectId,
  serializeAssignedRole,
  mapPopulatedUserRoles,
} = require('../src/utils/assignedUserRoles');

describe('assignedUserRoles', () => {
  it('parseObjectId accepts 24-hex and rejects invalid', () => {
    const id = parseObjectId('6a7b11d94d4f989176adacb5', 'userId');
    assert.equal(String(id), '6a7b11d94d4f989176adacb5');
    assert.throws(() => parseObjectId('not-an-id', 'userId'), /userId không hợp lệ/);
    assert.throws(() => parseObjectId('', 'serverId'), /serverId không hợp lệ/);
  });

  it('serializeAssignedRole adds id/roleId aliases and drops empty', () => {
    const oid = new mongoose.Types.ObjectId('6a7533772670b7fc2fc5183b');
    const row = serializeAssignedRole({
      _id: oid,
      name: 'Gói quyền — Viewer',
      scope: 'ORGANIZATION',
    });
    assert.equal(row._id, '6a7533772670b7fc2fc5183b');
    assert.equal(row.id, '6a7533772670b7fc2fc5183b');
    assert.equal(row.roleId, '6a7533772670b7fc2fc5183b');
    assert.equal(row.name, 'Gói quyền — Viewer');
    assert.equal(serializeAssignedRole(null), null);
    assert.equal(serializeAssignedRole({ name: 'x' }), null);
  });

  it('mapPopulatedUserRoles skips missing populate', () => {
    const list = mapPopulatedUserRoles([
      { roleId: null },
      { roleId: { _id: '6a7533732670b7fc2fc51799', name: 'Gói quyền — Organization Admin' } },
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].roleId, '6a7533732670b7fc2fc51799');
    assert.equal(list[0].name, 'Gói quyền — Organization Admin');
  });
});
