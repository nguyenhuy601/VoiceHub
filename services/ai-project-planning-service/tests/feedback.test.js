const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFeedback } = require('../src/feedback/feedbackParser');

describe('feedbackParser', () => {
  it('ban employee → planning impact scope resource+schedule, skip requirement', () => {
    const parsed = parseFeedback({
      kind: 'planning_feedback',
      text: 'Ban employee EMP-102 from this plan',
      excludeEmployeeId: 'EMP-102',
    });
    assert.equal(parsed.kind, 'planning_feedback');
    assert.ok(parsed.impactScope.includes('resource'));
    assert.ok(parsed.impactScope.includes('schedule'));
    assert.ok(!parsed.impactScope.includes('requirement'));
    assert.deepEqual(parsed.bannedEmployeeIds, ['EMP-102']);
    assert.equal(parsed.skipsRequirementUnderstanding, true);
  });

  it('requirement_feedback scopes to requirement only by default', () => {
    const parsed = parseFeedback({
      kind: 'requirement_feedback',
      text: 'Clarify FR wording for login',
    });
    assert.equal(parsed.kind, 'requirement_feedback');
    assert.deepEqual(parsed.impactScope, ['requirement']);
    assert.equal(parsed.skipsRequirementUnderstanding, false);
  });
});
