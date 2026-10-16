/**
 * Derived DM roster ACL — replaces friend-service graph.
 * RULE-01: accepted when peers share same org + (same department OR overlapping projects).
 */
const Membership = require('../models/Membership');
const UserProjectMembership = require('../models/UserProjectMembership');
const { buildDepartmentRoster } = require('./structurePlacement.service');
const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');
const { logger } = require('@enterprise/shared');

function normalizePeerId(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object') {
    return String(raw._id || raw.userId || raw.id || '').trim();
  }
  return String(raw || '').trim();
}

/**
 * @param {Iterable<string>|null|undefined} userDeptIds
 * @param {Iterable<string>|null|undefined} peerDeptIds
 */
function peersShareDepartment(userDeptIds, peerDeptIds) {
  const a = new Set(
    [...(userDeptIds || [])].map(normalizePeerId).filter(Boolean)
  );
  if (!a.size) return false;
  for (const id of peerDeptIds || []) {
    const pid = normalizePeerId(id);
    if (pid && a.has(pid)) return true;
  }
  return false;
}

/**
 * @param {Iterable<string>|null|undefined} userProjectIds
 * @param {Iterable<string>|null|undefined} peerProjectIds
 */
function peersShareProject(userProjectIds, peerProjectIds) {
  const a = new Set(
    [...(userProjectIds || [])].map(normalizePeerId).filter(Boolean)
  );
  if (!a.size) return false;
  for (const id of peerProjectIds || []) {
    const pid = normalizePeerId(id);
    if (pid && a.has(pid)) return true;
  }
  return false;
}

/**
 * @param {...Iterable<string>} sets
 * @returns {Set<string>}
 */
function unionPeerIds(...sets) {
  const out = new Set();
  for (const s of sets) {
    for (const id of s || []) {
      const pid = normalizePeerId(id);
      if (pid) out.add(pid);
    }
  }
  return out;
}

/**
 * Department IDs the user belongs to in a roster (members + head already in memberIds).
 * @param {Array<{ departmentId: string, memberIds: string[], headId?: string|null }>} roster
 * @param {string} userId
 * @returns {Set<string>}
 */
function departmentIdsForUser(roster, userId) {
  const uid = normalizePeerId(userId);
  const out = new Set();
  if (!uid) return out;
  for (const dept of roster || []) {
    const depId = normalizePeerId(dept.departmentId);
    if (!depId) continue;
    const members = dept.memberIds || [];
    if (members.some((m) => normalizePeerId(m) === uid)) {
      out.add(depId);
      continue;
    }
    if (normalizePeerId(dept.headId) === uid) out.add(depId);
  }
  return out;
}

/**
 * Peer userIds sharing any department with user in this org roster.
 */
function deptPeersFromRoster(roster, userId) {
  const uid = normalizePeerId(userId);
  const myDepts = departmentIdsForUser(roster, uid);
  const peers = new Set();
  if (!uid || !myDepts.size) return peers;
  for (const dept of roster || []) {
    if (!myDepts.has(normalizePeerId(dept.departmentId))) continue;
    for (const mid of dept.memberIds || []) {
      const pid = normalizePeerId(mid);
      if (pid && pid !== uid) peers.add(pid);
    }
    const head = normalizePeerId(dept.headId);
    if (head && head !== uid) peers.add(head);
  }
  return peers;
}

async function activeOrgIdsForUser(userId) {
  const uid = normalizePeerId(userId);
  if (!uid) return [];
  const rows = await Membership.find({ user: uid, status: 'active' })
    .select('organization')
    .lean();
  return [
    ...new Set(
      rows.map((r) => normalizePeerId(r.organization)).filter(Boolean)
    ),
  ];
}

async function collectDepartmentPeerIds(userId) {
  const uid = normalizePeerId(userId);
  const peers = new Set();
  if (!uid) return peers;
  const orgIds = await activeOrgIdsForUser(uid);
  for (const orgId of orgIds) {
    const roster = await buildDepartmentRoster(orgId);
    for (const pid of deptPeersFromRoster(roster, uid)) peers.add(pid);
  }
  return peers;
}

async function collectProjectPeerIds(userId) {
  const uid = normalizePeerId(userId);
  const peers = new Set();
  if (!uid) return peers;

  const myRows = await UserProjectMembership.find({ userId: uid }).lean();
  for (const row of myRows) {
    const oid = normalizePeerId(row.organizationId);
    const myProjects = [...(row.projectIds || [])].map(normalizePeerId).filter(Boolean);
    if (!oid || !myProjects.length) continue;

    const others = await UserProjectMembership.find({
      organizationId: oid,
      userId: { $ne: uid },
      projectIds: { $in: myProjects },
    })
      .select('userId')
      .lean();

    for (const o of others) {
      const pid = normalizePeerId(o.userId);
      if (pid) peers.add(pid);
    }
  }
  return peers;
}

function whitelistProfile(row, fallbackId) {
  if (!row || typeof row !== 'object') {
    return { _id: fallbackId, username: null, displayName: null, avatar: null, status: 'offline' };
  }
  return {
    _id: String(row.userId || row._id || row.id || fallbackId),
    username: row.username ?? null,
    displayName: row.displayName ?? null,
    avatar: row.avatar ?? null,
    status: row.status || 'offline',
  };
}

/**
 * @param {string} userId
 * @param {{ page?: number, limit?: number }} opts
 */
async function listFriends(userId, { page = 1, limit = 50 } = {}) {
  const uid = normalizePeerId(userId);
  if (!uid) {
    return { friends: [], totalPages: 0, currentPage: 1, total: 0 };
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

  const [deptPeers, projectPeers] = await Promise.all([
    collectDepartmentPeerIds(uid),
    collectProjectPeerIds(uid),
  ]);
  const allPeerIds = [...unionPeerIds(deptPeers, projectPeers)].filter((id) => id !== uid).sort();
  const total = allPeerIds.length;
  const start = (pageNum - 1) * limitNum;
  const pageIds = allPeerIds.slice(start, start + limitNum);

  let profileMap = new Map();
  try {
    profileMap = await fetchProfilesByUserIds(pageIds);
  } catch (err) {
    logger.warn('[dmRoster] profile enrich failed:', err?.message || err);
  }

  const now = new Date();
  const friends = pageIds.map((peerId) => ({
    friendId: whitelistProfile(profileMap.get(peerId), peerId),
    relationshipStatus: 'accepted',
    acceptedAt: now,
    createdAt: now,
  }));

  return {
    friends,
    totalPages: total === 0 ? 0 : Math.ceil(total / limitNum),
    currentPage: pageNum,
    total,
  };
}

/**
 * @param {string} userId
 * @param {string} peerId
 * @returns {Promise<{ status: 'accepted'|'none' }>}
 */
async function getRelationship(userId, peerId) {
  const a = normalizePeerId(userId);
  const b = normalizePeerId(peerId);
  if (!a || !b || a === b) return { status: 'none' };

  const [orgsA, orgsB] = await Promise.all([
    activeOrgIdsForUser(a),
    activeOrgIdsForUser(b),
  ]);
  const setA = new Set(orgsA);
  const sharedOrgs = orgsB.filter((oid) => setA.has(oid));
  if (!sharedOrgs.length) return { status: 'none' };

  for (const orgId of sharedOrgs) {
    const roster = await buildDepartmentRoster(orgId);
    const deptsA = departmentIdsForUser(roster, a);
    const deptsB = departmentIdsForUser(roster, b);
    if (peersShareDepartment(deptsA, deptsB)) {
      return { status: 'accepted' };
    }

    const [upA, upB] = await Promise.all([
      UserProjectMembership.findOne({ userId: a, organizationId: orgId })
        .select('projectIds')
        .lean(),
      UserProjectMembership.findOne({ userId: b, organizationId: orgId })
        .select('projectIds')
        .lean(),
    ]);
    if (peersShareProject(upA?.projectIds, upB?.projectIds)) {
      return { status: 'accepted' };
    }
  }

  return { status: 'none' };
}

module.exports = {
  normalizePeerId,
  peersShareDepartment,
  peersShareProject,
  unionPeerIds,
  departmentIdsForUser,
  deptPeersFromRoster,
  listFriends,
  getRelationship,
};
