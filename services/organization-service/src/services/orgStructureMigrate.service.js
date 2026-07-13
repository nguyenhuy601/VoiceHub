/**
 * Huy: Backfill Branch/Division/Department/Team → OrganizationalUnit + OrgLevelSchema.
 */
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const OrganizationalUnit = require('../models/OrganizationalUnit');
const OrgLevelSchema = require('../models/OrgLevelSchema');
const { getOrCreateLevelSchema, createUnit } = require('./orgUnitTree.service');
const { getOrgStructureTemplate, cloneLevels } = require('../config/orgStructureTemplates');

async function findByLegacy(organizationId, collection, id) {
  if (!id) return null;
  return OrganizationalUnit.findOne({
    organization: organizationId,
    'legacyRef.collection': collection,
    'legacyRef.id': id,
  }).lean();
}

async function ensureUnitFromLegacy({
  organizationId,
  collection,
  legacyDoc,
  levelKey,
  parentUnitId,
  extraAttrs = {},
}) {
  const existing = await findByLegacy(organizationId, collection, legacyDoc._id);
  if (existing) return existing;

  const doc = await createUnit({
    organizationId,
    parentUnitId,
    levelKey,
    name: legacyDoc.name || levelKey,
    description: legacyDoc.description || '',
    unitKind: 'custom',
    attributes: {
      location: legacyDoc.location || '',
      headUserId: legacyDoc.head || null,
      leaderUserId: legacyDoc.leader || null,
      isDefault: Boolean(legacyDoc.isDefault),
      isActive: legacyDoc.isActive !== false,
      ...extraAttrs,
    },
    legacyRef: { collection, id: legacyDoc._id },
  });
  return doc.toObject ? doc.toObject() : doc;
}

/**
 * Huy: Migrate một org từ 4 collection legacy → OU tree.
 * @returns {{ created: number, skipped: number }}
 */
async function backfillOrganizationToOu(organizationId) {
  await getOrCreateLevelSchema(organizationId, 'enterprise-compat');

  let created = 0;
  let skipped = 0;

  const branches = await Branch.find({ organization: organizationId }).lean();
  const branchOuById = new Map();

  for (const branch of branches) {
    const before = await findByLegacy(organizationId, 'Branch', branch._id);
    const ou = await ensureUnitFromLegacy({
      organizationId,
      collection: 'Branch',
      legacyDoc: branch,
      levelKey: 'branch',
      parentUnitId: null,
    });
    if (before) skipped += 1;
    else created += 1;
    branchOuById.set(String(branch._id), ou);

    const divisions = await Division.find({ organization: organizationId, branch: branch._id }).lean();
    for (const division of divisions) {
      const beforeDiv = await findByLegacy(organizationId, 'Division', division._id);
      const divOu = await ensureUnitFromLegacy({
        organizationId,
        collection: 'Division',
        legacyDoc: division,
        levelKey: 'division',
        parentUnitId: ou._id,
      });
      if (beforeDiv) skipped += 1;
      else created += 1;

      const departments = await Department.find({
        organization: organizationId,
        division: division._id,
      }).lean();
      for (const department of departments) {
        const beforeDep = await findByLegacy(organizationId, 'Department', department._id);
        const depOu = await ensureUnitFromLegacy({
          organizationId,
          collection: 'Department',
          legacyDoc: department,
          levelKey: 'department',
          parentUnitId: divOu._id,
        });
        if (beforeDep) skipped += 1;
        else created += 1;

        const teams = await Team.find({
          organization: organizationId,
          department: department._id,
        }).lean();
        for (const team of teams) {
          const beforeTeam = await findByLegacy(organizationId, 'Team', team._id);
          await ensureUnitFromLegacy({
            organizationId,
            collection: 'Team',
            legacyDoc: team,
            levelKey: 'team',
            parentUnitId: depOu._id,
          });
          if (beforeTeam) skipped += 1;
          else created += 1;
        }
      }
    }
  }

  return { created, skipped, branches: branches.length };
}

/**
 * Huy: Áp template IT — ghi levels + seed OU (chỉ khi org chưa có OU hoặc mode replace-empty).
 */
async function applyStructureTemplate(organizationId, templateId, { mode = 'merge' } = {}) {
  const tpl = getOrgStructureTemplate(templateId);
  if (!tpl) {
    const err = new Error(`Template không tồn tại: ${templateId}`);
    err.statusCode = 400;
    err.errorCode = 'ORG_TEMPLATE_UNKNOWN';
    throw err;
  }

  const existingCount = await OrganizationalUnit.countDocuments({
    organization: organizationId,
    'attributes.isActive': { $ne: false },
  });

  if (mode === 'replace-empty' && existingCount > 0) {
    const err = new Error('Org đã có OU — chỉ áp dụng khi trống (replace-empty)');
    err.statusCode = 409;
    err.errorCode = 'ORG_NOT_EMPTY';
    throw err;
  }

  await OrgLevelSchema.findOneAndUpdate(
    { organization: organizationId },
    { $set: { levels: cloneLevels(tpl.levels), templateId: tpl.id } },
    { upsert: true, new: true }
  );

  if (mode === 'merge' && existingCount > 0 && !tpl.seedUnits?.length) {
    return { templateId: tpl.id, seeded: 0, levels: tpl.levels.length };
  }

  if (existingCount > 0 && mode !== 'force-seed') {
    return { templateId: tpl.id, seeded: 0, levels: tpl.levels.length, skippedSeed: true };
  }

  let seeded = 0;
  async function walk(nodes, parentUnitId) {
    for (const node of nodes || []) {
      const ou = await createUnit({
        organizationId,
        parentUnitId,
        levelKey: node.levelKey,
        name: node.name,
        unitKind: node.unitKind || 'custom',
      });
      seeded += 1;
      if (node.children?.length) {
        await walk(node.children, ou._id);
      }
    }
  }
  await walk(tpl.seedUnits, null);
  return { templateId: tpl.id, seeded, levels: tpl.levels.length };
}

module.exports = {
  backfillOrganizationToOu,
  applyStructureTemplate,
  findByLegacy,
};
