/**
 * Huy: Unit — nestLegacyOrgStructure giữ unit orphan (branch/division null).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { nestLegacyOrgStructure } = require('../src/services/nestLegacyOrgStructure');

describe('nestLegacyOrgStructure', () => {
  it('division without branch appears under synthetic Organization branch', () => {
    const { branches, divisionsFlat } = nestLegacyOrgStructure({
      orgId: 'o1',
      branches: [],
      divisions: [{ _id: 'd1', name: 'Engineering', branch: null, isActive: true }],
      departments: [],
      teams: [],
    });
    assert.equal(branches.length, 1);
    assert.equal(branches[0].isSynthetic, true);
    assert.equal(branches[0].divisions.length, 1);
    assert.equal(branches[0].divisions[0]._id, 'd1');
    assert.equal(divisionsFlat.length, 1);
    assert.equal(divisionsFlat[0]._id, 'd1');
  });

  it('team under division (no department) wrapped for flatten', () => {
    const { branches } = nestLegacyOrgStructure({
      orgId: 'o1',
      branches: [],
      divisions: [{ _id: 'div1', name: 'Product', branch: null }],
      departments: [],
      teams: [{ _id: 't1', name: 'Alpha', division: 'div1', department: null }],
    });
    const depts = branches[0].divisions[0].departments;
    assert.equal(depts.length, 1);
    assert.equal(depts[0].isSynthetic, true);
    assert.equal(depts[0].teams[0]._id, 't1');
  });

  it('department root (no division) nested under synthetic division', () => {
    const { branches } = nestLegacyOrgStructure({
      orgId: 'o1',
      branches: [],
      divisions: [],
      departments: [{ _id: 'dep1', name: 'Eng', division: null }],
      teams: [],
    });
    assert.equal(branches[0].divisions[0].isSynthetic, true);
    assert.equal(branches[0].divisions[0].departments[0]._id, 'dep1');
  });

  it('branch + division still nests normally', () => {
    const { branches } = nestLegacyOrgStructure({
      orgId: 'o1',
      branches: [{ _id: 'b1', name: 'HN', isActive: true }],
      divisions: [{ _id: 'd1', name: 'Khối A', branch: 'b1' }],
      departments: [{ _id: 'dep1', name: 'BE', division: 'd1' }],
      teams: [{ _id: 't1', name: 'T1', department: 'dep1', division: 'd1' }],
    });
    assert.equal(branches.length, 1);
    assert.equal(branches[0].divisions[0].departments[0].teams[0]._id, 't1');
  });
});
