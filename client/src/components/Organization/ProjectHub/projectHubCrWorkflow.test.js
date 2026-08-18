import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCrStatusTransition,
  listAllowedCrStatusTransitions,
  pickLowestLinkedWorkStatus,
  rankWorkStatusKey,
  labelCrWorkStatus,
} from './projectHubCrWorkflow.js';

test('T4 allowed CR transitions mirror BE', () => {
  assert.equal(assertCrStatusTransition('draft', 'pending').ok, true);
  assert.equal(assertCrStatusTransition('pending', 'reviewing').to, 'reviewing');
  assert.equal(assertCrStatusTransition('reviewing', 'approved').changed, true);
  assert.equal(assertCrStatusTransition('reviewing', 'rejected').ok, true);
  assert.equal(assertCrStatusTransition('reviewing', 'deferred').ok, true);
  assert.deepEqual(listAllowedCrStatusTransitions('draft'), ['pending']);
  assert.deepEqual(listAllowedCrStatusTransitions('reviewing'), [
    'approved',
    'rejected',
    'deferred',
  ]);
  assert.deepEqual(listAllowedCrStatusTransitions('approved'), []);
});

test('T4 forbidden + same-status no-op', () => {
  assert.equal(assertCrStatusTransition('rejected', 'approved').ok, false);
  assert.equal(assertCrStatusTransition('draft', 'approved').ok, false);
  assert.equal(assertCrStatusTransition('approved', 'deferred').ok, false);
  const same = assertCrStatusTransition('draft', 'DRAFT');
  assert.equal(same.ok, true);
  assert.equal(same.changed, false);
});

test('T3 workStatus lowest rank mirrors BE', () => {
  assert.equal(rankWorkStatusKey('todo'), 0);
  assert.equal(rankWorkStatusKey('done'), 4);
  assert.equal(
    pickLowestLinkedWorkStatus([{ status: 'done' }, { status: 'todo' }]),
    'todo'
  );
  assert.equal(pickLowestLinkedWorkStatus([{ status: 'in_progress' }]), 'in_progress');
  assert.equal(pickLowestLinkedWorkStatus([]), '');
  assert.equal(
    labelCrWorkStatus('todo', [{ statusKey: 'todo', title: 'To Do' }]),
    'To Do'
  );
  assert.equal(labelCrWorkStatus('todo', []), 'todo');
  assert.equal(labelCrWorkStatus('', [{ statusKey: 'todo', title: 'To Do' }]), '');
});
