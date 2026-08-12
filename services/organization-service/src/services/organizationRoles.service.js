/**
 * Organization Role trên People Graph — suy từ Department.head / Team.leader / OU head|lead.
 * Dùng cho nghỉ phép / KPI / đánh giá — KHÔNG dùng để authorize assign task.
 */
const Department = require('../models/Department');
const Team = require('../models/Team');
const OrganizationalUnit = require('../models/OrganizationalUnit');
const OrgUnitMembership = require('../models/OrgUnitMembership');
const {
  ORGANIZATION_ROLE_KEYS,
  ROLE_KIND,
} = require('@enterprise/shared/config/roleTaxonomy');

/**
 * @returns {Promise<Array<{ key: string, kind: string, scopeType: string, scopeId: string, label: string }>>}
 */
async function resolveOrganizationRoles(userId, organizationId) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!uid || !oid) return [];

  const roles = [];

  const [headedDepts, ledTeams, headedUnits, unitMemberships] = await Promise.all([
    Department.find({ organization: oid, head: uid, isActive: { $ne: false } })
      .select('_id name')
      .lean(),
    Team.find({ organization: oid, leader: uid, isActive: true }).select('_id name').lean(),
    OrganizationalUnit.find({
      organization: oid,
      $or: [
        { 'attributes.headUserId': uid },
        { 'attributes.leaderUserId': uid },
      ],
      'attributes.isActive': { $ne: false },
    })
      .select('_id name attributes levelKey')
      .lean()
      .catch(() => []),
    OrgUnitMembership.find({
      organization: oid,
      userId: uid,
      roleInUnit: { $in: ['head', 'lead'] },
    })
      .select('unitId roleInUnit')
      .lean()
      .catch(() => []),
  ]);

  for (const d of headedDepts) {
    roles.push({
      key: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
      kind: ROLE_KIND.ORGANIZATION,
      scopeType: 'department',
      scopeId: String(d._id),
      label: d.name || 'Department',
    });
  }
  for (const t of ledTeams) {
    roles.push({
      key: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
      kind: ROLE_KIND.ORGANIZATION,
      scopeType: 'team',
      scopeId: String(t._id),
      label: t.name || 'Team',
    });
  }
  for (const u of headedUnits || []) {
    const isHead = String(u.attributes?.headUserId || '') === uid;
    roles.push({
      key: isHead
        ? ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER
        : ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
      kind: ROLE_KIND.ORGANIZATION,
      scopeType: 'ou',
      scopeId: String(u._id),
      label: u.name || u.levelKey || 'Unit',
    });
  }
  for (const m of unitMemberships || []) {
    roles.push({
      key:
        m.roleInUnit === 'head'
          ? ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER
          : ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
      kind: ROLE_KIND.ORGANIZATION,
      scopeType: 'ou',
      scopeId: String(m.unitId),
      label: m.roleInUnit,
    });
  }

  const seen = new Set();
  return roles.filter((r) => {
    const k = `${r.key}:${r.scopeType}:${r.scopeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

module.exports = {
  resolveOrganizationRoles,
};
