const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatEmployeeCode,
  parseSeqFromCode,
} = require('../src/services/employeeCodeAllocate.service');

describe('employeeCodeAllocate helpers', () => {
  it('formats VH- padded codes', () => {
    assert.equal(formatEmployeeCode(1), 'VH-001');
    assert.equal(formatEmployeeCode(211), 'VH-211');
  });

  it('parses seq from code', () => {
    assert.equal(parseSeqFromCode('VH-009'), 9);
    assert.equal(parseSeqFromCode('vh-210'), 210);
    assert.equal(parseSeqFromCode('NV-1'), null);
    assert.equal(parseSeqFromCode(''), null);
  });
});
