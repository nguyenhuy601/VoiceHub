const EmployeeCodeCounter = require('../models/EmployeeCodeCounter');
const CompanyInvite = require('../models/CompanyInvite');
const {
  findTakenEmployeeCodes,
  fetchMaxEmployeeCodeSeq,
} = require('../clients/employeeCodeLookup.client');
const { logger } = require('@enterprise/shared');
const {
  DEFAULT_PREFIX,
  formatEmployeeCode,
  parseSeqFromCode,
  canonicalizeEmployeeCode,
} = require('../utils/employeeCodePolicy');

async function maxSeqFromInvites(organizationId, prefix = DEFAULT_PREFIX) {
  const rows = await CompanyInvite.find({
    organization: organizationId,
    employeeCode: { $exists: true, $nin: [null, ''] },
  })
    .select('employeeCode')
    .lean();
  let max = 0;
  for (const r of rows) {
    const n = parseSeqFromCode(r.employeeCode, prefix);
    if (n != null && n > max) max = n;
  }
  return max;
}

/**
 * nextSeq trong DB = số ĐÃ CẤP gần nhất (last issued).
 * $inc → mã mới = last+1.
 * Floor = max(invite codes, profile codes) — cùng sequence mời + Excel.
 */
async function ensureCounterBootstrapped(organizationId, prefix = DEFAULT_PREFIX) {
  const p = String(prefix || DEFAULT_PREFIX).toUpperCase();
  const [inviteMax, profileMax] = await Promise.all([
    maxSeqFromInvites(organizationId, p),
    fetchMaxEmployeeCodeSeq(p),
  ]);
  const floor = Math.max(inviteMax, profileMax, 0);

  const doc = await EmployeeCodeCounter.findOneAndUpdate(
    { organization: organizationId },
    { $setOnInsert: { nextSeq: floor } },
    { upsert: true, new: true }
  );

  if (doc && Number(doc.nextSeq) < floor) {
    await EmployeeCodeCounter.updateOne(
      { organization: organizationId },
      { $set: { nextSeq: floor } }
    );
  }
}

async function findPendingInviteCodes(organizationId, codes) {
  const list = (Array.isArray(codes) ? codes : [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean);
  if (!list.length) return [];
  const rows = await CompanyInvite.find({
    organization: organizationId,
    status: 'pending',
    employeeCode: { $in: list },
  })
    .select('employeeCode')
    .lean();
  return [
    ...new Set(rows.map((r) => String(r.employeeCode || '').trim().toUpperCase()).filter(Boolean)),
  ];
}

async function isCodeTaken(organizationId, code) {
  const normalized = String(code || '')
    .trim()
    .toUpperCase();
  if (!normalized) return true;

  const pending = await CompanyInvite.exists({
    organization: organizationId,
    status: 'pending',
    employeeCode: normalized,
  });
  if (pending) return true;

  try {
    const taken = await findTakenEmployeeCodes([normalized]);
    return taken.map((c) => String(c).toUpperCase()).includes(normalized);
  } catch (e) {
    logger.warn('[employeeCode] lookup failed, treating as taken to be safe:', e?.message || e);
    return true;
  }
}

/**
 * Cấp mã NV tiếp theo (atomic).
 * @returns {Promise<string>} VD VH-002
 */
async function allocateNextEmployeeCode(organizationId, options = {}) {
  const prefix = String(options.prefix || DEFAULT_PREFIX).toUpperCase();
  await ensureCounterBootstrapped(organizationId, prefix);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const updated = await EmployeeCodeCounter.findOneAndUpdate(
      { organization: organizationId },
      { $inc: { nextSeq: 1 } },
      { new: true }
    );
    const seq = Number(updated?.nextSeq);
    const code = formatEmployeeCode(seq, prefix);
    if (!code) continue;
    // eslint-disable-next-line no-await-in-loop
    const taken = await isCodeTaken(organizationId, code);
    if (!taken) return code;
  }

  const err = new Error('Không cấp được employeeCode (hết retry)');
  err.statusCode = 500;
  err.errorCode = 'EMPLOYEE_CODE_ALLOCATE_FAILED';
  throw err;
}

/**
 * Cấp nhiều mã một lần (Excel blank rows) — bootstrap 1 lần, tránh N lần max-seq S2S.
 * @returns {Promise<string[]>}
 */
async function allocateEmployeeCodesBatch(organizationId, count, options = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n < 1) return [];
  const prefix = String(options.prefix || DEFAULT_PREFIX).toUpperCase();
  await ensureCounterBootstrapped(organizationId, prefix);

  const profileMax = await fetchMaxEmployeeCodeSeq(prefix);
  const codes = [];
  const reserved = new Set();

  for (let attempt = 0; codes.length < n && attempt < n + 100; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const updated = await EmployeeCodeCounter.findOneAndUpdate(
      { organization: organizationId },
      { $inc: { nextSeq: 1 } },
      { new: true }
    );
    const seq = Number(updated?.nextSeq);
    const code = formatEmployeeCode(seq, prefix);
    if (!code || reserved.has(code)) continue;

    // Seq mới hơn max profile đã biết → coi là trống (tránh S2S từng mã).
    if (seq > profileMax) {
      codes.push(code);
      reserved.add(code);
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const taken = await isCodeTaken(organizationId, code);
    if (!taken) {
      codes.push(code);
      reserved.add(code);
    }
  }

  if (codes.length < n) {
    const err = new Error('Không cấp đủ employeeCode cho batch Excel');
    err.statusCode = 500;
    err.errorCode = 'EMPLOYEE_CODE_ALLOCATE_FAILED';
    throw err;
  }
  return codes;
}

/** Xem trước mã sắp cấp (không $inc). */
async function peekNextEmployeeCode(organizationId, options = {}) {
  const prefix = String(options.prefix || DEFAULT_PREFIX).toUpperCase();
  await ensureCounterBootstrapped(organizationId, prefix);
  const doc = await EmployeeCodeCounter.findOne({ organization: organizationId }).lean();
  const last = Number(doc?.nextSeq) || 0;

  for (let i = 1; i <= 40; i += 1) {
    const code = formatEmployeeCode(last + i, prefix);
    // eslint-disable-next-line no-await-in-loop
    const taken = await isCodeTaken(organizationId, code);
    if (!taken) return code;
  }
  return formatEmployeeCode(last + 1, prefix);
}

/** Đẩy counter ≥ max seq đã dùng (Excel mã tường minh / sau batch allocate). */
async function bumpCounterToAtLeast(organizationId, codes, options = {}) {
  const prefix = String(options.prefix || DEFAULT_PREFIX).toUpperCase();
  let max = 0;
  for (const c of codes || []) {
    const n = parseSeqFromCode(c, prefix);
    if (n != null && n > max) max = n;
  }
  if (max < 1) return;

  await ensureCounterBootstrapped(organizationId, prefix);
  const doc = await EmployeeCodeCounter.findOne({ organization: organizationId }).lean();
  const current = Number(doc?.nextSeq) || 0;
  if (current >= max) return;

  await EmployeeCodeCounter.updateOne(
    { organization: organizationId },
    { $set: { nextSeq: max } },
    { upsert: true }
  );
}

module.exports = {
  formatEmployeeCode,
  parseSeqFromCode,
  canonicalizeEmployeeCode,
  allocateNextEmployeeCode,
  allocateEmployeeCodesBatch,
  peekNextEmployeeCode,
  findPendingInviteCodes,
  bumpCounterToAtLeast,
  maxSeqFromInvites,
  DEFAULT_PREFIX,
};
