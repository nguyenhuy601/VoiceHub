const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const {
  normalizeRequirementAccessPolicy,
  defaultRequirementAccessPolicy,
} = require('@enterprise/shared/config/requirementAccessPolicy');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const CACHE_TTL_MS = 5 * 60 * 1000;
const policyCache = new Map();

function cacheKey(organizationId) {
  return String(organizationId || '').trim();
}

function readCache(organizationId) {
  const key = cacheKey(organizationId);
  if (!key) return null;
  const row = policyCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) {
    policyCache.delete(key);
    return null;
  }
  return row.policy;
}

function writeCache(organizationId, policy) {
  const key = cacheKey(organizationId);
  if (!key) return;
  policyCache.set(key, { at: Date.now(), policy });
}

function invalidateRequirementAccessPolicyCache(organizationId) {
  const key = cacheKey(organizationId);
  if (key) policyCache.delete(key);
}

async function fetchRequirementAccessPolicy(organizationId) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return defaultRequirementAccessPolicy();

  const cached = readCache(orgId);
  if (cached) return cached;

  if (!ORGANIZATION_SERVICE_URL) {
    const fallback = defaultRequirementAccessPolicy();
    writeCache(orgId, fallback);
    return fallback;
  }

  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        orgId
      )}/requirement-access-policy`,
      {
        headers: buildTrustedGatewayHeaders(''),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) {
      const fallback = defaultRequirementAccessPolicy();
      writeCache(orgId, fallback);
      return fallback;
    }
    const data = res.data?.data ?? res.data ?? {};
    const policy = normalizeRequirementAccessPolicy(data.policy || data);
    writeCache(orgId, policy);
    return policy;
  } catch {
    const fallback = defaultRequirementAccessPolicy();
    writeCache(orgId, fallback);
    return fallback;
  }
}

module.exports = {
  fetchRequirementAccessPolicy,
  invalidateRequirementAccessPolicyCache,
};
