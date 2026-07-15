import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenOrgStructure } from './adminOrgStructureUtils.js';

test('flatten includes division from divisionsFlat when branches empty', () => {
  const { divisions } = flattenOrgStructure({
    branches: [],
    divisionsFlat: [{ _id: 'd1', name: 'Engineering', departments: [] }],
  });
  assert.equal(divisions.length, 1);
  assert.equal(divisions[0]._id, 'd1');
});

test('flatten under synthetic branch still lists real division', () => {
  const { divisions, departments } = flattenOrgStructure({
    branches: [
      {
        _id: 'synth',
        isSynthetic: true,
        name: 'Organization',
        divisions: [
          {
            _id: 'd1',
            name: 'Khối A',
            departments: [{ _id: 'dep1', name: 'BE', teams: [] }],
          },
        ],
      },
    ],
  });
  assert.equal(divisions.length, 1);
  assert.equal(departments.length, 1);
  assert.equal(divisions[0].branchId, '');
});

test('dedupe divisionsFlat + branches', () => {
  const { divisions } = flattenOrgStructure({
    branches: [
      {
        _id: 'b1',
        name: 'HN',
        divisions: [{ _id: 'd1', name: 'A', departments: [] }],
      },
    ],
    divisionsFlat: [{ _id: 'd1', name: 'A', departments: [] }],
  });
  assert.equal(divisions.length, 1);
});

test('structureSource ou skips divisionsFlat to avoid OU/legacy duplicates', () => {
  const { divisions } = flattenOrgStructure({
    structureSource: 'ou',
    branches: [
      {
        _id: 'synth',
        isSynthetic: true,
        divisions: [{ _id: 'legacy-d1', name: 'Công Nghệ', departments: [] }],
      },
    ],
    divisionsFlat: [{ _id: 'legacy-d1', name: 'Công Nghệ', departments: [] }],
  });
  assert.equal(divisions.length, 1);
});

test('flatten excludes division node from department picker list', () => {
  const { departments, divisions } = flattenOrgStructure({
    structureSource: 'ou',
    branches: [
      {
        _id: 'synth',
        isSynthetic: true,
        divisions: [
          {
            _id: 'div1',
            name: 'Khối mặc định',
            levelKey: 'division',
            departments: [
              {
                _id: 'div1',
                name: 'Khối mặc định',
                levelKey: 'division',
                teams: [],
              },
              {
                _id: 'dep1',
                name: 'Phòng Phát triển',
                levelKey: 'department',
                teams: [],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(divisions.length, 1);
  assert.equal(departments.length, 1);
  assert.equal(departments[0]._id, 'dep1');
});
