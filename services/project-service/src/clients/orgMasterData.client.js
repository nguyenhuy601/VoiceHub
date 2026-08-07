const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const {
  MASTER_PROJECT_ROLE_KEYS,
  MASTER_POSITION_KEYS,
} = require('@enterprise/shared/config/masterData');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

async function fetchEnabledProjectRoleKeys(organizationId) {
  if (!ORGANIZATION_SERVICE_URL || !organizationId) {
    return [...MASTER_PROJECT_ROLE_KEYS];
  }
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/master-data/enabled-project-roles`,
      {
        headers: buildTrustedGatewayHeaders(),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return [...MASTER_PROJECT_ROLE_KEYS];
    const keys = res.data?.data?.enabledProjectRoleKeys;
    return Array.isArray(keys) && keys.length ? keys : [...MASTER_PROJECT_ROLE_KEYS];
  } catch {
    return [...MASTER_PROJECT_ROLE_KEYS];
  }
}

async function fetchEnabledPositionKeys(organizationId) {
  if (!ORGANIZATION_SERVICE_URL || !organizationId) {
    return [...MASTER_POSITION_KEYS];
  }
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/master-data/enabled-positions`,
      {
        headers: buildTrustedGatewayHeaders(),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return [...MASTER_POSITION_KEYS];
    const keys = res.data?.data?.enabledPositionKeys;
    return Array.isArray(keys) && keys.length ? keys : [...MASTER_POSITION_KEYS];
  } catch {
    return [...MASTER_POSITION_KEYS];
  }
}

module.exports = { fetchEnabledProjectRoleKeys, fetchEnabledPositionKeys };
