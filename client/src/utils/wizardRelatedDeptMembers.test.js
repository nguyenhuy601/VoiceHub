import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterMembersByRelatedDepts,
  isWorkloadFull,
  isWorkloadPartial,
  buildPlannerLoadByUserId,
} from './wizardRelatedDeptMembers.js';

const orgMembers = [
  { userId: 'u1', displayName: 'An', departmentId: 'd1' },
  { userId: 'u2', displayName: 'Bình', departmentId: 'd2' },
  { userId: 'u3', displayName: 'Chi', departmentId: '' },
];

const structureDepts = [
  { _id: 'd1', name: 'Dev', members: [{ userId: 'u1' }] },
  { _id: 'd2', name: 'QA', head: { userId: 'u2' } },
];

test('filterMembersByRelatedDepts: 0 dept → []', () => {
  assert.deepEqual(filterMembersByRelatedDepts(orgMembers, { deptIds: [], structureDepts }), []);
  assert.deepEqual(filterMembersByRelatedDepts(orgMembers, { structureDepts }), []);
});

test('filterMembersByRelatedDepts: 1 dept → chỉ NV phòng đó', () => {
  const out = filterMembersByRelatedDepts(orgMembers, { deptIds: ['d1'], structureDepts });
  assert.deepEqual(
    out.map((m) => m.userId),
    ['u1']
  );
});

test('filterMembersByRelatedDepts: OU id dropdown khớp membership Department._id', () => {
  const members = [
    { userId: 'u1', departmentId: 'legacy-d1' },
    { userId: 'u9', department: { _id: 'legacy-d1' } },
    { userId: 'u8', departmentId: 'other' },
  ];
  const depts = [{ _id: 'ou-1', ouId: 'ou-1', legacyRef: { id: 'legacy-d1' }, name: 'Backend' }];
  const out = filterMembersByRelatedDepts(members, { deptIds: ['ou-1'], structureDepts: depts });
  assert.deepEqual(out.map((m) => m.userId).sort(), ['u1', 'u9']);
});

test('filterMembersByRelatedDepts: nhiều phòng + fallback departmentId', () => {
  const out = filterMembersByRelatedDepts(orgMembers, {
    deptIds: ['d1', 'd2'],
    structureDepts,
  });
  assert.deepEqual(
    out.map((m) => m.userId).sort(),
    ['u1', 'u2']
  );
  assert.ok(!out.some((m) => m.userId === 'u3'));
});

test('isWorkloadFull: allocatedPct >= 100 hoặc overallocated', () => {
  assert.equal(isWorkloadFull({ allocatedPct: 100 }), true);
  assert.equal(isWorkloadFull({ allocatedPct: 80 }), false);
  assert.equal(isWorkloadFull({ availability: 'overallocated', allocatedPct: 40 }), true);
  assert.equal(isWorkloadFull(null), false);
});

test('buildPlannerLoadByUserId: flag warn đủ việc', () => {
  const map = buildPlannerLoadByUserId([
    { userId: 'u1', allocatedPct: 120, availability: 'overallocated' },
    { userId: 'u2', allocatedPct: 50, availability: 'partial' },
    { userId: 'u3', allocatedPct: 0, availability: 'available' },
  ]);
  assert.equal(map.get('u1').workloadFull, true);
  assert.equal(map.get('u2').workloadPartial, true);
  assert.equal(map.get('u2').workloadFull, false);
  assert.equal(map.get('u3').workloadFull, false);
  assert.equal(isWorkloadPartial({ availability: 'partial', allocatedPct: 50 }), true);
});
