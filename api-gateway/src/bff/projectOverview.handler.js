/**
 * Read-through cache cho GET /projects/:projectId/overview (aggregate ở project-service).
 */
const { bffCachedRead } = require('./bffRead');
const { projectOverviewCacheKey } = require('./cache');
const { services, buildTrustedHeaders, fetchJson } = require('./httpDownstream');
const { sendApiError, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

const TTL_SEC = Math.min(
  60,
  Math.max(5, parseInt(process.env.BFF_PROJECT_OVERVIEW_CACHE_TTL_SEC || '15', 10) || 15)
);

const PROJECT_OVERVIEW_TIMEOUT_MS = Math.min(
  60000,
  Math.max(5000, parseInt(process.env.BFF_PROJECT_OVERVIEW_TIMEOUT_MS || '20000', 10) || 20000)
);

async function fetchProjectOverview(userId, userEmail, projectId, req) {
  const headers = buildTrustedHeaders(userId, userEmail, req);
  const url = `${services.project.url}/api/projects/${encodeURIComponent(projectId)}/overview`;
  const res = await fetchJson(url, headers, 'project-overview', PROJECT_OVERVIEW_TIMEOUT_MS);
  if (!res.ok) {
    const err = new Error(
      res.timedOut
        ? 'Project overview timed out — thử tải lại sau vài giây'
        : res.data?.message || res.data?.error || 'Project overview unavailable'
    );
    err.statusCode = res.timedOut ? 504 : res.status || 503;
    err.code = res.timedOut ? 'BFF_PROJECT_OVERVIEW_TIMEOUT' : undefined;
    throw err;
  }
  return res.data;
}

async function handleProjectOverview(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const projectId = req.params?.projectId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    const cacheKey = projectOverviewCacheKey(userId, projectId);
    const { data, fromCache } = await bffCachedRead({
      cacheKey,
      coalesceKey: cacheKey,
      ttlSec: TTL_SEC,
      loader: () => fetchProjectOverview(userId, req.user?.email, projectId, req),
    });

    if (fromCache) res.setHeader('X-Bff-Cache', 'HIT');
    return res.json(data);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[bff:project-overview] error:', error.message);
    const errorCode = error.code || error.errorCode || 'GATEWAY_INTERNAL_ERROR';
    if (status >= 500) {
      return sendApiError(res, status, {
        errorCode,
        message: error.message || 'Project overview failed',
        messageUser:
          errorCode === 'BFF_PROJECT_OVERVIEW_TIMEOUT'
            ? error.message || 'Project overview timed out — thử tải lại sau vài giây'
            : GENERIC_5XX_MESSAGE,
        extra: { status: 'fail' },
      });
    }
    return sendApiError(res, status, {
      errorCode,
      message: error.message || 'Project overview failed',
      messageUser: error.messageUser || error.message || 'Project overview failed',
      extra: { status: 'fail' },
    });
  }
}

module.exports = { handleProjectOverview };
