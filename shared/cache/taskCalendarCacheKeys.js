/** Redis keys — project-service calendar task feed (GET /tasks?view=calendar). */

function taskCalendarFeedCacheKey({ userId, fromDay, toDay, orgScope = 'me' }) {
  return `task:calendar:v1:${String(userId)}:${String(fromDay)}:${String(toDay)}:${String(orgScope || 'me')}`;
}

const DEFAULT_TASK_CALENDAR_CACHE_TTL_SEC = 90;

module.exports = {
  taskCalendarFeedCacheKey,
  DEFAULT_TASK_CALENDAR_CACHE_TTL_SEC,
};
