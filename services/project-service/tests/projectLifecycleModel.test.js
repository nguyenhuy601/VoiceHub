const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PROJECT_STATUSES,
  PHASE_STATUSES,
  ANALYSIS_MODES,
} = require('../src/constants/projectLifecycle');
const {
  buildProjectInitFields,
  coerceProjectLifecycleStatus,
} = require('../src/utils/project/projectInitFields');

describe('projectLifecycle constants', () => {
  it('exposes 4 status values', () => {
    assert.deepEqual([...PROJECT_STATUSES], ['draft', 'active', 'on_hold', 'closed']);
  });

  it('exposes 6 phaseStatus values', () => {
    assert.equal(PHASE_STATUSES.length, 6);
    assert.ok(PHASE_STATUSES.includes('not_started'));
    assert.ok(PHASE_STATUSES.includes('completed'));
  });

  it('exposes analysis modes', () => {
    assert.deepEqual([...ANALYSIS_MODES], ['manual', 'ai']);
  });
});

describe('buildProjectInitFields lifecycle defaults', () => {
  it('defaults omitted status to draft', () => {
    const init = buildProjectInitFields({});
    assert.equal(init.ok, true);
    assert.equal(init.fields.status, 'draft');
  });

  it('coerces ready_for_planning to ready and planning to draft', () => {
    const draft = buildProjectInitFields({ status: 'draft' });
    assert.equal(draft.ok, true);
    assert.equal(draft.fields.status, 'draft');
    const ready = buildProjectInitFields({ status: 'ready_for_planning' });
    assert.equal(ready.ok, true);
    assert.equal(ready.fields.status, 'ready');
    const planning = buildProjectInitFields({ status: 'planning' });
    assert.equal(planning.ok, true);
    assert.equal(planning.fields.status, 'draft');
  });

  it('rejects unknown status', () => {
    const init = buildProjectInitFields({ status: 'nope' });
    assert.equal(init.ok, false);
  });
});

describe('coerce helpers', () => {
  it('maps ready_for_planning to ready and planning/new/created to draft', () => {
    assert.equal(coerceProjectLifecycleStatus('draft'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('ready_for_planning'), 'ready');
    assert.equal(coerceProjectLifecycleStatus('planning'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('new'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('created'), 'draft');
    assert.equal(coerceProjectLifecycleStatus('cancelled'), 'closed');
  });
});
