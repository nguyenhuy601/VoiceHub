const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveEmployeeProfileAccessMode,
  collectValidProjectIds,
} = require('../src/utils/employeeProfileAccess');

describe('employee resource profile access', () => {
  const uid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const other = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  it('self actor === target → self (no org-capacity gate)', () => {
    assert.equal(resolveEmployeeProfileAccessMode(uid, uid), 'self');
  });

  it('other user → elevated (capacity gate)', () => {
    assert.equal(resolveEmployeeProfileAccessMode(uid, other), 'elevated');
  });

  it('missing ids → invalid', () => {
    assert.equal(resolveEmployeeProfileAccessMode('', uid), 'invalid');
    assert.equal(resolveEmployeeProfileAccessMode(uid, ''), 'invalid');
  });
});

describe('collectValidProjectIds', () => {
  it('drops undefined / "undefined" / null so Project.find $in will not CastError', () => {
    const oid = '6a55d5f01234567890123456';
    assert.deepEqual(
      collectValidProjectIds([undefined, 'undefined', null, oid, oid, '']),
      [oid]
    );
  });
});
