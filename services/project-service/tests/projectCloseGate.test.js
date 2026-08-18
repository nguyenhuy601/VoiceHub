const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  countOpenSprints,
  classifyProjectIncompleteWork,
  evaluateProjectCloseGate,
  throwIfProjectNotCloseable,
  assertPatchDoesNotCloseActiveSprint,
  isLastOpenSprint,
  assertProjectWritable,
  assertProjectNotAlreadyClosed,
  assertMustCompleteBeforeArchive,
  assertPatchDoesNotCloseProject,
} = require('../src/utils/projectCloseGate');

describe('projectCloseGate: open sprints', () => {
  it('counts planned and active only', () => {
    assert.equal(
      countOpenSprints([
        { status: 'planned' },
        { status: 'active' },
        { status: 'closed' },
        { status: 'ACTIVE' },
      ]),
      3
    );
  });

  it('isLastOpenSprint when destination list empty', () => {
    assert.equal(isLastOpenSprint([]), true);
    assert.equal(isLastOpenSprint(null), true);
    assert.equal(isLastOpenSprint([{ sprintId: 's2' }]), false);
  });
});

describe('projectCloseGate: incomplete work buckets', () => {
  const listsById = {
    l1: { statusKey: 'done', title: 'Done' },
    l2: { statusKey: 'todo', title: 'To Do' },
  };

  it('splits backlog vs in-sprint incomplete', () => {
    const res = classifyProjectIncompleteWork({
      tasks: [
        { _id: 't1', status: 'done', listId: 'l1', sprintId: 's1' },
        { _id: 't2', status: 'todo', listId: 'l2', sprintId: null },
        { _id: 't3', status: 'todo', listId: 'l2', sprintId: 's1' },
        { _id: 't4', status: 'todo', listId: 'l2' },
      ],
      listsById,
    });
    assert.equal(res.doneCount, 1);
    assert.equal(res.incompleteCount, 3);
    assert.equal(res.backlogIncompleteCount, 2);
    assert.equal(res.inSprintIncompleteCount, 1);
  });

  it('archived/inactive tasks are caller-filtered — empty tasks pass', () => {
    const res = classifyProjectIncompleteWork({ tasks: [], listsById });
    assert.equal(res.incompleteCount, 0);
    assert.equal(res.backlogIncompleteCount, 0);
  });
});

describe('projectCloseGate: evaluate close', () => {
  it('T6 OPEN_SPRINTS when planned/active remain', () => {
    const ev = evaluateProjectCloseGate({
      openSprintCount: 2,
      incomplete: { incompleteCount: 0 },
    });
    assert.equal(ev.ok, false);
    assert.equal(ev.errorCode, 'OPEN_SPRINTS');
    assert.equal(ev.details.openSprintCount, 2);
  });

  it('T7 INCOMPLETE_WORK when backlog leftover after sprints closed', () => {
    const ev = evaluateProjectCloseGate({
      openSprintCount: 0,
      incomplete: {
        incompleteCount: 2,
        backlogIncompleteCount: 2,
        inSprintIncompleteCount: 0,
      },
    });
    assert.equal(ev.ok, false);
    assert.equal(ev.errorCode, 'INCOMPLETE_WORK');
    assert.equal(ev.details.backlogIncompleteCount, 2);
    assert.equal(ev.details.incompleteCount, 2);
  });

  it('T8 pass when no open sprints and no incomplete work', () => {
    const ev = evaluateProjectCloseGate({
      openSprintCount: 0,
      incomplete: { incompleteCount: 0, backlogIncompleteCount: 0, inSprintIncompleteCount: 0 },
    });
    assert.equal(ev.ok, true);
    assert.doesNotThrow(() => throwIfProjectNotCloseable(ev));
  });

  it('throwIfProjectNotCloseable sets 409 + errorCode', () => {
    assert.throws(
      () =>
        throwIfProjectNotCloseable(
          evaluateProjectCloseGate({ openSprintCount: 1, incomplete: { incompleteCount: 0 } })
        ),
      (err) => err.statusCode === 409 && err.errorCode === 'OPEN_SPRINTS'
    );
  });
});

describe('projectCloseGate: PATCH close bypass', () => {
  it('T5 throws USE_COMPLETE_SPRINT when active → closed', () => {
    assert.throws(
      () => assertPatchDoesNotCloseActiveSprint('active', 'closed'),
      (err) => err.statusCode === 409 && err.errorCode === 'USE_COMPLETE_SPRINT'
    );
  });

  it('allows PATCH closed when already closed, or other status changes', () => {
    assert.doesNotThrow(() => assertPatchDoesNotCloseActiveSprint('closed', 'closed'));
    assert.doesNotThrow(() => assertPatchDoesNotCloseActiveSprint('planned', 'active'));
    assert.doesNotThrow(() => assertPatchDoesNotCloseActiveSprint('planned', 'closed'));
    assert.doesNotThrow(() => assertPatchDoesNotCloseActiveSprint('active', 'active'));
  });
});

describe('projectCloseGate: project complete vs archive', () => {
  it('assertProjectWritable throws PROJECT_CLOSED', () => {
    assert.throws(
      () => assertProjectWritable({ status: 'closed' }),
      (err) => err.statusCode === 409 && err.errorCode === 'PROJECT_CLOSED'
    );
    assert.doesNotThrow(() => assertProjectWritable({ status: 'in_development' }));
  });

  it('assertProjectNotAlreadyClosed throws ALREADY_CLOSED', () => {
    assert.throws(
      () => assertProjectNotAlreadyClosed({ status: 'closed' }),
      (err) => err.errorCode === 'ALREADY_CLOSED'
    );
  });

  it('assertMustCompleteBeforeArchive throws MUST_COMPLETE_FIRST', () => {
    assert.throws(
      () => assertMustCompleteBeforeArchive({ status: 'in_development' }),
      (err) => err.errorCode === 'MUST_COMPLETE_FIRST'
    );
    assert.doesNotThrow(() => assertMustCompleteBeforeArchive({ status: 'closed' }));
  });

  it('assertPatchDoesNotCloseProject throws USE_COMPLETE_PROJECT', () => {
    assert.throws(
      () => assertPatchDoesNotCloseProject('in_development', 'closed'),
      (err) => err.errorCode === 'USE_COMPLETE_PROJECT'
    );
    assert.doesNotThrow(() => assertPatchDoesNotCloseProject('closed', 'closed'));
  });
});
