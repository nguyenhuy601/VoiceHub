const UserProjectMembership = require('../models/UserProjectMembership');

function asId(raw) {
  return String(raw || '').trim();
}

async function listProjectIdsForUser(userId, organizationId) {
  const uid = asId(userId);
  const oid = asId(organizationId);
  if (!uid || !oid) return [];
  const row = await UserProjectMembership.findOne({ userId: uid, organizationId: oid })
    .select('projectIds')
    .lean();
  return Array.isArray(row?.projectIds) ? row.projectIds.map(String) : [];
}

async function applyMemberChanged({ organizationId, projectId, userId, status }) {
  const oid = asId(organizationId);
  const pid = asId(projectId);
  const uid = asId(userId);
  const st = String(status || '').trim().toLowerCase();
  if (!oid || !pid || !uid) return null;
  if (st !== 'active' && st !== 'inactive') return null;

  const op =
    st === 'active'
      ? { $addToSet: { projectIds: pid }, $set: { updatedAt: new Date() } }
      : { $pull: { projectIds: pid }, $set: { updatedAt: new Date() } };

  return UserProjectMembership.findOneAndUpdate(
    { userId: uid, organizationId: oid },
    { ...op, $setOnInsert: { userId: uid, organizationId: oid } },
    { upsert: true, new: true }
  ).lean();
}

module.exports = {
  listProjectIdsForUser,
  applyMemberChanged,
};
