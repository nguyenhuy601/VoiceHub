/**
 * People Ops — gán/gỡ members trên Department / Team (legacy members[]).
 * Auto-friend graph retired — DM ACL derived from placement (dmRoster).
 */
const { mongoose } = require('@enterprise/shared/config/mongo');
const Department = require('../models/Department');
const Team = require('../models/Team');
const { normalizeMemberIds } = require('./placementPolicy');
const { invalidateOrgReadCache } = require('./orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');

const bump = (orgId) =>
  invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(() => null);

function toObjectIds(ids) {
  return ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
}

/** Graph auto-friend retired — no-op. */
function scheduleAutoFriendForNewMembers() {
  return;
}

/**
 * @param {string} orgId
 * @param {string} deptId
 * @param {unknown} members
 * @returns {Promise<{ ok: true, doc: object } | { ok: false, code: string, message: string }>}
 */
async function setDepartmentMembers(orgId, deptId, members) {
  const ids = toObjectIds(normalizeMemberIds(members));
  const prevDoc = await Department.findOne({ _id: deptId, organization: orgId })
    .select('members')
    .lean();
  if (!prevDoc) {
    return { ok: false, code: 'ORG_NOT_FOUND', message: 'Department not found' };
  }

  const doc = await Department.findOneAndUpdate(
    { _id: deptId, organization: orgId },
    { $set: { members: ids } },
    { new: true }
  );
  if (!doc) {
    return { ok: false, code: 'ORG_NOT_FOUND', message: 'Department not found' };
  }

  scheduleAutoFriendForNewMembers(prevDoc.members, doc.members, 'department');
  await bump(orgId);
  return { ok: true, doc };
}

/**
 * @param {string} orgId
 * @param {string} teamId
 * @param {unknown} members
 * @returns {Promise<{ ok: true, doc: object } | { ok: false, code: string, message: string }>}
 */
async function setTeamMembers(orgId, teamId, members) {
  const ids = toObjectIds(normalizeMemberIds(members));
  const prevDoc = await Team.findOne({ _id: teamId, organization: orgId, isActive: true })
    .select('members')
    .lean();
  if (!prevDoc) {
    return { ok: false, code: 'ORG_NOT_FOUND', message: 'Team not found' };
  }

  const doc = await Team.findOneAndUpdate(
    { _id: teamId, organization: orgId, isActive: true },
    { $set: { members: ids } },
    { new: true }
  );
  if (!doc) {
    return { ok: false, code: 'ORG_NOT_FOUND', message: 'Team not found' };
  }

  scheduleAutoFriendForNewMembers(prevDoc.members, doc.members, 'team');
  await bump(orgId);
  return { ok: true, doc };
}

module.exports = {
  setDepartmentMembers,
  setTeamMembers,
  scheduleAutoFriendForNewMembers,
};
