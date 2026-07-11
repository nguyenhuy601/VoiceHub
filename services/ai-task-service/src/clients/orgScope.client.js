const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

async function fetchTaskWorkspaceScope(userId, organizationId) {
  if (!ORGANIZATION_SERVICE_URL || !userId || !organizationId) return null;
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(String(organizationId))}/task-workspace-scope`,
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return null;
    return res.data?.data ?? res.data ?? null;
  } catch {
    return null;
  }
}

async function assertCanUseAiTask(userId, organizationId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!scope) {
    const err = new Error('Không lấy được phạm vi task workspace');
    err.statusCode = 403;
    throw err;
  }
  const allowed = Boolean(scope.canUseAiTask ?? scope.canCreateTask);
  if (!allowed) {
    const err = new Error('Chỉ PM/TL/Admin mới được xác nhận tạo task bằng AI');
    err.statusCode = 403;
    err.errorCode = 'AI_CONFIRM_ROLE_DENIED';
    throw err;
  }
  return scope;
}

module.exports = {
  fetchTaskWorkspaceScope,
  assertCanUseAiTask,
};
