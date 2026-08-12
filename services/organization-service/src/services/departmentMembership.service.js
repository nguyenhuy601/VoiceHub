/**
 * Department membership — enforce 1 user ↔ 1 department; keep head ∈ members.
 * Pure planners are unit-tested; apply* persist via Department model.
 */
const Department = require('../models/Department');
const { ORGANIZATION_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const { logger } = require('@enterprise/shared');

const DEPT_MANAGER_KEY = ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER;

function normalizeId(raw) {
  return String(raw || '').trim();
}

function uniqueIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function deptIdOf(row) {
  return normalizeId(row?._id || row?.id);
}

function memberIdsOf(row) {
  return uniqueIds(row?.members || []);
}

function headIdOf(row) {
  return normalizeId(row?.head);
}

function makeConflict(message, errorCode) {
  const err = new Error(message);
  err.statusCode = 409;
  err.errorCode = errorCode || 'DEPT_MEMBERSHIP_CONFLICT';
  return err;
}

/**
 * @typedef {{ _id: string, members?: unknown[], head?: unknown }} DeptSnap
 * @typedef {{ deptId: string, members: string[], head: string|null }} DeptPatch
 */

/**
 * Plan setMembers for target dept: move users from other depts; refuse removing current head.
 * @param {DeptSnap[]} departments
 * @param {string} targetDeptId
 * @param {string[]} nextMemberIds
 * @returns {DeptPatch[]}
 */
function planSetMembers(departments, targetDeptId, nextMemberIds) {
  const targetId = normalizeId(targetDeptId);
  const nextIds = uniqueIds(nextMemberIds);
  const snaps = (departments || []).map((d) => ({
    _id: deptIdOf(d),
    members: memberIdsOf(d),
    head: headIdOf(d) || null,
  }));

  const target = snaps.find((d) => d._id === targetId);
  if (!target) {
    const err = new Error('Department not found');
    err.statusCode = 404;
    err.errorCode = 'DEPT_NOT_FOUND';
    throw err;
  }

  if (target.head && !nextIds.includes(target.head)) {
    throw makeConflict(
      'Không thể gỡ trưởng phòng khỏi danh sách members — đổi trưởng phòng trước',
      'DEPT_HEAD_MUST_REASSIGN'
    );
  }

  /** @type {Map<string, DeptPatch>} */
  const patchMap = new Map();

  const ensurePatch = (dept) => {
    if (!patchMap.has(dept._id)) {
      patchMap.set(dept._id, {
        deptId: dept._id,
        members: [...dept.members],
        head: dept.head,
      });
    }
    return patchMap.get(dept._id);
  };

  // Start from current target members → replace with nextIds
  const targetPatch = ensurePatch(target);
  targetPatch.members = [...nextIds];

  const nextSet = new Set(nextIds);
  for (const dept of snaps) {
    if (dept._id === targetId) continue;
    const staying = dept.members.filter((uid) => !nextSet.has(uid));
    const removed = dept.members.filter((uid) => nextSet.has(uid));
    if (!removed.length && staying.length === dept.members.length) continue;
    const p = ensurePatch(dept);
    p.members = staying;
    if (p.head && nextSet.has(p.head)) {
      p.head = null;
    }
  }

  return [...patchMap.values()];
}

/**
 * Plan setHead: ensure head in members; clear head on other depts for same user.
 * @param {DeptSnap[]} departments
 * @param {string} targetDeptId
 * @param {string|null} headUserId
 * @returns {DeptPatch[]}
 */
function planSetHead(departments, targetDeptId, headUserId) {
  const targetId = normalizeId(targetDeptId);
  const nextHead = normalizeId(headUserId) || null;
  const snaps = (departments || []).map((d) => ({
    _id: deptIdOf(d),
    members: memberIdsOf(d),
    head: headIdOf(d) || null,
  }));

  const target = snaps.find((d) => d._id === targetId);
  if (!target) {
    const err = new Error('Department not found');
    err.statusCode = 404;
    err.errorCode = 'DEPT_NOT_FOUND';
    throw err;
  }

  /** @type {Map<string, DeptPatch>} */
  const patchMap = new Map();
  const ensurePatch = (dept) => {
    if (!patchMap.has(dept._id)) {
      patchMap.set(dept._id, {
        deptId: dept._id,
        members: [...dept.members],
        head: dept.head,
      });
    }
    return patchMap.get(dept._id);
  };

  const targetPatch = ensurePatch(target);
  targetPatch.head = nextHead;
  if (nextHead && !targetPatch.members.includes(nextHead)) {
    targetPatch.members = [...targetPatch.members, nextHead];
  }

  if (nextHead) {
    for (const dept of snaps) {
      if (dept._id === targetId) continue;
      if (dept.head === nextHead) {
        const p = ensurePatch(dept);
        p.head = null;
      }
    }
  }

  return [...patchMap.values()];
}

/**
 * Plan remove one member; 409 if removing current head.
 * @param {DeptSnap[]} departments
 * @param {string} targetDeptId
 * @param {string} userId
 * @returns {DeptPatch[]}
 */
function planRemoveMember(departments, targetDeptId, userId) {
  const targetId = normalizeId(targetDeptId);
  const uid = normalizeId(userId);
  const snaps = (departments || []).map((d) => ({
    _id: deptIdOf(d),
    members: memberIdsOf(d),
    head: headIdOf(d) || null,
  }));
  const target = snaps.find((d) => d._id === targetId);
  if (!target) {
    const err = new Error('Department not found');
    err.statusCode = 404;
    err.errorCode = 'DEPT_NOT_FOUND';
    throw err;
  }
  if (target.head && target.head === uid) {
    throw makeConflict(
      'Không thể gỡ trưởng phòng — đổi trưởng phòng trước',
      'DEPT_HEAD_MUST_REASSIGN'
    );
  }
  return planSetMembers(departments, targetId, target.members.filter((id) => id !== uid));
}

async function loadOrgDepartments(organizationId) {
  const rows = await Department.find({ organization: organizationId })
    .select('_id members head name')
    .lean();
  return rows.map((r) => ({
    _id: String(r._id),
    members: (r.members || []).map((m) => String(m)),
    head: r.head ? String(r.head) : null,
    name: String(r.name || '').trim(),
  }));
}

async function applyDeptPatches(organizationId, patches) {
  for (const patch of patches || []) {
    await Department.updateOne(
      { _id: patch.deptId, organization: organizationId },
      { $set: { members: patch.members, head: patch.head || null } }
    );
  }
}

async function syncHierarchyRolesBestEffort(organizationId, beforeDepts, patches) {
  const {
    syncDepartmentHierarchyRolesFromPatches,
  } = require('../clients/hierarchyRoleAssign.client');
  await syncDepartmentHierarchyRolesFromPatches(
    organizationId,
    beforeDepts,
    patches
  ).catch((error) => {
    logger.warn('[departmentMembership] hierarchy role revoke cleanup skipped:', error.message);
  });
}

async function syncLeadershipDualWrite(organizationId, patches) {
  const { dualWriteSyncOuLeadership } = require('./orgOuDualWrite.service');
  for (const patch of patches || []) {
    await dualWriteSyncOuLeadership(organizationId, 'Department', patch.deptId, {
      headUserId: patch.head || null,
    }).catch((error) => {
      logger.warn('[departmentMembership] OU leadership sync skipped:', error.message);
    });
  }
}

/**
 * Keep OrgRoleAssignment.department_manager aligned with Department.head.
 */
async function syncDepartmentManagerOrgRole(organizationId, { previousHeadIds = [], nextHeadId = null, actorUserId = null } = {}) {
  const OrgRoleAssignment = require('../models/OrgRoleAssignment');
  const { toObjectId } = require('../utils/orgAccess');
  const oid = toObjectId(organizationId);
  const next = normalizeId(nextHeadId) || null;
  const prevSet = new Set(
    (previousHeadIds || []).map(normalizeId).filter((id) => id && id !== next)
  );

  for (const prev of prevSet) {
    await OrgRoleAssignment.deleteMany({
      organizationId: oid,
      userId: toObjectId(prev),
      roleKey: DEPT_MANAGER_KEY,
    });
  }

  if (next) {
    const uid = toObjectId(next);
    const existing = await OrgRoleAssignment.findOne({
      organizationId: oid,
      userId: uid,
      roleKey: DEPT_MANAGER_KEY,
    }).lean();
    if (!existing) {
      if (!actorUserId) {
        logger.warn('[departmentMembership] skip org role upsert: missing actorUserId');
      } else {
        await OrgRoleAssignment.create({
          organizationId: oid,
          userId: uid,
          roleKey: DEPT_MANAGER_KEY,
          assignedBy: toObjectId(actorUserId),
        });
      }
    }
  }
}

function collectPreviousHeads(departments, patches) {
  const byId = new Map((departments || []).map((d) => [deptIdOf(d), d]));
  const prev = [];
  for (const patch of patches || []) {
    const before = byId.get(patch.deptId);
    const oldHead = headIdOf(before);
    if (oldHead && oldHead !== (patch.head || null)) prev.push(oldHead);
  }
  return prev;
}

async function setMembers(organizationId, departmentId, memberIds, { actorUserId } = {}) {
  const departments = await loadOrgDepartments(organizationId);
  const patches = planSetMembers(departments, departmentId, memberIds);
  const previousHeadIds = collectPreviousHeads(departments, patches);
  await applyDeptPatches(organizationId, patches);
  await syncLeadershipDualWrite(organizationId, patches);
  await syncHierarchyRolesBestEffort(organizationId, departments, patches);

  const targetPatch = patches.find((p) => p.deptId === normalizeId(departmentId));
  await syncDepartmentManagerOrgRole(organizationId, {
    previousHeadIds,
    nextHeadId: targetPatch?.head || null,
    actorUserId,
  }).catch((error) => {
    logger.warn('[departmentMembership] org role sync skipped:', error.message);
  });

  return Department.findOne({ _id: departmentId, organization: organizationId });
}

/**
 * Thêm user vào phòng (merge) — dùng Transfer/Assign khi FE không có đủ memberIds từ OU tree.
 * Giữ head ∈ members; vẫn enforce 1 user ↔ 1 phòng.
 */
async function addMembers(organizationId, departmentId, userIdsToAdd, { actorUserId } = {}) {
  const departments = await loadOrgDepartments(organizationId);
  const targetId = normalizeId(departmentId);
  const target = departments.find((d) => d._id === targetId);
  if (!target) {
    const err = new Error('Department not found');
    err.statusCode = 404;
    err.errorCode = 'DEPT_NOT_FOUND';
    throw err;
  }
  const nextIds = uniqueIds([
    ...target.members,
    ...(target.head ? [target.head] : []),
    ...(userIdsToAdd || []),
  ]);
  return setMembers(organizationId, departmentId, nextIds, { actorUserId });
}

async function setHead(organizationId, departmentId, headUserId, { actorUserId } = {}) {
  const departments = await loadOrgDepartments(organizationId);
  const before = departments.find((d) => d._id === normalizeId(departmentId));
  const patches = planSetHead(departments, departmentId, headUserId);
  const previousHeadIds = collectPreviousHeads(departments, patches);
  if (before?.head) previousHeadIds.push(before.head);

  await applyDeptPatches(organizationId, patches);
  await syncLeadershipDualWrite(organizationId, patches);
  await syncHierarchyRolesBestEffort(organizationId, departments, patches);

  const targetPatch = patches.find((p) => p.deptId === normalizeId(departmentId));
  await syncDepartmentManagerOrgRole(organizationId, {
    previousHeadIds,
    nextHeadId: targetPatch?.head || null,
    actorUserId,
  }).catch((error) => {
    logger.warn('[departmentMembership] org role sync skipped:', error.message);
  });

  return Department.findOne({ _id: departmentId, organization: organizationId });
}

async function removeMember(organizationId, departmentId, userId, opts = {}) {
  const departments = await loadOrgDepartments(organizationId);
  const patches = planRemoveMember(departments, departmentId, userId);
  await applyDeptPatches(organizationId, patches);
  await syncLeadershipDualWrite(organizationId, patches);
  await syncHierarchyRolesBestEffort(organizationId, departments, patches);
  return Department.findOne({ _id: departmentId, organization: organizationId });
}

module.exports = {
  DEPT_MANAGER_KEY,
  normalizeId,
  uniqueIds,
  planSetMembers,
  planSetHead,
  planRemoveMember,
  setMembers,
  addMembers,
  setHead,
  removeMember,
  syncDepartmentManagerOrgRole,
};
