const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectCodeBase,
  allocateUniqueProjectCode,
  nameKeyword,
} = require('../utils/projectCodeGenerate');

describe('projectCodeGenerate (acronym from title)', () => {
  it('Sales Management → SM', () => {
    assert.equal(buildProjectCodeBase({ title: 'Sales Management' }), 'SM');
    assert.equal(nameKeyword('Sales Management'), 'SM');
  });

  it('Human Resource → HR', () => {
    assert.equal(buildProjectCodeBase({ title: 'Human Resource' }), 'HR');
  });

  it('Customer Relationship Management → CRM', () => {
    assert.equal(buildProjectCodeBase({ title: 'Customer Relationship Management' }), 'CRM');
  });

  it('Inventory System → IS', () => {
    assert.equal(buildProjectCodeBase({ title: 'Inventory System' }), 'IS');
  });

  it('single word → first 3 letters', () => {
    assert.equal(buildProjectCodeBase({ title: 'ERP' }), 'ERP');
    assert.equal(buildProjectCodeBase({ title: 'Platform' }), 'PLA');
  });

  it('Vietnamese diacritics stripped then acronym', () => {
    assert.equal(buildProjectCodeBase({ title: 'Quản lý bán hàng' }), 'QLBH');
  });

  it('collision → -1 then -2', () => {
    const base = 'CRM';
    assert.equal(allocateUniqueProjectCode(base, []), 'CRM');
    assert.equal(allocateUniqueProjectCode(base, ['CRM']), 'CRM-1');
    assert.equal(allocateUniqueProjectCode(base, ['CRM', 'CRM-1']), 'CRM-2');
  });

  it('empty title → PRJ', () => {
    assert.equal(buildProjectCodeBase({ title: '' }), 'PRJ');
  });
});
