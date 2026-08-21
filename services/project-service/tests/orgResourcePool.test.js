const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  stripVerifiedCapability,
  stripVerifiedCapabilityForPool,
} = require('../src/utils/verifiedCapabilityStrip');
const {
  buildPlacementByUser,
  uniqueMemberships,
  clampPoolLimit,
  filterPoolItems,
  sortPoolItems,
  sortPoolItemsByRange,
  computePoolTotals,
  computePoolRangeTotals,
  emptyPlacement,
} = require('../src/utils/orgResourcePoolMerge');

describe('verifiedCapabilityStrip', () => {
  it('returns null for unverified capability', () => {
    assert.equal(
      stripVerifiedCapability({ verificationStatus: 'draft', skills: [{ name: 'React' }] }),
      null
    );
    assert.equal(stripVerifiedCapabilityForPool({ verificationStatus: 'pending_hr' }), null);
  });

  it('keeps verified skills and verifiedAt for pool snippet', () => {
    const snip = stripVerifiedCapabilityForPool({
      verificationStatus: 'verified',
      primaryDomain: 'fe',
      seniorityBand: 'senior',
      yearsExperience: 5,
      skills: [{ name: 'React', level: 4 }],
      businessDomains: ['fintech'],
      availability: 'available',
      verifiedAt: '2026-01-01',
      summary: 'hidden in pool',
    });
    assert.equal(snip.primaryDomain, 'fe');
    assert.equal(snip.skills[0].name, 'React');
    assert.equal(snip.verifiedAt, '2026-01-01');
    assert.equal(snip.summary, undefined);
  });
});

describe('orgResourcePoolMerge', () => {
  it('T1: membership user not in roster still gets empty placement via merge helpers', () => {
    const memberships = uniqueMemberships([
      { userId: 'u1', role: 'member' },
      { userId: 'u2', role: 'admin' },
      { userId: 'u1', role: 'member' },
    ]);
    assert.equal(memberships.length, 2);

    const placement = buildPlacementByUser([
      { departmentId: 'd1', name: 'Engineering', memberIds: ['u2'] },
    ]);
    assert.equal(placement.get('u2').departmentName, 'Engineering');
    assert.deepEqual(placement.get('u1'), undefined);

    const items = memberships.map((m) => ({
      userId: m.userId,
      displayName: m.userId,
      capability: null,
      placement: placement.get(m.userId) || emptyPlacement(),
      availability: 'available',
    }));
    const orphan = items.find((i) => i.userId === 'u1');
    assert.ok(orphan);
    assert.equal(orphan.placement.departmentId, '');
  });

  it('T1b: teams[] fills teamId/teamName; dept-only member keeps empty team', () => {
    const placement = buildPlacementByUser([
      {
        departmentId: 'd1',
        name: 'Engineering',
        memberIds: ['u-dept', 'u-team'],
        teams: [
          { teamId: 't1', name: 'Platform', memberIds: ['u-team'] },
        ],
      },
    ]);
    assert.equal(placement.get('u-dept').departmentId, 'd1');
    assert.equal(placement.get('u-dept').teamId, '');
    assert.equal(placement.get('u-dept').teamName, '');
    assert.equal(placement.get('u-team').departmentId, 'd1');
    assert.equal(placement.get('u-team').teamId, 't1');
    assert.equal(placement.get('u-team').teamName, 'Platform');
  });

  it('T1c: first-wins when user is in two teams', () => {
    const placement = buildPlacementByUser([
      {
        departmentId: 'd1',
        name: 'Engineering',
        memberIds: ['u1'],
        teams: [
          { teamId: 't-first', name: 'Alpha', memberIds: ['u1'] },
          { teamId: 't-second', name: 'Beta', memberIds: ['u1'] },
        ],
      },
    ]);
    assert.equal(placement.get('u1').teamId, 't-first');
    assert.equal(placement.get('u1').teamName, 'Alpha');
  });

  it('T1d: team-only member inherits department from parent roster row', () => {
    const placement = buildPlacementByUser([
      {
        departmentId: 'd2',
        name: 'Product',
        memberIds: [],
        teams: [{ teamId: 't9', name: 'Design', memberIds: ['u-design'] }],
      },
    ]);
    assert.equal(placement.get('u-design').departmentId, 'd2');
    assert.equal(placement.get('u-design').departmentName, 'Product');
    assert.equal(placement.get('u-design').teamId, 't9');
    assert.equal(placement.get('u-design').teamName, 'Design');
  });

  it('T2/T3: verifiedOnly drops unverified', () => {
    const items = [
      { userId: 'a', capability: { primaryDomain: 'be' }, placement: { departmentId: 'd1' }, availability: 'available', displayName: 'A' },
      { userId: 'b', capability: null, placement: { departmentId: 'd1' }, availability: 'partial', displayName: 'B' },
    ];
    const filtered = filterPoolItems(items, { verifiedOnly: true });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].userId, 'a');
  });

  it('T4: departmentId filter', () => {
    const items = [
      { userId: 'a', capability: null, placement: { departmentId: 'd1' }, availability: 'available', displayName: 'A' },
      { userId: 'b', capability: null, placement: { departmentId: 'd2' }, availability: 'available', displayName: 'B' },
    ];
    const filtered = filterPoolItems(items, { departmentId: 'd2' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].userId, 'b');
  });

  it('T5: totals and sort', () => {
    const items = sortPoolItems([
      { userId: 'c', capability: null, availability: 'overallocated', displayName: 'C', placement: {} },
      { userId: 'a', capability: { x: 1 }, availability: 'available', displayName: 'A', placement: {} },
      { userId: 'b', capability: null, availability: 'partial', displayName: 'B', placement: {} },
    ]);
    assert.deepEqual(
      items.map((i) => i.userId),
      ['a', 'b', 'c']
    );
    const totals = computePoolTotals(items);
    assert.equal(totals.headcount, 3);
    assert.equal(totals.withVerifiedCapability, 1);
    assert.equal(totals.availablePeople, 1);
    assert.equal(totals.overallocatedPeople, 1);
  });

  it('clamps limit', () => {
    assert.equal(clampPoolLimit(undefined), 500);
    assert.equal(clampPoolLimit(50), 50);
    assert.equal(clampPoolLimit(5000), 1000);
  });

  it('T6: range totals + sort by capacityRange', () => {
    const items = sortPoolItemsByRange([
      {
        userId: 'c',
        displayName: 'C',
        capacityRange: { availability: 'overallocated', availableHours: 0, grossHours: 40, allocatedHours: 48 },
      },
      {
        userId: 'a',
        displayName: 'A',
        capacityRange: { availability: 'available', availableHours: 40, grossHours: 40, allocatedHours: 0 },
      },
      {
        userId: 'b',
        displayName: 'B',
        capacityRange: { availability: 'available', availableHours: 20, grossHours: 40, allocatedHours: 20 },
      },
    ]);
    assert.deepEqual(
      items.map((i) => i.userId),
      ['a', 'b', 'c']
    );
    const rangeTotals = computePoolRangeTotals(items);
    assert.equal(rangeTotals.headcount, 3);
    assert.equal(rangeTotals.grossHours, 120);
    assert.equal(rangeTotals.availableHours, 60);
    assert.equal(rangeTotals.allocatedHours, 68);
  });
});
