const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertTransitionAllowed,
  evaluateTransition,
  runValidators,
  inferStatusKeyFromTitle,
} = require('../src/utils/workflowTransition');
const {
  STARTUP_TEMPLATE,
  ENTERPRISE_TEMPLATE,
  statesToBoardShape,
  transitionsToBoardShape,
} = (() => {
  const defaults = require('../src/utils/workflowTemplates.defaults');
  const wt = require('../src/utils/workflowTransition');
  return {
    STARTUP_TEMPLATE: defaults.STARTUP_TEMPLATE,
    ENTERPRISE_TEMPLATE: defaults.ENTERPRISE_TEMPLATE,
    statesToBoardShape: wt.statesToBoardShape,
    transitionsToBoardShape: wt.transitionsToBoardShape,
  };
})();

function asWorkflow(template) {
  return {
    states: statesToBoardShape(template.statuses),
    transitions: transitionsToBoardShape(template.transitions),
  };
}

describe('workflowTransition (Phase 4)', () => {
  const startup = asWorkflow(STARTUP_TEMPLATE);
  const enterprise = asWorkflow(ENTERPRISE_TEMPLATE);

  it('T1: illegal transition → not ok', () => {
    const r = assertTransitionAllowed(startup, 'todo', 'done');
    assert.equal(r.ok, false);
    assert.match(r.message, /transition/i);
  });

  it('T1b: startup linear edges ok', () => {
    assert.equal(assertTransitionAllowed(startup, 'todo', 'doing').ok, true);
    assert.equal(assertTransitionAllowed(startup, 'doing', 'done').ok, true);
  });

  it('T2: missing requiredPermission → 403', () => {
    const r = evaluateTransition({
      workflow: enterprise,
      fromStatus: 'code_review',
      toStatus: 'qa',
      card: { title: 'X', assigneeId: 'u1' },
      actorPermissions: ['task:view'],
      isElevated: false,
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 403);
  });

  it('T2b: has task:change_status → ok', () => {
    const r = evaluateTransition({
      workflow: enterprise,
      fromStatus: 'code_review',
      toStatus: 'qa',
      card: { title: 'X', assigneeId: 'u1' },
      actorPermissions: ['task:change_status'],
      isElevated: false,
    });
    assert.equal(r.ok, true);
  });

  it('T3: validator assignee_present fails clearly', () => {
    const r = evaluateTransition({
      workflow: startup,
      fromStatus: 'doing',
      toStatus: 'done',
      card: { title: 'No assignee' },
      actorPermissions: ['task:update'],
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 400);
    assert.match(r.message, /assignee/i);
  });

  it('T3b: assignee present passes', () => {
    const r = evaluateTransition({
      workflow: startup,
      fromStatus: 'doing',
      toStatus: 'done',
      card: { title: 'Ok', assigneeId: 'u1' },
      actorPermissions: ['task:update'],
    });
    assert.equal(r.ok, true);
  });

  it('runValidators required_fields', () => {
    assert.equal(runValidators(['required_title'], { title: '' }).ok, false);
    assert.equal(runValidators(['required_title'], { title: 'A' }).ok, true);
  });

  it('inferStatusKeyFromTitle maps common labels', () => {
    assert.equal(inferStatusKeyFromTitle('Done'), 'done');
    assert.equal(inferStatusKeyFromTitle('To Do'), 'todo');
    assert.equal(inferStatusKeyFromTitle('In Progress'), 'doing');
  });

  it('enterprise columns count (T4 shape)', () => {
    assert.equal(enterprise.states.length, 8);
    assert.ok(enterprise.states.every((s) => s.key && s.label));
  });
});
