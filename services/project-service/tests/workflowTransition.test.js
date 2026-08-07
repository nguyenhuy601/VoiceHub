const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertTransitionAllowed,
  evaluateTransition,
  runValidators,
  inferStatusKeyFromTitle,
  validateTransitionRoleKeys,
  planListMigration,
  statesToBoardShape,
  transitionsToBoardShape,
} = require('../src/utils/workflowTransition');
const {
  STARTUP_TEMPLATE,
  SME_TEMPLATE,
  MID_TEMPLATE,
  ENTERPRISE_TEMPLATE,
  suggestedTemplateKeyForCompanySize,
  BUILTIN_TEMPLATES,
} = require('../src/utils/workflowTemplates.defaults');

function asWorkflow(template) {
  return {
    states: statesToBoardShape(template.statuses),
    transitions: transitionsToBoardShape(template.transitions),
  };
}

describe('workflowTransition (Phase 4)', () => {
  const startup = asWorkflow(STARTUP_TEMPLATE);
  const enterprise = asWorkflow(ENTERPRISE_TEMPLATE);
  const sme = asWorkflow(SME_TEMPLATE);
  const mid = asWorkflow(MID_TEMPLATE);

  it('T1: illegal transition → not ok', () => {
    const r = assertTransitionAllowed(startup, 'todo', 'done');
    assert.equal(r.ok, false);
    assert.match(r.message, /transition/i);
  });

  it('T1b: startup linear edges ok', () => {
    assert.equal(assertTransitionAllowed(startup, 'todo', 'doing').ok, true);
    assert.equal(assertTransitionAllowed(startup, 'doing', 'done').ok, true);
  });

  it('T2: missing default task:change_status → 403', () => {
    const r = evaluateTransition({
      workflow: startup,
      fromStatus: 'todo',
      toStatus: 'doing',
      card: { title: 'X' },
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

  it('T2c: task:update satisfies default change_status', () => {
    const r = evaluateTransition({
      workflow: startup,
      fromStatus: 'todo',
      toStatus: 'doing',
      card: { title: 'X' },
      actorPermissions: ['task:update'],
      isElevated: false,
    });
    assert.equal(r.ok, true);
  });

  it('T3: condition roleKeys unknown_custom rejected at save', () => {
    const r = validateTransitionRoleKeys([
      {
        fromKey: 'todo',
        toKey: 'doing',
        conditions: [{ type: 'project_role', roleKeys: ['unknown_custom'] }],
      },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 400);
    assert.ok(r.invalidKeys.includes('unknown_custom'));
  });

  it('T3b: master project_manager roleKey accepted', () => {
    const r = validateTransitionRoleKeys([
      {
        fromKey: 'todo',
        toKey: 'doing',
        conditions: ['role_in_project:project_manager'],
      },
    ]);
    assert.equal(r.ok, true);
  });

  it('T4: validator assignee_present fails clearly', () => {
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

  it('T4b: assignee present passes', () => {
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

  it('T5: board columns = template statuses', () => {
    assert.equal(enterprise.states.length, 8);
    assert.deepEqual(
      enterprise.states.map((s) => s.key),
      ENTERPRISE_TEMPLATE.statuses.map((s) => s.key)
    );
    const plan = planListMigration([], enterprise.states);
    assert.deepEqual(plan.columns, ENTERPRISE_TEMPLATE.statuses.map((s) => s.key));
    assert.equal(plan.createdKeys.length, 8);
  });

  it('T5b: sme/mid/startup/enterprise seeds exist', () => {
    assert.ok(BUILTIN_TEMPLATES.some((t) => t.key === 'sme'));
    assert.ok(BUILTIN_TEMPLATES.some((t) => t.key === 'mid'));
    assert.equal(suggestedTemplateKeyForCompanySize('sme'), 'sme');
    assert.equal(suggestedTemplateKeyForCompanySize('mid'), 'mid');
    assert.equal(suggestedTemplateKeyForCompanySize('enterprise'), 'enterprise');
    assert.equal(sme.states.length, 4);
    assert.equal(mid.states.length, 5);
  });

  it('T6: migrate board cũ — unmatched lists preserved (no card loss)', () => {
    const existing = [
      { _id: 'l1', title: 'Todo', statusKey: 'todo' },
      { _id: 'l2', title: 'Custom backlog' },
      { _id: 'l3', title: 'Doing' },
    ];
    const plan = planListMigration(existing, startup.states);
    assert.ok(plan.mapped.some((m) => m.statusKey === 'todo' && m.listId === 'l1'));
    assert.ok(plan.preservedUnmatchedIds.includes('l2'));
    assert.equal(plan.preservedUnmatchedIds.includes('l1'), false);
  });
});
