const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ProjectRole = require('../src/models/ProjectRole');
const DelegationEdge = require('../src/models/DelegationEdge');

describe('delegation.upsertEdge role scope', () => {
  it('rejects roles from another organization', async () => {
    const findStub = mock.method(ProjectRole, 'find', () => ({
      select() {
        return {
          lean: async () => [
            { _id: '0123456789abcdef01234567', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
            { _id: '0123456789abcdef01234568', organizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
          ],
        };
      },
    }));

    const { upsertEdge } = require('../src/services/delegation.service');
    await assert.rejects(
      () =>
        upsertEdge({
          boardId: '0123456789abcdef01234569',
          organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          fromRoleId: '0123456789abcdef01234567',
          toRoleId: '0123456789abcdef01234568',
          taskTypes: ['bug'],
        }),
      (err) => err.errorCode === 'DELEGATION_ROLE_INVALID' && err.statusCode === 400
    );
    findStub.mock.restore();
    // Clear require cache so later tests get a clean module if needed
    delete require.cache[path.resolve(__dirname, '../src/services/delegation.service.js')];
  });

  it('rejects more than 20 taskTypes', async () => {
    const findStub = mock.method(ProjectRole, 'find', () => ({
      select() {
        return {
          lean: async () => [
            { _id: '0123456789abcdef01234567', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
            { _id: '0123456789abcdef01234568', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
          ],
        };
      },
    }));
    const { upsertEdge } = require('../src/services/delegation.service');
    await assert.rejects(
      () =>
        upsertEdge({
          boardId: '0123456789abcdef01234569',
          organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          fromRoleId: '0123456789abcdef01234567',
          toRoleId: '0123456789abcdef01234568',
          taskTypes: Array.from({ length: 21 }, (_, i) => `t${i}`),
        }),
      (err) => err.errorCode === 'VALIDATION_FAILED'
    );
    findStub.mock.restore();
    delete require.cache[path.resolve(__dirname, '../src/services/delegation.service.js')];
  });

  it('rejects taskType longer than 64 chars', async () => {
    const findStub = mock.method(ProjectRole, 'find', () => ({
      select() {
        return {
          lean: async () => [
            { _id: '0123456789abcdef01234567', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
            { _id: '0123456789abcdef01234568', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
          ],
        };
      },
    }));
    const { upsertEdge } = require('../src/services/delegation.service');
    await assert.rejects(
      () =>
        upsertEdge({
          boardId: '0123456789abcdef01234569',
          organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          fromRoleId: '0123456789abcdef01234567',
          toRoleId: '0123456789abcdef01234568',
          taskTypes: ['a'.repeat(65)],
        }),
      (err) => err.errorCode === 'VALIDATION_FAILED'
    );
    findStub.mock.restore();
    delete require.cache[path.resolve(__dirname, '../src/services/delegation.service.js')];
  });

  it('upserts when roles match org', async () => {
    const findStub = mock.method(ProjectRole, 'find', () => ({
      select() {
        return {
          lean: async () => [
            { _id: '0123456789abcdef01234567', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
            { _id: '0123456789abcdef01234568', organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
          ],
        };
      },
    }));
    let updateCalls = 0;
    const updateStub = mock.method(DelegationEdge, 'findOneAndUpdate', () => {
      updateCalls += 1;
      return { lean: async () => ({ _id: 'edge1' }) };
    });
    const { upsertEdge } = require('../src/services/delegation.service');
    const edge = await upsertEdge({
      boardId: '0123456789abcdef01234569',
      organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      fromRoleId: '0123456789abcdef01234567',
      toRoleId: '0123456789abcdef01234568',
      taskTypes: ['bug'],
    });
    assert.equal(edge._id, 'edge1');
    assert.equal(updateCalls, 1);
    findStub.mock.restore();
    updateStub.mock.restore();
    delete require.cache[path.resolve(__dirname, '../src/services/delegation.service.js')];
  });
});
