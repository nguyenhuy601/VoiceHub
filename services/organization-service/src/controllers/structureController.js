/**
 * Huy: API Dynamic Organizational Structure — levels, units, templates, membership.
 */
const { resolveOrgAccess } = require('../utils/orgAccess');
const { orgUnauthorized, orgAccessDenied, orgFail, orgCatch } = require('../utils/orgApiError');
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
  sanitizeUnitAttributes,
} = require('../services/orgUnitTree.service');
const {
  backfillOrganizationToOu,
  applyStructureTemplate,
} = require('../services/orgStructureMigrate.service');
const { listOrgStructureTemplates, UNIT_KIND_CATALOG } = require('../config/orgStructureTemplates');
const OrgUnitMembership = require('../models/OrgUnitMembership');
const OrganizationalUnit = require('../models/OrganizationalUnit');
const { ensureOuRole } = require('../services/hierarchyRoleSync');
const { toPlainId, assertActiveOrgMembers, MAX_MEMBER_IDS } = require('../utils/orgMemberIds');
const { assertTextLimits } = require('../utils/orgTextLimits');

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
    if (error.statusCode) return orgCatch(res, error);
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
    assertTextLimits({ name: body.name, description: body.description, code: body.unitKind });
    if (body.levelKey !== undefined && typeof body.levelKey !== 'string') {
      return orgFail(res, 400, 'levelKey không hợp lệ.', 'ORG_LEVEL_INVALID');
    }
    const doc = await createUnit({
      organizationId: ctx.orgId,
      parentUnitId: toPlainId(body.parentUnitId),
      levelKey: body.levelKey,
      name: body.name,
      description: body.description,
      unitKind: body.unitKind,
      attributes: await sanitizeUnitAttributes(ctx.orgId, body.attributes),
    });
    // Huy: P5 dual-write legacy collections khi levelKey khớp
    const { dualWriteCreateLegacy } = require('../services/orgOuDualWrite.service');
    await dualWriteCreateLegacy(ctx.orgId, doc);
    // Huy: sync RBAC role cho OU
    await ensureOuRole(ctx.orgId, doc._id, doc.name, doc.levelKey).catch(() => null);
    await bump(ctx.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    if (error.statusCode) return orgCatch(res, error);
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
      await moveUnit(ctx.orgId, unitId, toPlainId(body.parentUnitId));
    }
    const doc = await updateUnit(ctx.orgId, unitId, body);
    await ensureOuRole(ctx.orgId, doc._id, doc.name, doc.levelKey).catch(() => null);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    if (error.statusCode) return orgCatch(res, error);
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
    if (error.statusCode) return orgCatch(res, error);
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
    if (error.statusCode) return orgCatch(res, error);
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
    if (members.length > MAX_MEMBER_IDS) {
      return orgFail(res, 400, `Tối đa ${MAX_MEMBER_IDS} thành viên mỗi lần cập nhật.`, 'ORG_BATCH_TOO_LARGE');
    }
    const primaryUserId = toPlainId(req.body?.primaryUserId);

    const seen = new Set();
    const docs = [];
    members.forEach((m) => {
      const isObjectEntry = m !== null && typeof m === 'object';
      const userId = toPlainId(isObjectEntry ? m.userId : m);
      // Object `{ $ne: null }` has no userId string. Skipping it used to fall through
      // to deleteMany and wipe the unit. Reject before any write.
      if (!userId) {
        const err = new Error('Mã định danh không hợp lệ.');
        err.statusCode = 400;
        err.errorCode = 'ORG_INVALID_ID';
        throw err;
      }
      if (seen.has(userId)) return;
      seen.add(userId);
      const roleInUnit = isObjectEntry && m.roleInUnit !== undefined ? m.roleInUnit : 'member';
      assertTextLimits({ code: roleInUnit });
      docs.push({
        organization: ctx.orgId,
        userId,
        unitId,
        roleInUnit: roleInUnit || 'member',
        isPrimary: primaryUserId ? userId === primaryUserId : Boolean(isObjectEntry && m.isPrimary),
      });
    });

    const existingIds = new Set(
      (await OrgUnitMembership.distinct('userId', { organization: ctx.orgId, unitId })).map((id) =>
        String(id).toLowerCase()
      )
    );
    await assertActiveOrgMembers(
      ctx.orgId,
      docs.map((d) => d.userId).filter((id) => !existingIds.has(id))
    );

    await OrgUnitMembership.deleteMany({ organization: ctx.orgId, unitId });
    if (docs.length) await OrgUnitMembership.insertMany(docs);
    await bump(ctx.orgId);
    return res.json({ status: 'success', data: { count: docs.length } });
  } catch (error) {
    if (error.statusCode) return orgCatch(res, error);
    return next(error);
  }
};
