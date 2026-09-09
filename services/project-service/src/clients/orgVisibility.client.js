const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const {
  normalizeProjectVisibilityPolicy,
} = require('@enterprise/shared/config/projectVisibilityPolicy');
const { createTtlCoalesceCache } = require('../utils/ttlCoalesceCache');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const VISIBILITY_CACHE_TTL_MS = 15_000;
const visibilityCache = createTtlCoalesceCache({ ttlMs: VISIBILITY_CACHE_TTL_MS });

/** @type {null | ((url: string, opts: object) => Promise<{ status: number, data?: unknown }>)} */
let visibilityHttpGetForTests = null;

function emptyVisibilityContext(userId) {
  return {
    isOrgMember: false,
    membershipRole: null,
    organizationRoleKeys: [],
    headedDepartmentIds: [],
    memberDepartmentIds: [],
    policy: normalizeProjectVisibilityPolicy({}),
    userId: String(userId || ''),
  };
}

/**
 * S2S: org visibility policy + actor department/roles for discover resolve.
 */
async function fetchProjectVisibilityContextUncached(organizationId, userId) {
  const empty = emptyVisibilityContext(userId);
  if (!ORGANIZATION_SERVICE_URL || !organizationId || !userId) return empty;
  try {
    const httpGet = visibilityHttpGetForTests || ((url, opts) => axios.get(url, opts));
    const res = await httpGet(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/users/${encodeURIComponent(String(userId))}/project-visibility-context`,
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return empty;
    const data = res.data?.data ?? res.data ?? {};
    return {
      isOrgMember: Boolean(data.isOrgMember),
      membershipRole: data.membershipRole || null,
      organizationRoleKeys: Array.isArray(data.organizationRoleKeys) ? data.organizationRoleKeys : [],
      headedDepartmentIds: Array.isArray(data.headedDepartmentIds) ? data.headedDepartmentIds.map(String) : [],
      memberDepartmentIds: Array.isArray(data.memberDepartmentIds) ? data.memberDepartmentIds.map(String) : [],
      policy: normalizeProjectVisibilityPolicy(data.policy || {}),
      userId: String(userId),
    };
  } catch {
    return empty;
  }
}

async function fetchProjectVisibilityContext(organizationId, userId) {
  if (!organizationId || !userId) return emptyVisibilityContext(userId);
  const key = `${String(organizationId)}|${String(userId)}`;
  return visibilityCache.getOrLoad(key, () =>
    fetchProjectVisibilityContextUncached(organizationId, userId)
  );
}

function _clearProjectVisibilityContextCacheForTests() {
  visibilityCache.clear();
}

function _setProjectVisibilityContextCacheTtlForTests(ttlMs) {
  visibilityCache.setTtlMs(ttlMs);
}

function _setProjectVisibilityContextHttpGetForTests(fn) {
  visibilityHttpGetForTests = typeof fn === 'function' ? fn : null;
}

module.exports = {
  fetchProjectVisibilityContext,
  _clearProjectVisibilityContextCacheForTests,
  _setProjectVisibilityContextCacheTtlForTests,
  _setProjectVisibilityContextHttpGetForTests,
};
