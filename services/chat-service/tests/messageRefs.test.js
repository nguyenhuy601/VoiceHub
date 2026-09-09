const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMessageRefs } = require('../src/utils/messageRefs');

const OID_A = '507f1f77bcf86cd799439011';
const OID_B = '507f191e810c19729de860ea';

describe('parseMessageRefs (T1)', () => {
  it('accepts empty / omitted', () => {
    assert.deepEqual(parseMessageRefs(undefined).refs, []);
    assert.equal(parseMessageRefs(undefined).error, null);
    assert.deepEqual(parseMessageRefs([]).refs, []);
  });

  it('accepts task and change_request', () => {
    const task = parseMessageRefs([
      { kind: 'task', id: OID_A, projectId: OID_B, label: 'HKT-A1B2' },
    ]);
    assert.equal(task.error, null);
    assert.equal(task.refs[0].kind, 'task');
    assert.equal(task.refs[0].label, 'HKT-A1B2');

    const cr = parseMessageRefs([{ kind: 'change_request', id: OID_A, projectId: OID_B }]);
    assert.equal(cr.error, null);
    assert.equal(cr.refs[0].kind, 'change_request');
  });

  it('rejects unknown kind', () => {
    const out = parseMessageRefs([{ kind: 'sprint', id: OID_A, projectId: OID_B }]);
    assert.match(String(out.error), /kind/);
    assert.equal(out.refs.length, 0);
  });

  it('rejects invalid ids and extra items', () => {
    assert.ok(parseMessageRefs([{ kind: 'task', id: 'nope', projectId: OID_B }]).error);
    assert.ok(
      parseMessageRefs([
        { kind: 'task', id: OID_A, projectId: OID_B },
        { kind: 'task', id: OID_B, projectId: OID_A },
      ]).error
    );
    assert.ok(parseMessageRefs({ kind: 'task' }).error);
  });
});
