const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatEmployeeCode,
  parseSeqFromCode,
  canonicalizeEmployeeCode,
} = require('../src/utils/employeeCodePolicy');

describe('employeeCodePolicy', () => {
  it('formats padded VH- codes', () => {
    assert.equal(formatEmployeeCode(1), 'VH-001');
    assert.equal(formatEmployeeCode(211), 'VH-211');
  });

  it('parses seq from VH-001 / VH001', () => {
    assert.equal(parseSeqFromCode('VH-001'), 1);
    assert.equal(parseSeqFromCode('vh-021'), 21);
    assert.equal(parseSeqFromCode('NV-01'), null);
  });

  it('canonicalize pads and accepts bare prefix', () => {
    assert.deepEqual(canonicalizeEmployeeCode('vh-1'), {
      ok: true,
      value: 'VH-001',
      empty: false,
    });
    assert.equal(canonicalizeEmployeeCode('VH001').value, 'VH-001');
  });

  it('canonicalize allowEmpty', () => {
    const empty = canonicalizeEmployeeCode('', { allowEmpty: true });
    assert.equal(empty.ok, true);
    assert.equal(empty.value, null);
    assert.equal(empty.empty, true);

    const required = canonicalizeEmployeeCode('');
    assert.equal(required.ok, false);
    assert.equal(required.errorCode, 'VALIDATION_EMPLOYEE_CODE_REQUIRED');
  });

  it('rejects NV and garbage', () => {
    assert.equal(canonicalizeEmployeeCode('NV001').ok, false);
    assert.equal(canonicalizeEmployeeCode('VH 001').ok, false);
    assert.equal(canonicalizeEmployeeCode('ABC-1').errorCode, 'VALIDATION_EMPLOYEE_CODE_FORMAT');
  });
});
