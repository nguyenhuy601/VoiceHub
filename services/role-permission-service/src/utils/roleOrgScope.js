const mongoose = require('mongoose');

function isValidObjectId(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s;
}

function pushDistinct(set, value) {
  const s = String(value || '').trim();
  if (s) set.add(s);
}

/** Tập org id client gửi (body/query/params). Không đọc role DB. */
function collectRequestedOrgIds(req) {
  const set = new Set();
  if (!req || typeof req !== 'object') return set;
  pushDistinct(set, req.body?.organizationId);
  pushDistinct(set, req.body?.serverId);
  pushDistinct(set, req.query?.organizationId);
  pushDistinct(set, req.query?.serverId);
  pushDistinct(set, req.params?.serverId);
  return set;
}

/**
 * Route có :roleId — org tin cậy lấy từ role trong DB.
 * Nếu client gửi org và không khớp org của role → 404 (không lộ tồn tại).
 */
function resolveRoleBoundOrg({ requestedOrgIds, roleOrgIds }) {
  const roleIds = [...(roleOrgIds || [])].map((x) => String(x || '').trim()).filter(Boolean);
  if (!roleIds.length) {
    return { ok: false, status: 404, errorCode: 'ROLE_NOT_FOUND', message: 'Role not found' };
  }
  const canonical = roleIds[0];
  const roleSet = new Set(roleIds);
  const requested = [...(requestedOrgIds || [])].map((x) => String(x || '').trim()).filter(Boolean);
  for (const id of requested) {
    if (!roleSet.has(id)) {
      return { ok: false, status: 404, errorCode: 'ROLE_NOT_FOUND', message: 'Role not found' };
    }
  }
  return { ok: true, organizationId: canonical };
}

/**
 * Route không :roleId (create/assign/remove) — organizationId và serverId nếu cùng có phải bằng nhau.
 */
function resolveRequestOrg({ requestedOrgIds }) {
  const ids = [...(requestedOrgIds || [])].map((x) => String(x || '').trim()).filter(Boolean);
  const unique = [...new Set(ids)];
  if (!unique.length) {
    return {
      ok: false,
      status: 400,
      errorCode: 'ROLE_ORG_REQUIRED',
      message: 'organizationId or serverId is required',
    };
  }
  if (unique.length > 1) {
    return {
      ok: false,
      status: 400,
      errorCode: 'ROLE_ORG_MISMATCH',
      message: 'organizationId and serverId must match',
    };
  }
  return { ok: true, organizationId: unique[0] };
}

function buildRoleOrgFilter(roleId, organizationId) {
  const orgId = String(organizationId || '').trim();
  return {
    _id: roleId,
    isActive: true,
    $or: [{ organizationId: orgId }, { serverId: orgId }],
  };
}

function roleOrgIdsFromDoc(role) {
  if (!role) return [];
  const ids = [];
  const org = role.organizationId != null ? String(role.organizationId) : '';
  const server = role.serverId != null ? String(role.serverId) : '';
  if (org) ids.push(org);
  if (server && server !== org) ids.push(server);
  if (!ids.length && server) ids.push(server);
  return ids.length ? ids : server || org ? [server || org] : [];
}

module.exports = {
  isValidObjectId,
  collectRequestedOrgIds,
  resolveRoleBoundOrg,
  resolveRequestOrg,
  buildRoleOrgFilter,
  roleOrgIdsFromDoc,
};
