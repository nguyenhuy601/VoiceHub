/**
 * People Ops — gán/gỡ members trên Department / Team (legacy members[]).
 * Sau khi gán: S2S auto-friend với peers cùng đơn vị (Directory DM) — fail-soft.
 */
const { mongoose } = require('@enterprise/shared/config/mongo');
const { logger } = require('@enterprise/shared');
const Department = require('../models/Department');
const Team = require('../models/Team');
const { normalizeMemberIds } = require('./placementPolicy');
const { invalidateOrgReadCache } = require('./orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { ensureAcceptedWithPeers } = require('../clients/departmentAutoFriend.client');

const bump = (orgId) =>
  invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(() => null);

function toObjectIds(ids) {
  return ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
}

function toIdStrings(ids = []) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
}

const MAX_PEERS = () =>
  Math.max(2, Number(process.env.DEPARTMENT_AUTO_FRIEND_MAX_PEERS || 80) || 80);

/**
 * Chỉ ensure các user mới vào nhóm với peers hiện có. Không block / không throw.
 * Chạy nền để không kéo latency API placement.
 */
function scheduleAutoFriendForNewMembers(previousIds, nextIds, source) {
  const prev = new Set(toIdStrings(previousIds));
  const next = toIdStrings(nextIds);
  if (next.length < 2) return;

  const added = next.filter((id) => !prev.has(id));
  const targets = added.length ? added : [];
  if (!targets.length) return;

  const peerCap = MAX_PEERS();
  const peersBase = next.length > peerCap + 1 ? next.slice(0, peerCap + 1) : next;

  setImmediate(() => {
    (async () => {
      for (const uid of targets) {
        const peers = peersBase.filter((id) => id !== uid);
        if (!peers.length) continue;
        await ensureAcceptedWithPeers(uid, peers, { source });
      }
    })().catch((err) => {
      logger.warn('[placement] departmentAutoFriend schedule failed:', err?.message || err);
    });
  });
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
