const INFLIGHT_WINDOW_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_JOBS_PER_MINUTE = Math.max(
  parseInt(process.env.SUMMARY_MAX_JOBS_PER_MINUTE || '5', 10) || 5,
  1
);

function findInflightSummary(Model, { threadKey, userId, lastMessageId, now = Date.now() }) {
  if (!lastMessageId) return null;
  return Model.findOne({
    threadKey,
    'sourceMeta.lastMessageId': String(lastMessageId),
    status: { $in: ['queued', 'processing'] },
    generatedBy: userId,
    createdAt: { $gt: new Date(now - INFLIGHT_WINDOW_MS) },
  })
    .sort({ createdAt: -1 })
    .lean();
}

function countRecentJobs(Model, { userId, now = Date.now() }) {
  return Model.countDocuments({
    generatedBy: userId,
    createdAt: { $gt: new Date(now - RATE_WINDOW_MS) },
  });
}

module.exports = {
  INFLIGHT_WINDOW_MS,
  RATE_WINDOW_MS,
  MAX_JOBS_PER_MINUTE,
  findInflightSummary,
  countRecentJobs,
};
