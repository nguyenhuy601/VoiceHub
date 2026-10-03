const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatErrors,
  submitErrors,
} = require('../src/utils/project/artifactColumnRules');

describe('artifactColumnRules', () => {
  it('accepts FR level from the list or a typed value', () => {
    assert.deepEqual(formatErrors('FR', { level: 'Module' }), []);
    assert.deepEqual(formatErrors('FR', { level: 'Requirement' }), []);
    assert.deepEqual(formatErrors('FR', { level: '' }), []);
    assert.deepEqual(formatErrors('FR', { level: 'Epic' }), []);
  });

  it('does not enum-check priority', () => {
    assert.deepEqual(formatErrors('FR', { priority: 'Must' }), []);
    assert.deepEqual(formatErrors('UC', { priority: 'Should' }), []);
    assert.deepEqual(formatErrors('BG', { priority: 'High' }), []);
    assert.deepEqual(formatErrors('NFR', { priority: '' }), []);
    assert.deepEqual(submitErrors('FR', { level: 'Requirement', priority: 'Must' }), []);
  });

  it('requires FR level and priority on submit, not acceptance criteria for Module', () => {
    const missing = submitErrors('FR', { level: 'Module' });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].field, 'priority');
    assert.equal(missing[0].code, 'required_on_submit');
    assert.ok(!missing.some((row) => row.field === 'acceptanceCriteria'));
    assert.deepEqual(submitErrors('FR', {}), [
      { field: 'level', code: 'required_on_submit', message: 'Required to submit' },
      { field: 'priority', code: 'required_on_submit', message: 'Required to submit' },
    ]);
  });

  it('requires NFR category and priority only on submit', () => {
    assert.deepEqual(formatErrors('NFR', {}), []);
    const missing = submitErrors('NFR', { priority: 'Must' });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].field, 'category');
    assert.deepEqual(submitErrors('NFR', { category: 'Performance', priority: 'Must' }), []);
  });

  it('accepts scope in, In Scope, and a typed value', () => {
    assert.deepEqual(formatErrors('SCOPE', { scopeType: 'in' }), []);
    assert.deepEqual(formatErrors('SCOPE', { scopeType: 'In Scope' }), []);
    assert.deepEqual(formatErrors('SCOPE', { scopeType: 'Out of Scope' }), []);
    assert.deepEqual(formatErrors('SCOPE', { scopeType: 'both' }), []);
    const submit = submitErrors('SCOPE', { scopeType: 'in' });
    assert.deepEqual(
      submit.map((row) => row.field),
      ['description']
    );
  });

  it('requires BPM step, glossary definition, and assumption text only on submit', () => {
    assert.deepEqual(formatErrors('BPM', {}), []);
    assert.equal(submitErrors('BPM', {})[0].field, 'step');
    assert.equal(submitErrors('GLOSSARY', {})[0].field, 'definition');
    assert.equal(submitErrors('ASSUMPTION', {})[0].field, 'text');
    assert.deepEqual(submitErrors('UC', { title: 'Login' }), []);
    assert.deepEqual(submitErrors('DATA', {}), []);
    assert.deepEqual(submitErrors('WBS', {}), []);
  });

  it('checks WBS numbers and email only when present', () => {
    assert.deepEqual(formatErrors('WBS', { effortHours: '', roleKey: '' }), []);
    const hours = formatErrors('WBS', { effortHours: 'eight' });
    assert.equal(hours[0].code, 'invalid_number');
    assert.equal(hours[0].field, 'effortHours');
    assert.deepEqual(formatErrors('WBS', { effortHours: 0 }), []);
    assert.deepEqual(formatErrors('WBS', { effortHours: '8.5' }), []);
    const email = formatErrors('WBS', { assigneeEmail: 'no-at' });
    assert.equal(email[0].code, 'invalid_email');
    assert.deepEqual(formatErrors('WBS', { assigneeEmail: 'a@b' }), []);
  });

  it('accepts YYYY-MM-DD and Date, rejects unparseable dates, ignores start after end', () => {
    assert.deepEqual(
      formatErrors('SCHEDULE', { startDate: '2026-10-01', endDate: '2026-09-01' }),
      []
    );
    assert.deepEqual(
      formatErrors('SCHEDULE', { startDate: new Date('2026-10-01T00:00:00Z'), endDate: '2026-12-31' }),
      []
    );
    const bad = formatErrors('MILESTONE', { targetDate: 'not-a-date' });
    assert.equal(bad[0].code, 'invalid_date');
    assert.equal(bad[0].field, 'targetDate');
    assert.ok(!('scheduleWarnings' in bad));
    assert.deepEqual(formatErrors('SCHEDULE', { startDate: '', endDate: '' }), []);
  });

  it('accepts dependency type and risk scales from the list or typed', () => {
    assert.deepEqual(formatErrors('DEPENDENCY', { dependencyType: '' }), []);
    assert.deepEqual(formatErrors('DEPENDENCY', { dependencyType: 'XX' }), []);
    assert.deepEqual(formatErrors('DEPENDENCY', { dependencyType: 'fs', lagDays: 0 }), []);
    assert.equal(formatErrors('DEPENDENCY', { lagDays: -1 })[0].code, 'invalid_number');
    assert.deepEqual(formatErrors('RISK', { impact: 'Low', probability: 'HIGH' }), []);
    assert.deepEqual(formatErrors('RISK', { impact: 'critical' }), []);
  });

  it('does not invent columns for an unknown kind', () => {
    assert.deepEqual(formatErrors('NOPE', { level: 'Epic', effortHours: 'x' }), []);
    assert.deepEqual(submitErrors('NOPE', {}), []);
  });
});
