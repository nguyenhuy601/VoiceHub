const BULK_EVENT = 'notification:bulk_new';
const DEFAULT_EMIT_CONCURRENCY = 10;

/**
 * Mỗi người nhận chỉ nhận đúng thông báo của mình — không broadcast cả danh sách
 * (tránh lộ userId / id thông báo của người nhận khác).
 */
function buildPerUserBulkEvents(entries, timestamp) {
  return (entries || [])
    .filter((entry) => entry && entry.userId && entry.notification)
    .map(({ userId, notification }) => ({
      event: BULK_EVENT,
      userId: String(userId),
      payload: {
        notifications: [notification],
        timestamp,
      },
    }));
}

async function runWithConcurrency(tasks, limit = DEFAULT_EMIT_CONCURRENCY) {
  const list = Array.isArray(tasks) ? tasks : [];
  const size = Math.max(1, Number(limit) || DEFAULT_EMIT_CONCURRENCY);
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await list[index]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
  return results;
}

module.exports = {
  BULK_EVENT,
  DEFAULT_EMIT_CONCURRENCY,
  buildPerUserBulkEvents,
  runWithConcurrency,
};
