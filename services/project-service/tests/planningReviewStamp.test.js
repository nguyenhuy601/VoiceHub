const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  planningReviewFieldUpdates,
  priorStampsForPlanningTransition,
} = require('../src/utils/planningReviewStamp');

describe('planningReviewFieldUpdates', () => {
  const stamp = { userId: 'pm-1' };

  it('draft submit does not stamp a gate', () => {
    assert.deepEqual(planningReviewFieldUpdates('draft', 'pm_review', stamp), {});
  });

  it('pm_review → tech_review stamps PM', () => {
    assert.deepEqual(planningReviewFieldUpdates('pm_review', 'tech_review', stamp), {
      'review.pm': stamp,
    });
  });

  it('tech_review → po_review stamps Tech', () => {
    assert.deepEqual(planningReviewFieldUpdates('tech_review', 'po_review', stamp), {
      'review.tech': stamp,
    });
  });

  it('po_review → approved stamps PO', () => {
    assert.deepEqual(planningReviewFieldUpdates('po_review', 'approved', stamp), {
      'review.po': stamp,
    });
  });
});

describe('priorStampsForPlanningTransition', () => {
  it('tech gate sees the PM stamp', () => {
    const prior = priorStampsForPlanningTransition('tech_review', 'po_review', {
      pm: { userId: 'pm-1' },
      ba: null,
    });
    assert.equal(prior[1].userId, 'pm-1');
  });
});
