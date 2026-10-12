/**
 * Scrum-only methodology validation (projectInitFields).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  PROJECT_METHODOLOGIES,
  buildProjectInitFields,
} = require('../src/utils/project/projectInitFields');

describe('projectInitFields methodology (scrum-only)', () => {
  it('exports only scrum', () => {
    assert.deepEqual([...PROJECT_METHODOLOGIES], ['scrum']);
  });

  it('defaults create body to scrum + sprint settings', () => {
    const result = buildProjectInitFields({});
    assert.equal(result.ok, true);
    assert.equal(result.fields.methodology, 'scrum');
    assert.equal(result.fields.methodologySettings.sprintDurationDays, 14);
    assert.equal(result.fields.methodologySettings.sprintStartDay, 'monday');
    assert.equal(result.fields.methodologySettings.wipLimit, undefined);
  });

  it('accepts explicit scrum with sprint overrides', () => {
    const result = buildProjectInitFields({
      methodology: 'scrum',
      sprintDurationDays: 10,
      sprintStartDay: 'wednesday',
    });
    assert.equal(result.ok, true);
    assert.equal(result.fields.methodology, 'scrum');
    assert.equal(result.fields.methodologySettings.sprintDurationDays, 10);
    assert.equal(result.fields.methodologySettings.sprintStartDay, 'wednesday');
  });

  it('rejects kanban', () => {
    const result = buildProjectInitFields({ methodology: 'kanban' });
    assert.equal(result.ok, false);
    assert.match(result.message, /scrum/i);
  });

  it('rejects waterfall', () => {
    const result = buildProjectInitFields({ methodology: 'waterfall' });
    assert.equal(result.ok, false);
    assert.match(result.message, /scrum/i);
  });

  it('partial patch without methodology does not force methodology', () => {
    const result = buildProjectInitFields({ priority: 'high' }, { partial: true });
    assert.equal(result.ok, true);
    assert.equal(result.fields.methodology, undefined);
  });
});
