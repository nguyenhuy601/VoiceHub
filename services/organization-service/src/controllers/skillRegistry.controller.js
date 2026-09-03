const {
  listSkills,
  getSkillById,
  reviewSkill,
  resolveBatch,
  seedOrgRegistry,
} = require('../services/skillRegistry.service');
const { orgValidation, orgNotFound } = require('../utils/orgApiError');

function getOrgId(req) {
  return String(req.params.orgId || '').trim();
}

exports.listSkills = async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return orgValidation(res, 'orgId is required');
    const data = await listSkills(orgId, {
      status: req.query.status,
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.getSkill = async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const skill = await getSkillById(orgId, req.params.skillId);
    if (!skill) return orgNotFound(res, 'Skill not found');
    return res.json({ success: true, data: skill });
  } catch (error) {
    return next(error);
  }
};

exports.reviewSkill = async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const action = String(req.body?.action || '').trim();
    const skill = await reviewSkill(orgId, req.params.skillId, action, req.body || {}, req.user?.id);
    return res.json({ success: true, data: skill });
  } catch (error) {
    return next(error);
  }
};

exports.resolveBatchInternal = async (req, res, next) => {
  try {
    const orgId = String(req.params.organizationId || req.params.orgId || '').trim();
    const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
    const data = await resolveBatch(orgId, skills, {
      allowPending: req.body?.allowPending !== false,
      source: req.body?.source || 'Import',
    });
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.seedInternal = async (req, res, next) => {
  try {
    const orgId = String(req.params.organizationId || req.params.orgId || '').trim();
    const data = await seedOrgRegistry(orgId);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.getSkillsByIdsInternal = async (req, res, next) => {
  try {
    const orgId = String(req.params.organizationId || req.params.orgId || '').trim();
    const skillIds = Array.isArray(req.body?.skillIds) ? req.body.skillIds : [];
    const { getSkillsByIds } = require('../services/skillRegistry.service');
    const items = await getSkillsByIds(orgId, skillIds);
    return res.json({ success: true, data: { items } });
  } catch (error) {
    return next(error);
  }
};
