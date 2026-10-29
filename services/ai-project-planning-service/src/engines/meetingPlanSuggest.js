/**
 * normalizeCatalog — AI-assisted MeetingPlan suggestion from org rules + project duration.
 * Does NOT create MeetingEvent or customer-confirmed schedules.
 */

function suggestMeetingPlanLines({
  weeklyHoursByRole = {},
  weekKeys = [],
  source = 'ai_suggest',
} = {}) {
  const lines = [];
  for (const weekKey of weekKeys) {
    for (const [roleKey, hours] of Object.entries(weeklyHoursByRole || {})) {
      const h = Number(hours);
      if (!(h > 0)) continue;
      lines.push({
        weekKey: String(weekKey),
        roleKey: String(roleKey),
        userId: null,
        hours: h,
        activityId: '',
        source,
      });
    }
  }
  return {
    lines,
    meta: {
      llmCalls: 0,
      note: 'Rule-based suggest from Published/baseline config — human must confirm; no Event auto-create',
    },
  };
}

/**
 * Optional Event drafts (never status=confirmed customer) — normalizeCatalog stub.
 */
function suggestEventDrafts({ titlePrefix = 'Suggested sync', slots = [] } = {}) {
  return (slots || []).map((slot, i) => ({
    title: `${titlePrefix} ${i + 1}`,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: 'draft',
    source: 'ai_draft',
    customerExchangeStatus: 'n_a',
    participants: slot.participantUserIds || [],
  }));
}

module.exports = {
  suggestMeetingPlanLines,
  suggestEventDrafts,
};
