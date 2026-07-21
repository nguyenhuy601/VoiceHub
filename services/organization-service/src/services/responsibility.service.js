const Responsibility = require('../models/Responsibility');
const UserResponsibility = require('../models/UserResponsibility');
const {
  ROLE_KIND,
  DEFAULT_RESPONSIBILITY_KEYS,
  DEFAULT_RESPONSIBILITY_LABELS,
} = require('@enterprise/shared/config/roleTaxonomy');

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

async function listResponsibilities(organizationId) {
  const rows = await Responsibility.find({ organizationId, isActive: true })
    .sort({ key: 1 })
    .lean();
  return rows.map((r) => ({
    ...r,
    kind: ROLE_KIND.RESPONSIBILITY,
    grantsPermission: false,
  }));
}

async function upsertResponsibility({ organizationId, key, label, description }) {
  const k = normalizeKey(key);
  if (!k) {
    const err = new Error('key là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const title = String(label || k).trim() || k;
  const doc = await Responsibility.findOneAndUpdate(
    { organizationId, key: k },
    {
      $set: {
        organizationId,
        key: k,
        label: title,
        description: String(description || '').trim(),
        isActive: true,
      },
    },
    { upsert: true, new: true }
  ).lean();
  return doc;
}

async function patchResponsibility({ organizationId, key, label, description, isActive }) {
  const k = normalizeKey(key);
  const existing = await Responsibility.findOne({ organizationId, key: k });
  if (!existing) {
    const err = new Error('Responsibility không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (label !== undefined) existing.label = String(label || '').trim() || existing.label;
  if (description !== undefined) existing.description = String(description || '').trim();
  if (isActive !== undefined) existing.isActive = Boolean(isActive);
  await existing.save();
  return existing.toObject();
}

async function seedDefaultResponsibilities(organizationId) {
  const out = [];
  for (const key of DEFAULT_RESPONSIBILITY_KEYS) {
    const row = await upsertResponsibility({
      organizationId,
      key,
      label: DEFAULT_RESPONSIBILITY_LABELS[key] || key,
      description: '',
    });
    out.push(row);
  }
  return out;
}

async function setUserResponsibilities({ organizationId, userId, keys }) {
  const uid = String(userId || '').trim();
  if (!uid) {
    const err = new Error('userId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const nextKeys = [...new Set((Array.isArray(keys) ? keys : []).map(normalizeKey).filter(Boolean))];
  await UserResponsibility.deleteMany({ organizationId, userId: uid });
  if (!nextKeys.length) return [];
  const rows = nextKeys.map((responsibilityKey, i) => ({
    organizationId,
    userId: uid,
    responsibilityKey,
    isPrimary: i === 0,
  }));
  await UserResponsibility.insertMany(rows, { ordered: false });
  return UserResponsibility.find({ organizationId, userId: uid }).lean();
}

async function listUserResponsibilities(organizationId, userId) {
  return UserResponsibility.find({ organizationId, userId }).lean();
}

async function listUserIdsByResponsibilityKey(organizationId, key) {
  const k = normalizeKey(key);
  if (!k) return [];
  const rows = await UserResponsibility.find({ organizationId, responsibilityKey: k })
    .select('userId')
    .lean();
  return [...new Set(rows.map((r) => String(r.userId)))];
}

module.exports = {
  normalizeKey,
  listResponsibilities,
  upsertResponsibility,
  patchResponsibility,
  seedDefaultResponsibilities,
  setUserResponsibilities,
  listUserResponsibilities,
  listUserIdsByResponsibilityKey,
  DEFAULT_RESPONSIBILITY_KEYS,
};
