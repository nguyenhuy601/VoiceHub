const ProjectRole = require('../models/ProjectRole');
const ProjectMembership = require('../models/ProjectMembership');
const TaskBoardMember = require('../models/TaskBoardMember');
const TaskBoard = require('../models/TaskBoard');
const { DEFAULT_PROJECT_ROLES } = require('../config/projectRoleDefaults');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

const LEGACY_TO_PROJECT_ROLE = Object.freeze({
  owner: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  editor: DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER,
  viewer: DEFAULT_PROJECT_ROLE_KEYS.WATCHER,
});

async function ensureOrgProjectRoles(organizationId) {
  const oid = String(organizationId || '').trim();
  if (!oid) throw new Error('organizationId bắt buộc');

  const existing = await ProjectRole.find({ organizationId: oid }).lean();
  if (existing.length >= DEFAULT_PROJECT_ROLES.length) {
    return existing;
  }
  const byKey = new Map(existing.map((r) => [r.key, r]));
  for (const def of DEFAULT_PROJECT_ROLES) {
    if (byKey.has(def.key)) continue;
    const created = await ProjectRole.findOneAndUpdate(
      { organizationId: oid, key: def.key },
      {
        $setOnInsert: {
          organizationId: oid,
          key: def.key,
          label: def.label,
          canAssign: def.canAssign,
          isSystem: true,
          sortOrder: def.sortOrder,
        },
      },
      { upsert: true, new: true }
    ).lean();
    byKey.set(def.key, created);
  }
  return [...byKey.values()];
}

async function getRoleByKey(organizationId, key) {
  await ensureOrgProjectRoles(organizationId);
  return ProjectRole.findOne({ organizationId, key: String(key) }).lean();
}

/**
 * Migrate TaskBoardMember → ProjectMembership (idempotent).
 */
async function migrateBoardMembersToProjectRoles(boardId, actorId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board) throw new Error('Board không tồn tại');
  await ensureOrgProjectRoles(board.organizationId);
  const roles = await ProjectRole.find({ organizationId: board.organizationId }).lean();
  const roleByKey = new Map(roles.map((r) => [r.key, r]));

  const members = await TaskBoardMember.find({ boardId }).lean();
  let upserted = 0;
  for (const m of members) {
    const key = LEGACY_TO_PROJECT_ROLE[m.role] || DEFAULT_PROJECT_ROLE_KEYS.WATCHER;
    const role = roleByKey.get(key);
    if (!role) continue;
    const res = await ProjectMembership.updateOne(
      {
        boardId,
        userId: m.userId,
        projectRoleId: role._id,
      },
      {
        $setOnInsert: {
          organizationId: board.organizationId,
          boardId,
          userId: m.userId,
          projectRoleId: role._id,
          legacyBoardRole: m.role || null,
          addedBy: actorId || m.addedBy || m.userId,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) upserted += 1;
  }
  return { migrated: upserted, totalMembers: members.length };
}

async function ensureProjectMembership({ boardId, userId, projectRoleKey, addedBy }) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board) throw new Error('Board không tồn tại');
  const role = await getRoleByKey(board.organizationId, projectRoleKey);
  if (!role) throw new Error(`Project Role không tồn tại: ${projectRoleKey}`);
  const row = await ProjectMembership.findOneAndUpdate(
    { boardId, userId, projectRoleId: role._id },
    {
      $setOnInsert: {
        organizationId: board.organizationId,
        boardId,
        userId,
        projectRoleId: role._id,
        addedBy: addedBy || userId,
      },
    },
    { upsert: true, new: true }
  ).lean();
  return row;
}

async function listProjectMemberships(boardId) {
  const rows = await ProjectMembership.find({ boardId }).lean();
  const roleIds = [...new Set(rows.map((r) => String(r.projectRoleId)))];
  const roles = await ProjectRole.find({ _id: { $in: roleIds } }).lean();
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));
  return rows.map((r) => ({
    ...r,
    projectRole: roleMap.get(String(r.projectRoleId)) || null,
  }));
}

async function listUserProjectRolesOnBoard(boardId, userId) {
  const rows = await ProjectMembership.find({ boardId, userId }).lean();
  if (!rows.length) return [];
  const roles = await ProjectRole.find({
    _id: { $in: rows.map((r) => r.projectRoleId) },
  }).lean();
  return roles;
}

async function setUserProjectRoles({ boardId, userId, projectRoleKeys, addedBy }) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board) throw new Error('Board không tồn tại');
  await ensureOrgProjectRoles(board.organizationId);
  const keys = [...new Set((projectRoleKeys || []).map((k) => String(k).trim()).filter(Boolean))];
  const roles = await ProjectRole.find({
    organizationId: board.organizationId,
    key: { $in: keys },
  }).lean();
  const roleIds = new Set(roles.map((r) => String(r._id)));

  await ProjectMembership.deleteMany({
    boardId,
    userId,
    projectRoleId: { $nin: [...roleIds] },
  });

  for (const role of roles) {
    await ProjectMembership.updateOne(
      { boardId, userId, projectRoleId: role._id },
      {
        $setOnInsert: {
          organizationId: board.organizationId,
          boardId,
          userId,
          projectRoleId: role._id,
          addedBy: addedBy || userId,
        },
      },
      { upsert: true }
    );
  }
  return listUserProjectRolesOnBoard(boardId, userId);
}

/**
 * Gắn PM từ ProjectBrief vào ProjectMembership.
 */
async function ensurePmMembershipFromBrief({ boardId, pmUserId, addedBy }) {
  if (!boardId || !pmUserId) return null;
  return ensureProjectMembership({
    boardId,
    userId: pmUserId,
    projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
    addedBy,
  });
}

module.exports = {
  ensureOrgProjectRoles,
  getRoleByKey,
  migrateBoardMembersToProjectRoles,
  ensureProjectMembership,
  listProjectMemberships,
  listUserProjectRolesOnBoard,
  setUserProjectRoles,
  ensurePmMembershipFromBrief,
  LEGACY_TO_PROJECT_ROLE,
};
