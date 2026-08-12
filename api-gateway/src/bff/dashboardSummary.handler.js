const { bffCachedRead } = require('./bffRead');
const { dashboardSummaryCacheKey } = require('./cache');
const { buildDashboardSummary } = require('./dashboardSummary.service');
const { sendApiError, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

const TTL_SEC = Math.min(
  120,
  Math.max(15, parseInt(process.env.BFF_DASHBOARD_CACHE_TTL_SEC || '45', 10) || 45)
);

async function handleDashboardSummary(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const cacheKey = dashboardSummaryCacheKey(userId);
    const { data, fromCache } = await bffCachedRead({
      cacheKey,
      coalesceKey: cacheKey,
      ttlSec: TTL_SEC,
      loader: () => buildDashboardSummary(userId, req.user?.email),
    });

    if (fromCache) res.setHeader('X-Bff-Cache', 'HIT');
    const rmStatus = data?._rm;
    if (rmStatus) res.setHeader('X-Dashboard-Rm', String(rmStatus));
    const payload = { ...data };
    delete payload._rm;
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('[bff:dashboard] error:', error.message);
    return sendApiError(res, 500, {
      errorCode: 'GATEWAY_INTERNAL_ERROR',
      message: 'Dashboard summary failed',
      messageUser: GENERIC_5XX_MESSAGE,
    });
  }
}

module.exports = { handleDashboardSummary };
