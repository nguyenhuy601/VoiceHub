const {
  resolveOrgChannelAccess,
  resolveUserIdFromReq,
} = require('../services/orgAccessReadModel');

async function fetchAccessibleChannelPermissionMatrix(orgId, req) {
  const access = await resolveOrgChannelAccess(orgId, req);
  return {
    ids: access.channelIds,
    matrix: access.permissionsByChannelId,
  };
}

function denyChannel(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function assertCanWriteInOrgChannel(orgId, roomId, req) {
  if (!orgId || !roomId) {
    throw denyChannel('organizationId and roomId are required', 400);
  }
  const { matrix } = await fetchAccessibleChannelPermissionMatrix(orgId, req);
  const perms = matrix[String(roomId)] || {};
  if (!Boolean(perms.canWrite)) {
    throw denyChannel('Bạn không có quyền chat trong kênh này', 403);
  }
}

/** D6: đọc kênh org bắt buộc organizationId + canRead. */
async function assertCanReadInOrgChannel(orgId, roomId, req) {
  if (!orgId || !roomId) {
    throw denyChannel('organizationId and roomId are required', 400);
  }
  const { matrix } = await fetchAccessibleChannelPermissionMatrix(orgId, req);
  const perms = matrix[String(roomId)] || {};
  if (!Boolean(perms.canRead)) {
    throw denyChannel('Bạn không có quyền đọc kênh này', 403);
  }
}

module.exports = {
  fetchAccessibleChannelPermissionMatrix,
  assertCanWriteInOrgChannel,
  assertCanReadInOrgChannel,
  resolveUserIdFromReq,
};
