const mongoose = require('mongoose');
const SkillRegistry = require('../models/SkillRegistry');
const {
  SKILL_REGISTRY_SEED_NAMES,
  SKILL_PARENT_HINTS,
} = require('../constants/skillRegistrySeed');
const { normalizeKey, normalizeSkillInput, titleCaseSkill } = require('../utils/skillNormalize');

function toObjectId(value) {
  const s = String(value || '').trim();
  if (!s || !mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function serializeSkill(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    skillId: String(row._id),
    organizationId: String(row.organizationId),
    name: row.name,
    normalizedName: row.normalizedName,
    category: row.category || '',
    aliases: row.aliases || [],
    relatedSkillIds: (row.relatedSkillIds || []).map(String),
    parentSkillId: row.parentSkillId ? String(row.parentSkillId) : null,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findByNormalizedName(organizationId, normalizedName) {
  const orgOid = toObjectId(organizationId);
  if (!orgOid || !normalizedName) return null;
  const direct = await SkillRegistry.findOne({
    organizationId: orgOid,
    normalizedName,
  });
  if (direct) return direct;
  return SkillRegistry.findOne({
    organizationId: orgOid,
    aliases: normalizedName,
  });
}

async function ensureOrgSeeded(organizationId) {
  const orgOid = toObjectId(organizationId);
  if (!orgOid) return { seeded: 0 };
  const existing = await SkillRegistry.countDocuments({ organizationId: orgOid });
  if (existing > 0) return { seeded: 0, skipped: true };

  const docs = SKILL_REGISTRY_SEED_NAMES.map((name) => ({
    organizationId: orgOid,
    name,
    normalizedName: normalizeKey(name),
    status: 'ACTIVE',
    source: 'Admin',
    category: inferCategory(name),
  }));
  await SkillRegistry.insertMany(docs, { ordered: false }).catch(() => {});
  await linkParentSkills(orgOid);
  return { seeded: docs.length };
}

function inferCategory(name) {
  const n = normalizeKey(name);
  if (['postgresql', 'mysql', 'mongodb', 'redis', 'graphql'].includes(n)) return 'Database';
  if (['docker', 'kubernetes', 'aws', 'linux', 'ci/cd'].includes(n)) return 'DevOps';
  if (['selenium', 'playwright', 'jest', 'cypress', 'manual testing', 'api testing'].includes(n)) {
    return 'QA';
  }
  if (['figma', 'jira', 'agile/scrum', 'requirement analysis'].includes(n)) return 'Process';
  if (['javascript', 'typescript', 'react', 'vue', 'node.js', 'express', 'nestjs'].includes(n)) {
    return 'Frontend';
  }
  if (['java', 'spring', 'python', 'django', 'go', 'c#', '.net', 'php', 'laravel'].includes(n)) {
    return 'Backend';
  }
  return 'General';
}

async function linkParentSkills(organizationId) {
  const rows = await SkillRegistry.find({ organizationId }).lean();
  const byNorm = new Map(rows.map((r) => [r.normalizedName, r]));
  for (const row of rows) {
    const parentNorm = SKILL_PARENT_HINTS[row.normalizedName];
    if (!parentNorm) continue;
    const parent = byNorm.get(parentNorm);
    if (!parent) continue;
    await SkillRegistry.updateOne(
      { _id: row._id },
      { $set: { parentSkillId: parent._id }, $addToSet: { relatedSkillIds: parent._id } }
    );
  }
}

/**
 * Resolve raw skill string against org registry; create PENDING when missing.
 * @returns {Promise<{ input: string, skillId: string, name: string, status: string, isNew: boolean, suggestedCanonical: string|null }>}
 */
async function resolveOrCreate(organizationId, rawInput, options = {}) {
  const { allowPending = true, source = 'Import' } = options;
  const input = String(rawInput || '').trim();
  if (!input) {
    return { input: '', skillId: '', name: '', status: 'REJECTED', isNew: false, suggestedCanonical: null };
  }

  await ensureOrgSeeded(organizationId);

  const norm = normalizeSkillInput(input);
  if (!norm.normalizedName) {
    return { input, skillId: '', name: '', status: 'REJECTED', isNew: false, suggestedCanonical: null };
  }

  let existing = await findByNormalizedName(organizationId, norm.normalizedName);
  if (!existing && norm.suggestedCanonical) {
    existing = await findByNormalizedName(organizationId, normalizeKey(norm.suggestedCanonical));
  }
  if (existing) {
    if (existing.status === 'REJECTED') {
      return {
        input,
        skillId: String(existing._id),
        name: existing.name,
        status: existing.status,
        isNew: false,
        suggestedCanonical: existing.name,
      };
    }
    const inputKey = normalizeKey(input);
    if (inputKey !== existing.normalizedName && !(existing.aliases || []).includes(inputKey)) {
      await SkillRegistry.updateOne({ _id: existing._id }, { $addToSet: { aliases: inputKey } });
    }
    return {
      input,
      skillId: String(existing._id),
      name: existing.name,
      status: existing.status,
      isNew: false,
      suggestedCanonical: existing.name,
    };
  }

  if (!allowPending) {
    return { input, skillId: '', name: norm.suggestedCanonical || input, status: 'REJECTED', isNew: true, suggestedCanonical: norm.suggestedCanonical };
  }

  const orgOid = toObjectId(organizationId);
  const name = norm.suggestedCanonical || titleCaseSkill(input);
  const created = await SkillRegistry.create({
    organizationId: orgOid,
    name,
    normalizedName: normalizeKey(name),
    aliases: normalizeKey(input) !== normalizeKey(name) ? [normalizeKey(input)] : [],
    status: 'PENDING',
    source,
    category: inferCategory(name),
  });

  return {
    input,
    skillId: String(created._id),
    name: created.name,
    status: created.status,
    isNew: true,
    suggestedCanonical: created.name,
  };
}

async function resolveBatch(organizationId, rawSkills = [], options = {}) {
  const unique = [...new Set((rawSkills || []).map((s) => String(s || '').trim()).filter(Boolean))];
  const results = [];
  for (const skill of unique) {
    results.push(await resolveOrCreate(organizationId, skill, options));
  }
  const newSkills = results.filter((r) => r.isNew && r.status === 'PENDING');
  return { results, newSkills };
}

async function listSkills(organizationId, { status = '', q = '', page = 1, limit = 50 } = {}) {
  await ensureOrgSeeded(organizationId);
  const orgOid = toObjectId(organizationId);
  const filter = { organizationId: orgOid };
  if (status) filter.status = String(status).toUpperCase();
  if (q) {
    const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { normalizedName: rx }, { aliases: rx }];
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const [rows, total] = await Promise.all([
    SkillRegistry.find(filter)
      .sort({ status: 1, name: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    SkillRegistry.countDocuments(filter),
  ]);
  return {
    items: rows.map(serializeSkill),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

async function getSkillById(organizationId, skillId) {
  const orgOid = toObjectId(organizationId);
  const id = toObjectId(skillId);
  if (!orgOid || !id) return null;
  const row = await SkillRegistry.findOne({ _id: id, organizationId: orgOid });
  return serializeSkill(row);
}

async function reviewSkill(organizationId, skillId, action, payload = {}, reviewerUserId = null) {
  const orgOid = toObjectId(organizationId);
  const id = toObjectId(skillId);
  if (!orgOid || !id) {
    const err = new Error('Skill không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const row = await SkillRegistry.findOne({ _id: id, organizationId: orgOid });
  if (!row) {
    const err = new Error('Skill không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const act = String(action || '').trim().toLowerCase();
  if (act === 'reject') {
    row.status = 'REJECTED';
    row.reviewNote = String(payload.note || '').slice(0, 500);
    row.reviewedBy = toObjectId(reviewerUserId);
    row.reviewedAt = new Date();
    await row.save();
    return serializeSkill(row);
  }

  if (act === 'accept' || act === 'edit') {
    const targetName = String(payload.name || row.name).trim();
    if (!targetName) {
      const err = new Error('Tên skill không hợp lệ');
      err.statusCode = 422;
      throw err;
    }
    const targetNorm = normalizeKey(targetName);
    const conflict = await SkillRegistry.findOne({
      organizationId: orgOid,
      normalizedName: targetNorm,
      _id: { $ne: row._id },
    });
    if (conflict) {
      const inputAlias = normalizeKey(row.name);
      if (inputAlias && inputAlias !== targetNorm) {
        await SkillRegistry.updateOne({ _id: conflict._id }, { $addToSet: { aliases: inputAlias } });
      }
      await SkillRegistry.deleteOne({ _id: row._id });
      return serializeSkill(conflict);
    }
    if (act === 'edit') {
      row.name = targetName;
      row.normalizedName = targetNorm;
      if (payload.category != null) row.category = String(payload.category || '').slice(0, 64);
    }
    row.status = 'ACTIVE';
    row.reviewNote = String(payload.note || '').slice(0, 500);
    row.reviewedBy = toObjectId(reviewerUserId);
    row.reviewedAt = new Date();
    await row.save();
    return serializeSkill(row);
  }

  const err = new Error('action không hợp lệ');
  err.statusCode = 422;
  throw err;
}

async function getSkillsByIds(organizationId, skillIds = []) {
  const orgOid = toObjectId(organizationId);
  const ids = (skillIds || []).map(toObjectId).filter(Boolean);
  if (!orgOid || !ids.length) return [];
  const rows = await SkillRegistry.find({ organizationId: orgOid, _id: { $in: ids } }).lean();
  return rows.map(serializeSkill);
}

module.exports = {
  serializeSkill,
  ensureOrgSeeded,
  seedOrgRegistry: ensureOrgSeeded,
  resolveOrCreate,
  resolveBatch,
  listSkills,
  getSkillById,
  reviewSkill,
  getSkillsByIds,
  inferCategory,
};
