const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  suggestMeetingPlanLines,
  suggestEventDrafts,
} = require('../src/engines/meetingPlanSuggest');

describe('meetingPlanSuggest', () => {
  it('builds plan lines from role hours × weeks', () => {
    const { lines, meta } = suggestMeetingPlanLines({
      weeklyHoursByRole: { project_manager: 2, business_analyst: 3 },
      weekKeys: ['2026-10-12', '2026-10-19'],
    });
    assert.equal(lines.length, 4);
    assert.equal(meta.llmCalls, 0);
    assert.ok(lines.every((l) => l.source === 'ai_suggest'));
  });

  it('event drafts stay draft / n_a customer', () => {
    const drafts = suggestEventDrafts({
      slots: [
        {
          startAt: '2026-10-13T03:00:00.000Z',
          endAt: '2026-10-13T04:00:00.000Z',
          participantUserIds: ['u1'],
        },
      ],
    });
    assert.equal(drafts[0].status, 'draft');
    assert.equal(drafts[0].customerExchangeStatus, 'n_a');
    assert.equal(drafts[0].source, 'ai_draft');
  });
});
