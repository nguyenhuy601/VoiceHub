/**
 * Huy: Dual-write OU ↔ legacy Branch/Division/Department/Team (P5 transition).
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

async function findOuByLegacyRef(organizationId, collection, id) {
  if (!id || !collection) return null;
  return OrganizationalUnit.findOne({
    organization: organizationId,
    'legacyRef.collection': collection,
    'legacyRef.id': id,
  }).lean();
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
      const branchId = await findAncestorLegacy(organizationId, ouDoc, 'Branch');
      const division = await Division.create({
        organization: organizationId,
        branch: branchId || null,
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
        divisionId = def?._id || null;
        branchId = branchId || def?.branch || null;
      }
      const department = await Department.create({
        organization: organizationId,
        division: divisionId || null,
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
      let divisionId = await findAncestorLegacy(organizationId, ouDoc, 'Division');
      let branchId = await findAncestorLegacy(organizationId, ouDoc, 'Branch');
      if (!departmentId) {
        const def = await Department.findOne({ organization: organizationId }).sort({ createdAt: 1 }).lean();
        departmentId = def?._id || null;
        divisionId = divisionId || def?.division || null;
        branchId = branchId || def?.branch || null;
      }
      const dep = departmentId ? await Department.findById(departmentId).lean() : null;
      const team = await Team.create({
        organization: organizationId,
        department: departmentId || null,
        division: divisionId || dep?.division || null,
        branch: branchId || dep?.branch || null,
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

/**
 * Huy: Sau create hierarchy legacy — tạo OU gắn legacyRef (GET /structure prefer-OU thấy đơn vị).
 */
async function dualWriteCreateOu(organizationId, {
  levelKey,
  legacyCollection,
  legacyDoc,
  parentLegacy = null,
} = {}) {
  if (!dualWriteEnabled() || !legacyDoc?._id || !levelKey || !legacyCollection) return null;
  try {
    const { isDynamicStructureEnabled, createUnit } = require('./orgUnitTree.service');
    if (!isDynamicStructureEnabled()) return null;

    const existing = await findOuByLegacyRef(organizationId, legacyCollection, legacyDoc._id);
    if (existing) return existing;

    let parentUnitId = null;
    if (parentLegacy?.collection && parentLegacy?.id) {
      const parentOu = await findOuByLegacyRef(
        organizationId,
        parentLegacy.collection,
        parentLegacy.id
      );
      parentUnitId = parentOu?._id || null;
    }

    return await createUnit({
      organizationId,
      parentUnitId,
      levelKey: String(levelKey).trim(),
      name: legacyDoc.name,
      description: legacyDoc.description || '',
      attributes: {
        location: legacyDoc.location || '',
        headUserId: legacyDoc.head || null,
        leaderUserId: legacyDoc.leader || null,
        isDefault: Boolean(legacyDoc.isDefault),
        isActive: legacyDoc.isActive !== false,
      },
      legacyRef: { collection: legacyCollection, id: legacyDoc._id },
    });
  } catch (e) {
    console.warn('[orgOuDualWrite] reverse failed:', e.message);
    return null;
  }
}

/**
 * Huy: Sync isActive legacy → OU (vô hiệu hóa division/branch/team).
 */
async function dualWriteSyncOuActive(organizationId, legacyCollection, legacyId, isActive) {
  if (!dualWriteEnabled() || !legacyId || !legacyCollection) return null;
  try {
    return await OrganizationalUnit.findOneAndUpdate(
      {
        organization: organizationId,
        'legacyRef.collection': legacyCollection,
        'legacyRef.id': legacyId,
      },
      { $set: { 'attributes.isActive': Boolean(isActive) } },
      { new: true }
    );
  } catch (e) {
    console.warn('[orgOuDualWrite] sync active failed:', e.message);
    return null;
  }
}

/**
 * Huy: Soft-delete OU theo legacy ref (sau delete Department/Team).
 */
async function dualWriteSoftDeleteOu(organizationId, legacyCollection, legacyId) {
  return dualWriteSyncOuActive(organizationId, legacyCollection, legacyId, false);
}

/**
 * Huy: Sync legacy thiếu OU → OU (đơn vị tạo trước khi có reverse dual-write).
 */
async function syncMissingLegacyToOu(
  organizationId,
  { branches = [], divisions = [], departments = [], teams = [] } = {}
) {
  if (!dualWriteEnabled()) return { created: 0 };
  let created = 0;
  const mark = async (levelKey, legacyCollection, legacyDoc, parentLegacy) => {
    const existing = await findOuByLegacyRef(organizationId, legacyCollection, legacyDoc._id);
    if (existing) return;
    const doc = await dualWriteCreateOu(organizationId, {
      levelKey,
      legacyCollection,
      legacyDoc,
      parentLegacy,
    });
    if (doc) created += 1;
  };

  for (const b of branches) {
    await mark('branch', 'Branch', b, null);
  }
  for (const d of divisions) {
    await mark(
      'division',
      'Division',
      d,
      d.branch ? { collection: 'Branch', id: d.branch } : null
    );
  }
  for (const dep of departments) {
    await mark(
      'department',
      'Department',
      dep,
      dep.division ? { collection: 'Division', id: dep.division } : null
    );
  }
  for (const t of teams) {
    let parentLegacy = null;
    if (t.department) parentLegacy = { collection: 'Department', id: t.department };
    else if (t.division) parentLegacy = { collection: 'Division', id: t.division };
    await mark('team', 'Team', t, parentLegacy);
  }
  return { created };
}

module.exports = {
  dualWriteEnabled,
  dualWriteCreateLegacy,
  dualWriteCreateOu,
  findOuByLegacyRef,
  syncMissingLegacyToOu,
  dualWriteSyncOuActive,
  dualWriteSoftDeleteOu,
};
