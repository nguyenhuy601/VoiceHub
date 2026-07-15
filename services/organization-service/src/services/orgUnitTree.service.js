/**
 * Huy: Validate / build / move Organizational Unit tree (dynamic hierarchy).
 */
const OrganizationalUnit = require('../models/OrganizationalUnit');
const OrgLevelSchema = require('../models/OrgLevelSchema');
const { cloneLevels, getOrgStructureTemplate } = require('../config/orgStructureTemplates');

const MAX_DEPTH = 8;
const MAX_UNITS_PER_ORG = 500;

function isDynamicStructureEnabled() {
  const v = String(process.env.ORG_DYNAMIC_STRUCTURE || 'true').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

function levelOrderMap(levels) {
  const map = new Map();
  for (const l of levels || []) {
    if (l.enabled === false) continue;
    map.set(String(l.key), Number(l.order) || 0);
  }
  return map;
}

/** Huy: Doc đã setup (flag hoặc grandfather có levels). */
function isStructureSetupCompleted(doc) {
  if (!doc) return false;
  if (doc.setupCompletedAt) return true;
  return Array.isArray(doc.levels) && doc.levels.length > 0;
}

async function findLevelSchema(organizationId) {
  return OrgLevelSchema.findOne({ organization: organizationId });
}

/**
 * Huy: Backfill/migrate nội bộ — tạo schema kèm setupCompletedAt.
 * Không dùng cho GET public (tránh ép enterprise-compat trước khi admin setup).
 */
async function getOrCreateLevelSchema(organizationId, templateId = 'enterprise-compat') {
  let doc = await OrgLevelSchema.findOne({ organization: organizationId });
  if (doc) {
    if (!doc.setupCompletedAt && Array.isArray(doc.levels) && doc.levels.length > 0) {
      doc.setupCompletedAt = doc.updatedAt || new Date();
      await doc.save();
    }
    return doc;
  }
  const tpl = getOrgStructureTemplate(templateId) || getOrgStructureTemplate('enterprise-compat');
  doc = await OrgLevelSchema.create({
    organization: organizationId,
    levels: cloneLevels(tpl.levels),
    templateId: tpl.id,
    setupCompletedAt: new Date(),
  });
  return doc;
}

/**
 * Huy: Payload GET levels — không auto-create; lazy grandfather setupCompletedAt.
 */
async function getLevelsForApi(organizationId) {
  let doc = await findLevelSchema(organizationId);
  if (!doc) {
    return {
      organization: organizationId,
      levels: [],
      templateId: null,
      setupCompleted: false,
      setupCompletedAt: null,
    };
  }
  if (!doc.setupCompletedAt && Array.isArray(doc.levels) && doc.levels.length > 0) {
    doc.setupCompletedAt = doc.updatedAt || new Date();
    await doc.save();
  }
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    ...plain,
    setupCompleted: Boolean(doc.setupCompletedAt),
  };
}

async function assertCanCreateChild({ organizationId, parentUnitId, levelKey }) {
  const schema = await findLevelSchema(organizationId);
  if (!schema || !isStructureSetupCompleted(schema)) {
    const err = new Error('Chưa thiết lập cơ cấu tổ chức — hoàn tất setup trước khi tạo đơn vị');
    err.statusCode = 400;
    err.errorCode = 'ORG_STRUCTURE_NOT_SETUP';
    throw err;
  }
  const orders = levelOrderMap(schema.levels);
  if (!orders.has(levelKey)) {
    const err = new Error(`levelKey "${levelKey}" không có trong schema hoặc đã tắt`);
    err.statusCode = 400;
    err.errorCode = 'ORG_LEVEL_INVALID';
    throw err;
  }
  const childOrder = orders.get(levelKey);
  if (!parentUnitId) {
    return { schema, parent: null, depth: 0 };
  }
  const parent = await OrganizationalUnit.findOne({
    _id: parentUnitId,
    organization: organizationId,
    'attributes.isActive': { $ne: false },
  }).lean();
  if (!parent) {
    const err = new Error('Parent unit not found');
    err.statusCode = 404;
    err.errorCode = 'ORG_UNIT_NOT_FOUND';
    throw err;
  }
  const parentOrder = orders.get(parent.levelKey);
  if (parentOrder == null || childOrder < parentOrder) {
    const err = new Error('Child level phải có order >= parent level');
    err.statusCode = 400;
    err.errorCode = 'ORG_LEVEL_ORDER';
    throw err;
  }
  const depth = Number(parent.depth || 0) + 1;
  if (depth > MAX_DEPTH) {
    const err = new Error(`Vượt giới hạn depth ${MAX_DEPTH}`);
    err.statusCode = 400;
    err.errorCode = 'ORG_DEPTH_LIMIT';
    throw err;
  }
  return { schema, parent, depth };
}

function buildPath(parentPath, unitId) {
  const id = String(unitId);
  if (!parentPath) return `/${id}`;
  return `${String(parentPath).replace(/\/$/, '')}/${id}`;
}

async function createUnit({
  organizationId,
  parentUnitId = null,
  levelKey,
  name,
  description = '',
  unitKind = 'custom',
  attributes = {},
  legacyRef = null,
}) {
  const count = await OrganizationalUnit.countDocuments({ organization: organizationId });
  if (count >= MAX_UNITS_PER_ORG) {
    const err = new Error(`Vượt giới hạn ${MAX_UNITS_PER_ORG} OU / org`);
    err.statusCode = 400;
    err.errorCode = 'ORG_UNIT_LIMIT';
    throw err;
  }
  const { parent, depth } = await assertCanCreateChild({
    organizationId,
    parentUnitId,
    levelKey: String(levelKey).trim(),
  });

  const doc = new OrganizationalUnit({
    organization: organizationId,
    parentUnitId: parent?._id || null,
    levelKey: String(levelKey).trim(),
    unitKind: String(unitKind || 'custom').trim(),
    name: String(name || '').trim() || 'Unit',
    description: String(description || '').trim(),
    attributes: {
      location: attributes.location || '',
      headUserId: attributes.headUserId || null,
      leaderUserId: attributes.leaderUserId || null,
      isDefault: Boolean(attributes.isDefault),
      isActive: attributes.isActive !== false,
    },
    path: '',
    depth,
    legacyRef: legacyRef || { collection: null, id: null },
  });
  await doc.save();
  doc.path = buildPath(parent?.path || '', doc._id);
  await doc.save();
  return doc;
}

async function updateUnit(organizationId, unitId, patch = {}) {
  const doc = await OrganizationalUnit.findOne({ _id: unitId, organization: organizationId });
  if (!doc) {
    const err = new Error('Unit not found');
    err.statusCode = 404;
    err.errorCode = 'ORG_UNIT_NOT_FOUND';
    throw err;
  }
  if (patch.name !== undefined) doc.name = String(patch.name).trim() || doc.name;
  if (patch.description !== undefined) doc.description = String(patch.description || '').trim();
  if (patch.unitKind !== undefined) doc.unitKind = String(patch.unitKind || 'custom').trim();
  if (patch.levelKey !== undefined) {
    await assertCanCreateChild({
      organizationId,
      parentUnitId: doc.parentUnitId,
      levelKey: String(patch.levelKey).trim(),
    });
    doc.levelKey = String(patch.levelKey).trim();
  }
  if (patch.attributes && typeof patch.attributes === 'object') {
    doc.attributes = { ...(doc.attributes?.toObject?.() || doc.attributes || {}), ...patch.attributes };
  }
  await doc.save();
  return doc;
}

async function moveUnit(organizationId, unitId, newParentUnitId) {
  const doc = await OrganizationalUnit.findOne({ _id: unitId, organization: organizationId });
  if (!doc) {
    const err = new Error('Unit not found');
    err.statusCode = 404;
    throw err;
  }
  if (newParentUnitId && String(newParentUnitId) === String(unitId)) {
    const err = new Error('Không thể đặt parent = chính nó');
    err.statusCode = 400;
    throw err;
  }
  const { parent, depth } = await assertCanCreateChild({
    organizationId,
    parentUnitId: newParentUnitId || null,
    levelKey: doc.levelKey,
  });
  if (parent && String(parent.path || '').includes(`/${unitId}`)) {
    const err = new Error('Cycle: parent nằm trong subtree');
    err.statusCode = 400;
    err.errorCode = 'ORG_CYCLE';
    throw err;
  }
  const oldPath = doc.path;
  doc.parentUnitId = parent?._id || null;
  doc.depth = depth;
  doc.path = buildPath(parent?.path || '', doc._id);
  await doc.save();

  const descendants = await OrganizationalUnit.find({
    organization: organizationId,
    path: new RegExp(`^${escapeRegex(oldPath)}/`),
  });
  for (const child of descendants) {
    const suffix = String(child.path).slice(oldPath.length);
    child.path = `${doc.path}${suffix}`;
    child.depth = String(child.path).split('/').filter(Boolean).length - 1;
    await child.save();
  }
  return doc;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function softDeleteUnit(organizationId, unitId) {
  const doc = await OrganizationalUnit.findOneAndUpdate(
    { _id: unitId, organization: organizationId },
    { $set: { 'attributes.isActive': false } },
    { new: true }
  );
  if (!doc) {
    const err = new Error('Unit not found');
    err.statusCode = 404;
    throw err;
  }
  await OrganizationalUnit.updateMany(
    { organization: organizationId, path: new RegExp(`^${escapeRegex(doc.path)}/`) },
    { $set: { 'attributes.isActive': false } }
  );
  return doc;
}

function nestUnits(flat) {
  const byId = new Map();
  for (const u of flat) {
    byId.set(String(u._id), { ...u, children: [] });
  }
  const roots = [];
  for (const u of byId.values()) {
    const pid = u.parentUnitId ? String(u.parentUnitId) : '';
    if (pid && byId.has(pid)) {
      byId.get(pid).children.push(u);
    } else {
      roots.push(u);
    }
  }
  return roots;
}

async function listUnitsTree(organizationId, { includeInactive = false } = {}) {
  const filter = { organization: organizationId };
  if (!includeInactive) filter['attributes.isActive'] = { $ne: false };
  const rows = await OrganizationalUnit.find(filter).sort({ depth: 1, createdAt: 1 }).lean();
  return nestUnits(rows);
}

/**
 * Huy: Project OU tree → legacy branches[] shape (dual-read cho client cũ).
 */
function asLegacyNode(u) {
  // Huy: ưu tiên legacyRef.id để FE updateDivision/Branch khớp Mongo legacy (tránh trùng OU+_id vs Division._id)
  const legacyId = u.legacyRef?.id || null;
  const publicId = legacyId || u._id;
  return {
    _id: publicId,
    id: String(publicId),
    ouId: String(u._id),
    name: u.name,
    description: u.description || '',
    organization: u.organization,
    isActive: u.attributes?.isActive !== false,
    isDefault: Boolean(u.attributes?.isDefault),
    location: u.attributes?.location || '',
    head: u.attributes?.headUserId || null,
    leader: u.attributes?.leaderUserId || null,
    levelKey: u.levelKey,
    unitKind: u.unitKind,
    path: u.path,
    depth: u.depth,
    channels: [],
  };
}

function mapDeptNode(dep) {
  return {
    ...asLegacyNode(dep),
    teams: (dep.children || []).map((t) => asLegacyNode(t)),
  };
}

function mapDivisionNode(div) {
  return {
    ...asLegacyNode(div),
    departments: (div.children || []).map(mapDeptNode),
  };
}

function projectOuTreeToLegacyBranches(unitsTree) {
  const clean = [];
  for (const root of unitsTree || []) {
    if (root.levelKey === 'branch') {
      clean.push({
        ...asLegacyNode(root),
        divisions: (root.children || []).map(mapDivisionNode),
      });
      continue;
    }
    // Huy: schema không có branch — bọc synthetic branch
    clean.push({
      _id: root._id,
      id: String(root._id),
      name: 'Organization',
      location: '',
      isActive: true,
      isDefault: true,
      isSynthetic: true,
      channels: [],
      divisions: [
        {
          ...asLegacyNode(root),
          departments: flattenAsDepartments(root),
        },
      ],
    });
  }
  return clean;
}

function flattenAsDepartments(root) {
  const kids = root.children || [];
  if (!kids.length) {
    if (root.levelKey === 'team') return [];
    if (root.levelKey === 'division' || root.levelKey === 'branch') return [];
    return [{ ...asLegacyNode(root), teams: [] }];
  }
  return kids.map((c) => {
    if (c.levelKey === 'team') {
      return {
        ...asLegacyNode(c),
        name: `${c.name} (dept)`,
        teams: [asLegacyNode(c)],
      };
    }
    return mapDeptNode(c);
  });
}

async function replaceLevels(organizationId, levels, templateId) {
  const existing = await findLevelSchema(organizationId);
  if (existing && isStructureSetupCompleted(existing)) {
    const err = new Error('Cơ cấu tổ chức đã được thiết lập — không thể đổi template/levels');
    err.statusCode = 409;
    err.errorCode = 'ORG_STRUCTURE_SETUP_LOCKED';
    throw err;
  }

  const cleaned = cloneLevels(levels);
  if (!cleaned.length) {
    const err = new Error('Cần ít nhất một level');
    err.statusCode = 400;
    throw err;
  }
  const keys = new Set(cleaned.map((l) => l.key));
  const inUse = await OrganizationalUnit.distinct('levelKey', {
    organization: organizationId,
    'attributes.isActive': { $ne: false },
  });
  for (const key of inUse) {
    if (!keys.has(key)) {
      const err = new Error(`Không thể xóa level "${key}" — còn OU đang dùng`);
      err.statusCode = 400;
      err.errorCode = 'ORG_LEVEL_IN_USE';
      throw err;
    }
  }
  const now = new Date();
  const doc = await OrgLevelSchema.findOneAndUpdate(
    { organization: organizationId },
    {
      $set: {
        levels: cleaned,
        ...(templateId ? { templateId: String(templateId) } : {}),
        setupCompletedAt: now,
      },
    },
    { upsert: true, new: true }
  );
  return doc;
}

module.exports = {
  MAX_DEPTH,
  MAX_UNITS_PER_ORG,
  isDynamicStructureEnabled,
  isStructureSetupCompleted,
  findLevelSchema,
  getLevelsForApi,
  getOrCreateLevelSchema,
  assertCanCreateChild,
  createUnit,
  updateUnit,
  moveUnit,
  softDeleteUnit,
  listUnitsTree,
  projectOuTreeToLegacyBranches,
  replaceLevels,
  nestUnits,
};
