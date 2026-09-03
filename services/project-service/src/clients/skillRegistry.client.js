const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

function isRegistryEnabled() {
  return String(process.env.SKILL_REGISTRY_ENABLED || 'true').trim().toLowerCase() !== 'false';
}

async function resolveSkillsBatch(organizationId, skills = [], options = {}) {
  if (!isRegistryEnabled() || !ORGANIZATION_SERVICE_URL || !organizationId) {
    return { results: [], newSkills: [], enabled: false };
  }
  try {
    const res = await axios.post(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/skills/resolve-batch`,
      {
        skills,
        allowPending: options.allowPending !== false,
        source: options.source || 'Import',
      },
      {
        headers: buildTrustedGatewayHeaders(),
        timeout: Number(process.env.SKILL_REGISTRY_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) {
      return { results: [], newSkills: [], enabled: true, error: res.data?.message || `HTTP ${res.status}` };
    }
    const data = res.data?.data || {};
    return {
      results: Array.isArray(data.results) ? data.results : [],
      newSkills: Array.isArray(data.newSkills) ? data.newSkills : [],
      enabled: true,
    };
  } catch (err) {
    return { results: [], newSkills: [], enabled: true, error: err.message };
  }
}

async function fetchSkillsByIds(organizationId, skillIds = []) {
  if (!isRegistryEnabled() || !ORGANIZATION_SERVICE_URL || !organizationId || !skillIds.length) {
    return [];
  }
  try {
    const res = await axios.post(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/skills/by-ids`,
      { skillIds },
      {
        headers: buildTrustedGatewayHeaders(),
        timeout: Number(process.env.SKILL_REGISTRY_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return [];
    return res.data?.data?.items || [];
  } catch {
    return [];
  }
}

module.exports = {
  isRegistryEnabled,
  resolveSkillsBatch,
  fetchSkillsByIds,
};
