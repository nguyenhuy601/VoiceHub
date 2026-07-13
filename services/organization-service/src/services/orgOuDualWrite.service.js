/**
 * Huy: Dual-write OU → legacy Branch/Division/Department/Team (P5 transition).
 * Chỉ khi levelKey khớp collection legacy và ORG_OU_DUAL_WRITE !== '0'.
 */
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const OrganizationalUnit = require('../models/OrganizationalUnit');
const { ensureDepartmentRole, ensureTeamRole, ensureDivisionRole } = require('./hierarchyRoleSync');

function dualWriteEnabled() {
  const v = String(process.env.ORG_OU_DUAL_WRITE || 'true').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

async function findAncestorLegacy(organizationId, unit, collection) {
  let current = unit;
  while (current?.parentUnitId) {
    current = await OrganizationalUnit.findOne({
      _id: current.parentUnitId,
      organization: organizationId,
    }).lean();
    if (!current) break;
    if (current.legacyRef?.collection === collection && current.legacyRef?.id) {
      return current.legacyRef.id;
    }
    if (current.levelKey === collection.toLowerCase() && current.legacyRef?.id) {
      return current.legacyRef.id;
    }
  }
  return null;
}

/**
 * Huy: Sau createUnit — nếu levelKey legacy thì tạo doc tương ứng + gắn legacyRef.
 */
async function dualWriteCreateLegacy(organizationId, ouDoc) {
  if (!dualWriteEnabled() || !ouDoc) return ouDoc;
  const levelKey = String(ouDoc.levelKey || '');
  const name = ouDoc.name;

  try {
    if (levelKey === 'branch' && !ouDoc.legacyRef?.id) {
      const branch = await Branch.create({
        organization: organizationId,
        name,
        location: ouDoc.attributes?.location || '',
        isActive: ouDoc.attributes?.isActive !== false,
      });
      ouDoc.legacyRef = { collection: 'Branch', id: branch._id };
      await ouDoc.save();
      return ouDoc;
    }

    if (levelKey === 'division' && !ouDoc.legacyRef?.id) {
      let branchId = await findAncestorLegacy(organizationId, ouDoc, 'Branch');
      if (!branchId) {
        const def = await Branch.findOne({ organization: organizationId, isActive: true })
          .sort({ isDefault: -1, createdAt: 1 })
          .lean();
        branchId = def?._id;
      }
      if (!branchId) {
        const branch = await Branch.create({
          organization: organizationId,
          name: 'Trụ sở chính',
          isDefault: true,
        });
        branchId = branch._id;
      }
      const division = await Division.create({
        organization: organizationId,
        branch: branchId,
        name,
        isActive: true,
      });
      await ensureDivisionRole(organizationId, division._id, name);
      ouDoc.legacyRef = { collection: 'Division', id: division._id };
      await ouDoc.save();
      return ouDoc;
    }

    if (levelKey === 'department' && !ouDoc.legacyRef?.id) {
      let divisionId = await findAncestorLegacy(organizationId, ouDoc, 'Division');
      let branchId = await findAncestorLegacy(organizationId, ouDoc, 'Branch');
      if (!divisionId) {
        const def = await Division.findOne({ organization: organizationId, isActive: true })
          .sort({ isDefault: -1, createdAt: 1 })
          .lean();
        divisionId = def?._id;
        branchId = branchId || def?.branch;
      }
      if (!divisionId) return ouDoc;
      const department = await Department.create({
        organization: organizationId,
        division: divisionId,
        branch: branchId || null,
        name,
        description: ouDoc.description || '',
        head: ouDoc.attributes?.headUserId || null,
      });
      await ensureDepartmentRole(organizationId, department._id, name);
      ouDoc.legacyRef = { collection: 'Department', id: department._id };
      await ouDoc.save();
      return ouDoc;
    }

    if (levelKey === 'team' && !ouDoc.legacyRef?.id) {
      let departmentId = await findAncestorLegacy(organizationId, ouDoc, 'Department');
      if (!departmentId) {
        const def = await Department.findOne({ organization: organizationId }).sort({ createdAt: 1 }).lean();
        departmentId = def?._id;
      }
      if (!departmentId) return ouDoc;
      const dep = await Department.findById(departmentId).lean();
      const team = await Team.create({
        organization: organizationId,
        department: departmentId,
        branch: dep?.branch || null,
        division: dep?.division || null,
        name,
        description: ouDoc.description || '',
        leader: ouDoc.attributes?.leaderUserId || null,
        isActive: true,
      });
      await ensureTeamRole(organizationId, team._id, name);
      ouDoc.legacyRef = { collection: 'Team', id: team._id };
      await ouDoc.save();
      return ouDoc;
    }
  } catch (e) {
    console.warn('[orgOuDualWrite] failed:', e.message);
  }
  return ouDoc;
}

module.exports = {
  dualWriteEnabled,
  dualWriteCreateLegacy,
};
