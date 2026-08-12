const Membership = require('../models/Membership');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const {
  fetchUserRoleNamesInOrg,
  resolveUserHierarchyScopes,
} = require('../utils/memberPlacementScope');
const { upsertAssignmentsFromScopes, pickPrimaryScope } = require('./memberScopePolicy.service');
const { ensureAcceptedWithPeers } = require('../clients/departmentAutoFriend.client');
const { logger } = require('@enterprise/shared');

function toIdStrings(ids = []) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Sau khi user vào department/team qua role sync: auto-friend với peers cùng đơn vị.
 * Fail-soft, chạy nền — không fail sync.
 */
function scheduleAutoFriendAfterRoleSync(userId, { departmentIds = [], teamIds = [] }) {
  const uid = String(userId || '').trim();
  if (!uid) return;

  const deptIds = toIdStrings(departmentIds);
  const tIds = toIdStrings(teamIds);
  if (!deptIds.length && !tIds.length) return;

  const peerCap = Math.max(2, Number(process.env.DEPARTMENT_AUTO_FRIEND_MAX_PEERS || 80) || 80);

  setImmediate(() => {
    (async () => {
      const peers = new Set();

      if (deptIds.length) {
        const depts = await Department.find({ _id: { $in: deptIds } })
          .select('members')
          .lean();
        for (const d of depts) {
          for (const m of toIdStrings(d.members)) {
            if (m !== uid) peers.add(m);
          }
        }
      }

      if (tIds.length) {
        const teams = await Team.find({ _id: { $in: tIds }, isActive: true })
          .select('members')
          .lean();
        for (const t of teams) {
          for (const m of toIdStrings(t.members)) {
            if (m !== uid) peers.add(m);
          }
        }
      }

      const peerList = [...peers].slice(0, peerCap);
      if (!peerList.length) return;
      await ensureAcceptedWithPeers(uid, peerList, { source: 'role_sync' });
    })().catch((err) => {
      logger.warn('[membershipPlacementSync] auto-friend failed:', err?.message || err);
    });
  });
}

/**
 * Khi user thuộc phòng ban: tự kết bạn (accepted) với mọi member khác trong các phòng đó.
 */
async function autoFriendDepartmentPeers(userId, organizationId, departmentIds) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  const depIds = (departmentIds || []).map(String).filter(Boolean);
  if (!uid || !oid || !depIds.length) return { skipped: true };

  const departments = await Department.find({
    organization: oid,
    _id: { $in: depIds },
  })
    .select('members')
    .lean();

  const peers = new Set();
  for (const dep of departments) {
    for (const member of dep.members || []) {
      const mid = String(member || '').trim();
      if (mid && mid !== uid) peers.add(mid);
    }
  }
  if (!peers.size) return { skipped: true, reason: 'no_peers' };

  return ensureAcceptedWithPeers(uid, [...peers], { source: 'department' });
}

/**
 * Đồng bộ RoleScopeAssignment từ các role hierarchy (div_/dep_/team_).
 * Gọi sau khi gán/gỡ role vị trí trong role-permission-service.
 */
async function syncMembershipPlacementFromRoles(userId, organizationId) {
  const uid = String(userId || '');
  const oid = String(organizationId || '');
  if (!uid || !oid) return { ok: false, reason: 'missing_ids' };

  const membership = await Membership.findOne({
    user: uid,
    organization: oid,
    status: 'active',
  });
  if (!membership) {
    return { ok: false, reason: 'no_membership' };
  }

  const roleNames = await fetchUserRoleNamesInOrg(uid, oid);
  const [divisions, departments, teams] = await Promise.all([
    Division.find({ organization: oid }).select('_id name branch').lean(),
    Department.find({ organization: oid }).select('_id name branch division').lean(),
    Team.find({ organization: oid, isActive: true }).select('_id name branch division department').lean(),
  ]);

  const scopes = resolveUserHierarchyScopes(roleNames, {
    divisions,
    departments,
    teams,
  });

  const targetDivisionIds = [...(scopes.divisionIds || [])].map(String).filter(Boolean);
  const targetDepartmentIds = [...(scopes.departmentIds || [])].map(String).filter(Boolean);
  const targetTeamIds = [...(scopes.teamIds || [])].map(String).filter(Boolean);

  // Đồng bộ member list theo scope role hiện tại:
  // - role còn scope: giữ user trong cấp tương ứng
  // - role bị gỡ: tự động pull user ra khỏi cấp không còn thuộc scope
  // Department: enforce 1 user ↔ 1 phòng (primary = first scope id)
  const primaryDepartmentId = targetDepartmentIds[0] || null;
  if (targetDepartmentIds.length > 1) {
    logger.info('[membershipPlacementSync] multi dept scopes collapsed to primary', {
      userId: uid,
      organizationId: oid,
      primaryDepartmentId,
      skipped: targetDepartmentIds.slice(1),
    });
  }

  await Promise.all([
    Division.updateMany(
      {
        organization: oid,
        isActive: true,
        members: uid,
        ...(targetDivisionIds.length ? { _id: { $nin: targetDivisionIds } } : {}),
      },
      { $pull: { members: uid } }
    ),
    Team.updateMany(
      {
        organization: oid,
        isActive: true,
        members: uid,
        ...(targetTeamIds.length ? { _id: { $nin: targetTeamIds } } : {}),
      },
      { $pull: { members: uid } }
    ),
  ]);

  // Department members — chỉ qua departmentMembership.service (1 user ↔ 1 phòng).
  const deptMembership = require('./departmentMembership.service');
  try {
    if (primaryDepartmentId) {
      await deptMembership.addMembers(oid, primaryDepartmentId, [uid], { actorUserId: uid });
    } else {
      const holding = await Department.find({ organization: oid, members: uid }).select('_id').lean();
      for (const d of holding) {
        try {
          await deptMembership.removeMember(oid, d._id, uid);
        } catch (err) {
          if (err.statusCode === 409) {
            await Department.updateOne({ _id: d._id, head: uid }, { $set: { head: null } });
            await deptMembership.removeMember(oid, d._id, uid).catch((e2) => {
              logger.warn('[membershipPlacementSync] dept remove after clear head:', e2.message);
            });
          } else {
            logger.warn('[membershipPlacementSync] dept remove:', err.message);
          }
        }
      }
    }
  } catch (err) {
    logger.warn('[membershipPlacementSync] departmentMembership sync failed:', err.message);
  }

  await Promise.all([
    targetDivisionIds.length
      ? Division.updateMany(
          { organization: oid, isActive: true, _id: { $in: targetDivisionIds } },
          { $addToSet: { members: uid } }
        )
      : null,
    targetTeamIds.length
      ? Team.updateMany(
          { organization: oid, isActive: true, _id: { $in: targetTeamIds } },
          { $addToSet: { members: uid } }
        )
      : null,
  ]);
  // Huy P4: dual-sync OrgUnitMembership từ legacy dept/team (qua legacyRef)
  let ouIds = [];
  try {
    const OrganizationalUnit = require('../models/OrganizationalUnit');
    const OrgUnitMembership = require('../models/OrgUnitMembership');
    const legacyPairs = [
      ...targetDivisionIds.map((id) => ({ collection: 'Division', id })),
      ...targetDepartmentIds.map((id) => ({ collection: 'Department', id })),
      ...targetTeamIds.map((id) => ({ collection: 'Team', id })),
    ];
    if (legacyPairs.length) {
      const or = legacyPairs.map((p) => ({
        'legacyRef.collection': p.collection,
        'legacyRef.id': p.id,
      }));
      const ous = await OrganizationalUnit.find({
        organization: oid,
        $or: or,
        'attributes.isActive': { $ne: false },
      })
        .select('_id')
        .lean();
      ouIds = ous.map((u) => String(u._id));
    }
    await OrgUnitMembership.deleteMany({ organization: oid, userId: uid });
    if (ouIds.length) {
      const primaryId = ouIds[ouIds.length - 1];
      await OrgUnitMembership.insertMany(
        ouIds.map((unitId) => ({
          organization: oid,
          userId: uid,
          unitId,
          roleInUnit: 'member',
          isPrimary: String(unitId) === String(primaryId),
        })),
        { ordered: false }
      );
    }
  } catch (error) {
    logger.warn('[membershipPlacementSync] OU membership sync skipped:', error.message);
  }

  await upsertAssignmentsFromScopes({
    organizationId: oid,
    userId: uid,
    roleNames,
    scopeSets: { ...scopes, ouIds },
    source: 'role_sync',
  });
  const placement = pickPrimaryScope({ ...scopes, ouIds: new Set(ouIds) });

  let departmentAutoFriend = null;
  if (primaryDepartmentId) {
    try {
      departmentAutoFriend = await autoFriendDepartmentPeers(uid, oid, [primaryDepartmentId]);
    } catch (error) {
      logger.warn('[membershipPlacementSync] department auto-friend failed:', error.message);
      departmentAutoFriend = { ok: false, reason: error.message };
    }
  }

  if (targetDepartmentIds.length || targetTeamIds.length) {
    scheduleAutoFriendAfterRoleSync(uid, {
      departmentIds: targetDepartmentIds,
      teamIds: targetTeamIds,
    });
  }

  logger.info('[membershipPlacementSync] synced', {
    userId: uid,
    organizationId: oid,
    teamId: placement.teamId,
    departmentId: placement.departmentId,
    divisionId: placement.divisionId,
    roleCount: roleNames.length,
    departmentAutoFriend: departmentAutoFriend?.ok
      ? { ensured: departmentAutoFriend?.data?.ensured }
      : departmentAutoFriend,
  });

  return {
    ok: true,
    placement,
    roleNames,
    departmentAutoFriend,
  };
}

module.exports = {
  syncMembershipPlacementFromRoles,
  autoFriendDepartmentPeers,
};
