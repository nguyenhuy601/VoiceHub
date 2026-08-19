const UserProjectMembership = require('../models/UserProjectMembership');
const UserOrgChannelAccess = require('../models/UserOrgChannelAccess');

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

async function hasActiveProjectMembership(userId, organizationId, projectId) {
  const pid = asId(projectId);
  if (!pid) return false;
  const ids = await listProjectIdsForUser(userId, organizationId);
  return ids.includes(pid);
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

/**
 * UserIds in an org channel who also have the project (for targeted socket emit).
 */
async function listContextCallAudienceUserIds({ organizationId, roomId, projectId }) {
  const oid = asId(organizationId);
  const rid = asId(roomId);
  const pid = asId(projectId);
  if (!oid || !rid || !pid) return [];

  const members = await UserProjectMembership.find({
    organizationId: oid,
    projectIds: pid,
  })
    .select('userId')
    .lean();
  const candidateIds = members.map((row) => String(row.userId)).filter(Boolean);
  if (!candidateIds.length) return [];

  const accessRows = await UserOrgChannelAccess.find({
    userId: { $in: candidateIds },
    organizationId: oid,
  })
    .select('userId channelIds')
    .lean();

  const out = [];
  for (const row of accessRows) {
    const channels = Array.isArray(row.channelIds) ? row.channelIds.map(String) : [];
    if (channels.includes(rid)) out.push(String(row.userId));
  }
  return [...new Set(out)];
}

async function listAllProjectIdsForUser(userId) {
  const uid = asId(userId);
  if (!uid) return [];
  const rows = await UserProjectMembership.find({ userId: uid }).select('projectIds').lean();
  return [...new Set(rows.flatMap((row) => (Array.isArray(row.projectIds) ? row.projectIds : [])).map(String))];
}

async function visibilityMongoClauseForViewer(userId, organizationId) {
  const {
    isContextCallEnabled,
    isContextVisibleToRoom,
    mongoVisibilityFilter,
  } = require('../utils/contextCallVisibility');
  if (!isContextCallEnabled()) return null;
  if (isContextVisibleToRoom()) return null;
  const ids = organizationId
    ? await listProjectIdsForUser(userId, organizationId)
    : await listAllProjectIdsForUser(userId);
  return mongoVisibilityFilter(ids);
}

module.exports = {
  listProjectIdsForUser,
  listAllProjectIdsForUser,
  hasActiveProjectMembership,
  applyMemberChanged,
  listContextCallAudienceUserIds,
  visibilityMongoClauseForViewer,
};
