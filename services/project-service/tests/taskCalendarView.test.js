const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CALENDAR_TASK_SELECT,
  CALENDAR_CLIENT_FIELDS,
  buildCalendarAssigneeClause,
  buildCalendarOverlapClause,
  buildCalendarTaskFilter,
  pickCalendarTaskFields,
  toDateKeyUTC,
} = require('../src/utils/task/taskCalendarQuery');
const {
  taskCalendarFeedCacheKey,
  DEFAULT_TASK_CALENDAR_CACHE_TTL_SEC,
} = require('@enterprise/shared/cache/taskCalendarCacheKeys');

describe('taskCalendarQuery', () => {
  it('assignee clause includes primary and assignments.userId', () => {
    const clause = buildCalendarAssigneeClause('u1');
    assert.deepEqual(clause, {
      $or: [{ assigneeId: 'u1' }, { 'assignments.userId': 'u1' }],
    });
  });

  it('assignee clause does not include createdBy', () => {
    const json = JSON.stringify(buildCalendarAssigneeClause('u1'));
    assert.equal(json.includes('createdBy'), false);
  });

  it('overlap clause covers both-dates, due-only, start-only', () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    const clause = buildCalendarOverlapClause(from, to);
    assert.equal(clause.$or.length, 3);
    assert.equal(clause.$or[0].startDate.$lte, to);
    assert.equal(clause.$or[0].dueDate.$gte, from);
  });

  it('buildCalendarTaskFilter ANDs assignee + overlap + isActive', () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    const filter = buildCalendarTaskFilter({ userId: 'u1', from, to });
    assert.ok(Array.isArray(filter.$and));
    assert.equal(filter.$and[0].isActive, true);
    assert.deepEqual(filter.$and[1], buildCalendarAssigneeClause('u1'));
    assert.ok(filter.$and[2].$or);
    assert.equal(JSON.stringify(filter).includes('boardId'), false);
  });

  it('buildCalendarTaskFilter adds organizationId and visibility', () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');
    const filter = buildCalendarTaskFilter({
      userId: 'u1',
      organizationId: 'org1',
      visibilityFilter: { isActive: true, departmentId: 'd1' },
      from,
      to,
    });
    const orgPart = filter.$and.find((p) => p.organizationId === 'org1');
    assert.ok(orgPart);
    const visPart = filter.$and.find((p) => p.departmentId === 'd1');
    assert.ok(visPart);
    assert.equal(visPart.isActive, undefined);
  });

  it('projection select lists calendar fields only', () => {
    assert.ok(CALENDAR_TASK_SELECT.includes('estimateHours'));
    assert.ok(CALENDAR_TASK_SELECT.includes('startDate'));
    assert.ok(CALENDAR_TASK_SELECT.includes('boardId'));
    assert.equal(CALENDAR_TASK_SELECT.includes('description'), false);
    assert.equal(CALENDAR_TASK_SELECT.includes('comments'), false);
  });

  it('pickCalendarTaskFields strips extras', () => {
    const slim = pickCalendarTaskFields({
      _id: 't1',
      title: 'A',
      description: 'secret',
      comments: [{ content: 'x' }],
      estimateHours: 4,
      startDate: '2026-09-01',
      dueDate: '2026-09-05',
    });
    assert.equal(slim.title, 'A');
    assert.equal(slim.estimateHours, 4);
    assert.equal(slim.description, undefined);
    assert.equal(slim.comments, undefined);
    for (const key of Object.keys(slim)) {
      assert.ok(CALENDAR_CLIENT_FIELDS.includes(key), key);
    }
  });

  it('toDateKeyUTC formats UTC day', () => {
    assert.equal(toDateKeyUTC('2026-09-07T12:00:00.000Z'), '2026-09-07');
  });
});

describe('taskCalendarCacheKeys', () => {
  it('builds stable key and default TTL 90s', () => {
    assert.equal(DEFAULT_TASK_CALENDAR_CACHE_TTL_SEC, 90);
    assert.equal(
      taskCalendarFeedCacheKey({
        userId: 'u1',
        fromDay: '2026-09-01',
        toDay: '2026-09-30',
        orgScope: 'me',
      }),
      'task:calendar:v1:u1:2026-09-01:2026-09-30:me'
    );
  });
});
