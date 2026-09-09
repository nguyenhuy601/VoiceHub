const { mongoose } = require('@enterprise/shared/config/mongo');

function objectIdError(fieldName) {
  const err = new Error(`${fieldName} không hợp lệ`);
  err.statusCode = 400;
  err.errorCode = 'VALIDATION_OBJECT_ID';
  return err;
}

function parseObjectId(value, fieldName) {
  const id = String(value || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    throw objectIdError(fieldName);
  }
  return new mongoose.Types.ObjectId(id);
}

function activeUserRoleQuery(userId, serverId) {
  return {
    userId: parseObjectId(userId, 'userId'),
    serverId: parseObjectId(serverId, 'serverId'),
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  };
}

function serializeAssignedRole(role) {
  if (!role) return null;
  const obj = typeof role.toObject === 'function' ? role.toObject() : { ...role };
  const id = String(obj._id || obj.id || '').trim();
  if (!id) return null;
  return { ...obj, _id: id, id, roleId: id };
}

function mapPopulatedUserRoles(userRoles) {
  return (Array.isArray(userRoles) ? userRoles : [])
    .map((row) => serializeAssignedRole(row?.roleId))
    .filter(Boolean);
}

module.exports = {
  parseObjectId,
  activeUserRoleQuery,
  serializeAssignedRole,
  mapPopulatedUserRoles,
};
