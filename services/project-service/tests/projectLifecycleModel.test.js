const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PROJECT_STATUSES,
  PHASE_STATUSES,
  ANALYSIS_MODES,
  LEGACY_STATUS_MAP,
  DEFAULT_PROJECT_STATUS_NEW,
  DEFAULT_PHASE_STATUS_NEW,
  DEFAULT_ANALYSIS_MODE,
} = require('../src/constants/projectLifecycle');
const {
  buildProjectInitFields,
  coerceProjectLifecycleStatus,
  coercePhaseStatus,
  coerceAnalysisMode,
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
  it('defaults new projects to draft / not_started / manual', () => {
    const init = buildProjectInitFields({});
    assert.equal(init.ok, true);
    assert.equal(init.fields.status, DEFAULT_PROJECT_STATUS_NEW);
    assert.equal(init.fields.phaseStatus, DEFAULT_PHASE_STATUS_NEW);
    assert.equal(init.fields.analysisMode, DEFAULT_ANALYSIS_MODE);
  });

  it('accepts analysisMode ai on create', () => {
    const init = buildProjectInitFields({ analysisMode: 'ai' });
    assert.equal(init.ok, true);
    assert.equal(init.fields.analysisMode, 'ai');
  });

  it('rejects invalid analysisMode', () => {
    const init = buildProjectInitFields({ analysisMode: 'hybrid' });
    assert.equal(init.ok, false);
  });

  it('rejects invalid phaseStatus', () => {
    const init = buildProjectInitFields({ phaseStatus: 'nope' }, { partial: true });
    assert.equal(init.ok, false);
  });

  it('partial patch can set phaseStatus and analysisMode', () => {
    const init = buildProjectInitFields(
      { phaseStatus: 'in_progress', analysisMode: 'ai' },
      { partial: true }
    );
    assert.equal(init.ok, true);
    assert.equal(init.fields.phaseStatus, 'in_progress');
    assert.equal(init.fields.analysisMode, 'ai');
  });

  it('coerces legacy status on create body', () => {
    const init = buildProjectInitFields({ status: 'ready_for_planning' });
    assert.equal(init.ok, true);
    assert.equal(init.fields.status, 'draft');
  });
});

describe('coerce helpers', () => {
  it('maps all LEGACY_STATUS_MAP keys', () => {
    for (const [from, to] of Object.entries(LEGACY_STATUS_MAP)) {
      assert.equal(coerceProjectLifecycleStatus(from), to, from);
    }
  });

  it('coercePhaseStatus rejects unknown', () => {
    assert.equal(coercePhaseStatus('review'), 'review');
    assert.equal(coercePhaseStatus(''), null);
    assert.equal(coercePhaseStatus('xyz'), null);
  });

  it('coerceAnalysisMode defaults empty to manual', () => {
    assert.equal(coerceAnalysisMode(''), 'manual');
    assert.equal(coerceAnalysisMode('AI'), 'ai');
    assert.equal(coerceAnalysisMode('nope'), null);
  });
});
