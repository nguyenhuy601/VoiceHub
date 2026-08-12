/**
 * Huy: API Dynamic Organizational Structure — levels, units, templates, membership.
 */
const { resolveOrgAccess } = require('../utils/orgAccess');
const { orgUnauthorized, orgAccessDenied, orgFail } = require('../utils/orgApiError');
const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const {
  getLevelsForApi,
  replaceLevels,
  createUnit,
  updateUnit,
  moveUnit,
  softDeleteUnit,
  listUnitsTree,
} = require('../services/orgUnitTree.service');
const {
  backfillOrganizationToOu,
  applyStructureTemplate,
} = require('../services/orgStructureMigrate.service');
const { listOrgStructureTemplates, UNIT_KIND_CATALOG } = require('../config/orgStructureTemplates');
const OrgUnitMembership = require('../models/OrgUnitMembership');
const OrganizationalUnit = require('../models/OrganizationalUnit');
const { ensureOuRole } = require('../services/hierarchyRoleSync');

const bump = (orgId) =>
  invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(() => null);

function getUserId(req) {
  return String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
}

async function requireOrgAdmin(req, res) {
  const userId = getUserId(req);
  const orgId = req.params.orgId;
  if (!userId) {
    orgUnauthorized(res);
    return null;
  }
  const access = await resolveOrgAccess(userId, orgId);
  if (!access.ok) {
    orgAccessDenied(res);
    return null;
  }
  const role = String(access.membership?.role || '').toLowerCase();
  const systemRole = String(req.user?.systemRole || '').toLowerCase();
  if (systemRole !== 'admin' && !['owner', 'admin'].includes(role)) {
    orgAccessDenied(res);
    return null;
  }
  return { userId, orgId, access };
}

exports.listTemplates = async (req, res) => {
  return res.json({
    status: 'success',
    data: { templates: listOrgStructureTemplates(), unitKinds: UNIT_KIND_CATALOG },
  });
};

exports.getLevels = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const schema = await getLevelsForApi(ctx.orgId);
    return res.json({ status: 'success', data: schema });
  } catch (error) {
    return next(error);
  }
};

exports.putLevels = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const levels = req.body?.levels;
    const templateId = req.body?.templateId;
    const doc = await replaceLevels(ctx.orgId, levels, templateId);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    if (error.statusCode) return orgFail(res, error.statusCode, error.message, error.errorCode);
    return next(error);
  }
};

exports.listUnits = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const includeInactive = String(req.query?.includeInactive || '') === '1';
    const tree = await listUnitsTree(ctx.orgId, { includeInactive });
    return res.json({ status: 'success', data: { unitsTree: tree } });
  } catch (error) {
    return next(error);
  }
};

exports.createUnitHandler = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const body = req.body || {};
    const doc = await createUnit({
      organizationId: ctx.orgId,
      parentUnitId: body.parentUnitId || null,
      levelKey: body.levelKey,
      name: body.name,
      description: body.description,
      unitKind: body.unitKind,
      attributes: body.attributes || {},
    });
    // Huy: P5 dual-write legacy collections khi levelKey khớp
    const { dualWriteCreateLegacy } = require('../services/orgOuDualWrite.service');
    await dualWriteCreateLegacy(ctx.orgId, doc);
    // Huy: sync RBAC role cho OU
    await ensureOuRole(ctx.orgId, doc._id, doc.name, doc.levelKey).catch(() => null);
    await bump(ctx.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    if (error.statusCode) return orgFail(res, error.statusCode, error.message, error.errorCode);
    return next(error);
  }
};

exports.updateUnitHandler = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const unitId = req.params.unitId;
    const body = req.body || {};
    if (body.parentUnitId !== undefined) {
      await moveUnit(ctx.orgId, unitId, body.parentUnitId || null);
    }
    const doc = await updateUnit(ctx.orgId, unitId, body);
    await ensureOuRole(ctx.orgId, doc._id, doc.name, doc.levelKey).catch(() => null);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    if (error.statusCode) return orgFail(res, error.statusCode, error.message, error.errorCode);
    return next(error);
  }
};

exports.deleteUnitHandler = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const doc = await softDeleteUnit(ctx.orgId, req.params.unitId);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    if (error.statusCode) return orgFail(res, error.statusCode, error.message, error.errorCode);
    return next(error);
  }
};

exports.applyTemplate = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const templateId = req.body?.templateId;
    const mode = req.body?.mode || 'merge';
    const result = await applyStructureTemplate(ctx.orgId, templateId, { mode });
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.statusCode) return orgFail(res, error.statusCode, error.message, error.errorCode);
    return next(error);
  }
};

exports.backfill = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const result = await backfillOrganizationToOu(ctx.orgId);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: result });
  } catch (error) {
    return next(error);
  }
};

/** Huy: Matrix membership — list / set members của một OU */
exports.listUnitMembers = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const rows = await OrgUnitMembership.find({
      organization: ctx.orgId,
      unitId: req.params.unitId,
    }).lean();
    return res.json({ status: 'success', data: rows });
  } catch (error) {
    return next(error);
  }
};

exports.setUnitMembers = async (req, res, next) => {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const unitId = req.params.unitId;
    const unit = await OrganizationalUnit.findOne({ _id: unitId, organization: ctx.orgId }).lean();
    if (!unit) return orgFail(res, 404, 'Unit not found', 'ORG_UNIT_NOT_FOUND');

    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    const primaryUserId = req.body?.primaryUserId
      ? String(req.body.primaryUserId)
      : null;

    await OrgUnitMembership.deleteMany({ organization: ctx.orgId, unitId });
    const docs = members
      .map((m) => {
        const userId = typeof m === 'string' ? m : m?.userId;
        if (!userId) return null;
        return {
          organization: ctx.orgId,
          userId,
          unitId,
          roleInUnit: (typeof m === 'object' && m.roleInUnit) || 'member',
          isPrimary: primaryUserId ? String(userId) === primaryUserId : Boolean(m?.isPrimary),
        };
      })
      .filter(Boolean);
    if (docs.length) await OrgUnitMembership.insertMany(docs);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: { count: docs.length } });
  } catch (error) {
    return next(error);
  }
};
