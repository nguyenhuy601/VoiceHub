import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoursToManday,
  mandayToHours,
  assessEffortReadiness,
  sumWbsLeafEffortHours,
  sumResourceRolesEffortHours,
  effortDelta,
  suggestEndDateFromEffort,
  suggestEndDateBlockReason,
  normalizeStaffingStep,
  isWbsLeaf,
  assigneeLabel,
  collectResourceRoles,
  inferLeafRoleKey,
  staffingPersonLabel,
  readAssigneeCapacity,
  planBulkStaffingAssignments,
  buildStaffingSuggestionCaption,
} from './staffingPipelineModel.js';

describe('staffingPipelineModel', () => {
  it('assigneeLabel prefers stored name, then member map, never a raw id', () => {
    assert.equal(assigneeLabel({ assigneeName: 'An Nguyễn', assigneeUserId: 'abc' }, {}), 'An Nguyễn');
    assert.equal(assigneeLabel({ assigneeUserId: 'abc' }, { abc: 'An Nguyễn' }), 'An Nguyễn');
    assert.equal(assigneeLabel({ assigneeUserId: 'abc' }, {}), '');
  });

  it('infers leaf role from Assignee Name when it matches a resource role', () => {
    const roles = collectResourceRoles([
      { structured: { roles: [{ roleKey: 'developer', title: 'Developer' }] } },
    ]);
    const hit = inferLeafRoleKey({ assigneeName: 'developer', skillKeys: ['fullstack'] }, roles);
    assert.equal(hit.roleKey, 'developer');
    assert.equal(hit.fromAssigneeName, true);
    assert.equal(inferLeafRoleKey({ roleKey: 'ba', assigneeName: 'developer' }, roles).roleKey, 'ba');
    const linked = inferLeafRoleKey(
      { assigneeUserId: 'u1', assigneeName: 'developer' },
      roles
    );
    assert.equal(linked.roleKey, 'developer');
    assert.equal(linked.fromAssigneeName, true);
  });

  it('shows the member name when assigneeName is only a role word', () => {
    const roles = [{ roleKey: 'developer', title: 'Developer' }];
    const st = { assigneeUserId: 'u1', assigneeName: 'developer' };
    assert.equal(staffingPersonLabel(st, { u1: 'Nguyễn An' }, roles), 'Nguyễn An');
    assert.equal(staffingPersonLabel(st, {}, roles), '');
  });

  it('reads free capacity from the employee profile shape', () => {
    const view = readAssigneeCapacity({
      capacity: {
        availablePct: 60,
        projectAllocations: [{ title: 'QLTCP', leaveDate: '2026-12-01', allocationPct: 40 }],
      },
    });
    assert.equal(view.availablePct, 60);
    assert.equal(view.leaveDate, '2026-12-01');
    assert.equal(view.allocations.length, 1);
  });

  it('converts hours ↔ manday at 8h/day', () => {
    assert.equal(hoursToManday(16), 2);
    assert.equal(hoursToManday(10), 1.25);
    assert.equal(mandayToHours(2), 16);
    assert.equal(hoursToManday(null), null);
  });

  it('assessEffortReadiness 2a/2b/2c', () => {
    const r = assessEffortReadiness({
      title: 'Build login',
      structured: { effortHours: 8, skillKeys: ['react'], roleKey: 'dev' },
    });
    assert.equal(r.hasDescription, true);
    assert.equal(r.hasRoleOrSkill, true);
    assert.equal(r.hasEffort, true);
    assert.equal(r.manday, 1);
    assert.equal(r.readyForMatch, true);
  });

  it('readyForMatch requires title + effort', () => {
    const r = assessEffortReadiness({
      title: '',
      structured: { effortHours: 8 },
    });
    assert.equal(r.readyForMatch, false);
  });

  it('sums leaf effort and resource roles; warns on delta', () => {
    const wbs = [
      { externalKey: 'W1', parentExternalKey: '', structured: { effortHours: 16 } },
      { externalKey: 'W1.1', parentExternalKey: 'W1', structured: { effortHours: 8 } },
      { externalKey: 'W1.2', parentExternalKey: 'W1', structured: { effortHours: 8 } },
    ];
    assert.equal(isWbsLeaf(wbs[0], wbs), false);
    assert.equal(isWbsLeaf(wbs[1], wbs), true);
    const { sum } = sumWbsLeafEffortHours(wbs);
    assert.equal(sum, 16);
    const resSum = sumResourceRolesEffortHours([
      { structured: { roles: [{ effortHours: 10, count: 2 }] } },
    ]);
    assert.equal(resSum, 20);
    const d = effortDelta(wbs, [{ structured: { roles: [{ effortHours: 40, count: 1 }] } }]);
    assert.equal(d.warn, true);
  });

  it('suggestEndDateFromEffort skips weekends', () => {
    // Friday 2026-09-25 + 1 manday → Monday 2026-09-28
    assert.equal(suggestEndDateFromEffort('2026-09-25', 8), '2026-09-28');
    assert.equal(suggestEndDateBlockReason('', 8), 'missing_start');
    assert.equal(suggestEndDateBlockReason('2026-09-25', 0), 'missing_effort');
    assert.equal(suggestEndDateBlockReason('2026-09-25', ''), 'missing_effort');
    assert.equal(suggestEndDateBlockReason('2026-09-25', 8), null);
  });

  it('T2b spreads equal-hour leaves by rank and keeps an assigned leaf', () => {
    const candidates = {
      developer: [
        { userId: 'p1', displayName: 'An', score: 20, availableHours: 40, suggestReasons: ['position_preferred'] },
        { userId: 'p2', displayName: 'Bình', score: 10, availableHours: 40, suggestReasons: ['cv_verified'] },
      ],
    };
    const leaves = [
      { id: 'a', externalKey: 'W2', roleKey: 'developer', effortHours: 40, assigneeUserId: '' },
      { id: 'b', externalKey: 'W1', roleKey: 'developer', effortHours: 40, assigneeUserId: '' },
      { id: 'c', externalKey: 'W0', roleKey: 'developer', effortHours: 16, assigneeUserId: 'kept' },
    ];
    const plan = planBulkStaffingAssignments(leaves, candidates);
    assert.deepEqual(
      plan.assignments.map((row) => [row.id, row.userId]),
      [
        ['b', 'p1'],
        ['a', 'p2'],
      ]
    );
    assert.equal(plan.skipped.find((row) => row.id === 'c').reason, 'already_assigned');
    assert.equal(plan.assignments.some((row) => row.userId === 'kept'), false);

    const both = planBulkStaffingAssignments(leaves, {
      developer: [
        { ...candidates.developer[0], availableHours: 80 },
        candidates.developer[1],
      ],
    });
    assert.deepEqual(
      both.assignments.map((row) => row.userId),
      ['p1', 'p1']
    );
    assert.equal(both.assignments[1].remainingHoursAfter, 0);
  });

  it('T2d skips a task when nobody has enough hours', () => {
    const plan = planBulkStaffingAssignments(
      [{ id: 't', externalKey: 'T', roleKey: 'developer', effortHours: 40 }],
      {
        developer: [
          { userId: 'p1', displayName: 'An', score: 20, availableHours: 30 },
          { userId: 'p2', displayName: 'Bình', score: 10, availableHours: 30 },
        ],
      }
    );
    assert.equal(plan.assignments.length, 0);
    assert.equal(plan.skipped[0].reason, 'insufficient_hours');
  });

  it('shares remaining hours across roles and reserves hours already assigned', () => {
    const shared = planBulkStaffingAssignments(
      [
        { id: 'd', externalKey: 'D', roleKey: 'developer', effortHours: 30 },
        { id: 't', externalKey: 'T', roleKey: 'tester', effortHours: 30 },
      ],
      {
        developer: [{ userId: 'p1', displayName: 'An', score: 20, availableHours: 40 }],
        tester: [{ userId: 'p1', displayName: 'An', score: 20, availableHours: 40 }],
      }
    );
    assert.deepEqual(
      shared.assignments.map((row) => row.id),
      ['d']
    );
    assert.equal(shared.skipped.find((row) => row.id === 't').reason, 'insufficient_hours');

    const reserved = planBulkStaffingAssignments(
      [
        { id: 'old', externalKey: 'A', roleKey: 'developer', effortHours: 20, assigneeUserId: 'p1' },
        { id: 'next', externalKey: 'B', roleKey: 'developer', effortHours: 30 },
      ],
      { developer: [{ userId: 'p1', displayName: 'An', score: 10, availableHours: 40 }] }
    );
    assert.equal(reserved.assignments.length, 0);
    assert.equal(reserved.skipped.find((row) => row.id === 'next').reason, 'insufficient_hours');
  });

  it('builds a caption from reason codes and remaining hours', () => {
    const caption = buildStaffingSuggestionCaption(
      ['position_preferred', 'prior_role', 'secret'],
      12,
      (key, vars) => (vars ? `${key}:${vars.hours}` : key)
    );
    assert.equal(
      caption,
      'workspace.phase1StaffingReasonPosition · workspace.phase1StaffingReasonPriorRole · workspace.phase1StaffingRemainingHours:12'
    );
    assert.equal(caption.includes('secret'), false);
  });

  it('normalizeStaffingStep', () => {
    assert.equal(normalizeStaffingStep('match'), 'match');
    assert.equal(normalizeStaffingStep('nope'), 'wbs');
  });
});
