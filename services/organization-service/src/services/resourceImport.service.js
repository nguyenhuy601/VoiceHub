const axios = require('axios');

const { parseExcelToRawRows } = require('../utils/excelImportParse');
const { validateResourceImportRows } = require('../utils/resourceImportValidator');
const { resolveAllowedEmailDomains } = require('../utils/emailDomainPolicy');
const { provisionUserByAdmin } = require('../clients/authProvision.client');
const { bulkUpdateUserProfileFields } = require('../clients/userProfileBulkImport.client');
const { findTakenEmployeeCodes } = require('../clients/employeeCodeLookup.client');
const {
  allocateEmployeeCodesBatch,
  findPendingInviteCodes,
  bumpCounterToAtLeast,
} = require('./employeeCodeAllocate.service');
const { sendProvisionSetPasswordEmail } = require('../clients/authInviteEmail.client');
const { softAssignResponsibilityFromPrimaryDomain } = require('./responsibility.service');
const { runWithConcurrency, chunkArray } = require('../utils/runWithConcurrency');
const { logger } = require('@enterprise/shared');
const Organization = require('../models/Organization');
const ImportBatch = require('../models/ImportBatch');
const Department = require('../models/Department');
const Membership = require('../models/Membership');

const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

const DATA_LIMIT = Math.max(1, Math.min(500, Number(process.env.IMPORT_MAX_ROWS || 200) || 200));
const CHUNK_SIZE = Math.max(1, Math.min(100, Number(process.env.IMPORT_CHUNK_SIZE || 50) || 50));
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.IMPORT_CONCURRENCY || 8) || 8));

function nowMs() {
  return Date.now();
}

function requireEnv(value, name) {
  if (!value) throw new Error(`${name} not configured`);
}

function guessPrimaryDomainFromJobTitle(jobTitle) {
  const jt = String(jobTitle || '').toLowerCase();
  if (!jt) return 'other';
  if (jt.includes('frontend') || jt.includes('front-end') || jt.includes('react') || jt.includes('vue')) {
    return 'fe';
  }
  if (jt.includes('backend') || jt.includes('back-end') || jt.includes('node') || jt.includes('server')) {
    return 'be';
  }
  if (jt.includes('fullstack') || jt.includes('full stack')) return 'fullstack';
  if (jt.includes('mobile') || jt.includes('ios') || jt.includes('android')) return 'mobile';
  if (jt.includes('qa') || jt.includes('tester') || jt.includes('test')) return 'qa';
  if (jt.includes('ba') || jt.includes('business analyst') || jt.includes('analyst')) return 'ba';
  if (jt.includes('devops') || jt.includes('kubernetes') || jt.includes('docker')) return 'devops';
  return 'other';
}

async function deactivateProvisionedAuthUser(userId) {
  if (!AUTH_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) return;
  try {
    await axios.post(
      `${AUTH_SERVICE_URL}/api/auth/internal/deprovision`,
      { userId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN,
        },
        timeout: Number(process.env.AUTH_PROVISION_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
  } catch (e) {
    logger.warn('[resourceImport] deprovision auth failed:', e?.message || e);
  }
}

async function deactivateProvisionedUserProfile(userId) {
  if (!USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) return;
  try {
    await axios.post(
      `${USER_SERVICE_URL}/api/users/internal/profile/${encodeURIComponent(String(userId))}/deactivate`,
      { userId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': USER_SERVICE_INTERNAL_TOKEN || GATEWAY_INTERNAL_TOKEN,
        },
        timeout: Number(process.env.USER_PROFILE_BULK_IMPORT_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
  } catch (e) {
    logger.warn('[resourceImport] deprovision user profile failed:', e?.message || e);
  }
}

async function provisionRow({ row, organizationId, uploadedBy }) {
  const email = row.email;
  const t0 = nowMs();

  const provisionMeta = await provisionUserByAdmin({
    email,
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    systemRole: 'employee',
    resetPassword: true,
    readyForLogin: false,
  });
  const authMs = nowMs() - t0;

  const userId = String(provisionMeta?.userId || '').trim();
  if (!userId) {
    throw Object.assign(new Error('Auth provision did not return userId'), { errorCode: 'PROVISION_FAILED' });
  }

  const primaryDomain = row.primaryDomain || guessPrimaryDomainFromJobTitle(row.jobTitle);
  const skills = (Array.isArray(row.skills) ? row.skills : []).map((s) => String(s)).filter(Boolean);

  const tProfile = nowMs();
  await bulkUpdateUserProfileFields(userId, {
    email: row.email,
    employeeCode: row.employeeCode,
    displayName: row.displayName || row.fullName || '',
    phone: row.phone || '',
    jobTitle: row.jobTitle,
    uploadedBy,
    capability: {
      primaryDomain,
      skills: skills.map((name) => ({ name, level: 3 })),
      yearsExperience: row.yearsExperience,
      availability: 'available',
      summary: '',
    },
    resourceConfig: {
      maxConcurrentProjects: row.maxConcurrentProjects,
    },
  });
  const profileMs = nowMs() - tProfile;

  const roleNormalized = row.orgRole || 'member';

  const tMember = nowMs();
  const membership = await Membership.findOneAndUpdate(
    { user: userId, organization: organizationId },
    {
      user: userId,
      organization: organizationId,
      role: roleNormalized,
      status: 'active',
      source: 'excel_import',
      invitedBy: uploadedBy || null,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  try {
    await softAssignResponsibilityFromPrimaryDomain({
      organizationId,
      userId,
      primaryDomain,
    });
  } catch (respErr) {
    logger.warn('[resourceImport] soft Responsibility assign failed:', respErr?.message || respErr);
  }
  const membershipMs = nowMs() - tMember;

  return {
    userId,
    membershipId: membership?._id,
    pendingActivation: Boolean(provisionMeta?.pendingActivation),
    timings: {
      authMs,
      profileMs,
      membershipMs,
      totalMs: nowMs() - t0,
    },
  };
}

/** Ghi progress cả chunk 1 round-trip (bulkWrite) thay vì N lần updateOne. */
async function persistChunkProgress(batchId, okResults) {
  const list = (okResults || []).filter((r) => r?.ok);
  if (!list.length) return;
  const ops = list.map((result) => ({
    updateOne: {
      filter: { _id: batchId, 'rows.rowNumber': result.rowNumber },
      update: {
        $set: {
          'rows.$.status': 'ok',
          'rows.$.userId': result.userId,
          'rows.$.errorMessage': '',
          'rows.$.emailSent': Boolean(result.emailSent),
          'rows.$.pendingActivation': Boolean(result.pendingActivation),
        },
      },
    },
  }));
  ops.push({
    updateOne: {
      filter: { _id: batchId },
      update: { $inc: { processedRows: list.length } },
    },
  });
  // ordered: cùng 1 document — tránh race positional `$` khi unordered.
  await ImportBatch.bulkWrite(ops, { ordered: true });
}

function avgTiming(chunkResults, key) {
  const nums = (chunkResults || [])
    .map((r) => Number(r?.timings?.[key]))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/**
 * Validate Excel — không ghi user, không allocate VH (tránh đốt sequence lúc Preview).
 * @returns {{ ok: true, normalizedRows, deptMap } | { ok: false, details, errorCode }}
 */
async function validateExcelForPreview({ organizationId, fileBuffer }) {
  const organization = await Organization.findById(organizationId)
    .select('name settings.allowedEmailDomains')
    .lean();
  if (!organization) {
    return {
      ok: false,
      errorCode: 'ORG_NOT_FOUND',
      details: [{ rowNumber: 0, message: 'Organization not found' }],
    };
  }

  const allowedEmailDomains = resolveAllowedEmailDomains(organization);
  let normalizedRowsRaw;
  try {
    normalizedRowsRaw = parseExcelToRawRows(fileBuffer);
  } catch (e) {
    return {
      ok: false,
      errorCode: e.errorCode || 'VALIDATION_REQUIRED',
      details: e.details || [{ rowNumber: 0, message: e.message || 'Parse failed' }],
    };
  }

  const validation = validateResourceImportRows(normalizedRowsRaw, { allowedEmailDomains });
  if (!validation.ok) {
    return {
      ok: false,
      errorCode: validation.errorCode || 'VALIDATION_ERROR',
      details: validation.details || [],
    };
  }

  const explicitCodes = validation.normalizedRows.map((r) => r.employeeCode).filter(Boolean);
  const [takenOnProfile, takenOnInvite] = await Promise.all([
    findTakenEmployeeCodes(explicitCodes),
    findPendingInviteCodes(organizationId, explicitCodes),
  ]);
  const takenSet = new Set(
    [...takenOnProfile, ...takenOnInvite].map((c) => String(c || '').trim().toUpperCase())
  );
  if (takenSet.size) {
    const details = validation.normalizedRows
      .filter((r) => takenSet.has(String(r.employeeCode || '').toUpperCase()))
      .map((r) => {
        const code = String(r.employeeCode || '').toUpperCase();
        const onInvite = takenOnInvite.map((c) => String(c).toUpperCase()).includes(code);
        return {
          rowNumber: r.rowNumber,
          message: onInvite
            ? `employeeCode đang gắn lời mời chờ chấp nhận: ${r.employeeCode}`
            : `employeeCode đã tồn tại trên hệ thống: ${r.employeeCode}`,
          errorCode: 'VALIDATION_EMPLOYEE_CODE_TAKEN',
        };
      });
    return { ok: false, errorCode: 'VALIDATION_ERROR', details };
  }

  const deptDocs = await Department.find({ organization: organizationId }).select('_id name').lean();
  const deptMap = new Map(
    deptDocs.map((d) => [String(d.name || '').trim().toLowerCase(), String(d._id)])
  );

  const deptDetails = [];
  for (const row of validation.normalizedRows) {
    const key = String(row.departmentCode || '')
      .trim()
      .toLowerCase();
    if (!deptMap.has(key)) {
      deptDetails.push({
        rowNumber: row.rowNumber,
        message: `departmentCode không tồn tại: ${row.departmentCode}`,
        errorCode: 'VALIDATION_DEPARTMENT_NOT_FOUND',
      });
    }
  }
  if (deptDetails.length) {
    return { ok: false, errorCode: 'VALIDATION_DEPARTMENT_NOT_FOUND', details: deptDetails };
  }

  return {
    ok: true,
    organizationName: String(organization.name || 'VoiceHub').trim(),
    normalizedRows: validation.normalizedRows,
    deptMap,
  };
}

/**
 * Preview: lưu batch status=preview, chưa provision.
 */
async function previewMembersExcel({ organizationId, uploadedBy, fileBuffer, fileName = '' }) {
  requireEnv(organizationId, 'organizationId');
  if (!fileBuffer) throw new Error('fileBuffer is required');

  const prepared = await validateExcelForPreview({ organizationId, fileBuffer });
  if (!prepared.ok) {
    const err = new Error('Excel import validation failed');
    err.statusCode = 400;
    err.errorCode = prepared.errorCode || 'VALIDATION_ERROR';
    err.details = prepared.details || [];
    throw err;
  }

  const { normalizedRows } = prepared;
  const batch = await ImportBatch.create({
    organizationId,
    uploadedBy,
    fileName,
    totalRows: normalizedRows.length,
    processedRows: 0,
    errorCount: 0,
    status: 'preview',
    previewPayload: normalizedRows,
    validationDetails: null,
    rows: normalizedRows.map((r) => ({
      rowNumber: r.rowNumber,
      email: r.email,
      status: 'pending',
      userId: null,
      errorMessage: '',
    })),
  });

  return {
    batchId: String(batch._id),
    totalRows: batch.totalRows,
    errorCount: 0,
    status: 'preview',
    rows: batch.rows,
    canConfirm: true,
  };
}

async function allocateCodesForRows(organizationId, rows) {
  const list = rows.map((r) => ({ ...r }));
  const explicitCodes = list.map((r) => r.employeeCode).filter(Boolean);
  const assignedInBatch = new Set(explicitCodes.map((c) => String(c).toUpperCase()));
  const needAllocate = list.filter((row) => row.needsEmployeeCodeAllocate || !row.employeeCode);

  if (needAllocate.length) {
    const fresh = await allocateEmployeeCodesBatch(organizationId, needAllocate.length);
    for (let i = 0; i < needAllocate.length; i += 1) {
      let code = fresh[i];
      let guard = 0;
      while (assignedInBatch.has(code) && guard < 40) {
        // eslint-disable-next-line no-await-in-loop
        const [extra] = await allocateEmployeeCodesBatch(organizationId, 1);
        code = extra;
        guard += 1;
      }
      if (assignedInBatch.has(code)) {
        const err = new Error('Không cấp được employeeCode cho dòng trống');
        err.statusCode = 500;
        err.errorCode = 'EMPLOYEE_CODE_ALLOCATE_FAILED';
        throw err;
      }
      needAllocate[i].employeeCode = code;
      needAllocate[i].needsEmployeeCodeAllocate = false;
      assignedInBatch.add(code);
    }
  }
  await bumpCounterToAtLeast(organizationId, [...assignedInBatch]);
  return list;
}

async function compensateAll(compensation, organizationId) {
  for (const c of compensation) {
    try {
      await Membership.deleteOne({ user: c.userId, organization: organizationId });
    } catch (e) {
      logger.warn('[resourceImport] compensation membership delete failed', e?.message || e);
    }
    try {
      await Department.updateOne(
        { _id: c.departmentId, organization: organizationId },
        { $pull: { members: c.userId } }
      );
    } catch (e) {
      logger.warn('[resourceImport] compensation department pull failed', e?.message || e);
    }
    await deactivateProvisionedUserProfile(c.userId);
    await deactivateProvisionedAuthUser(c.userId);
  }
}

/**
 * Claim queued batch → allocate VH → provision theo chunk + concurrency.
 * Không throw ra HTTP (worker/inline); cập nhật ImportBatch status.
 */
async function processImportBatch({ organizationId, batchId }) {
  requireEnv(organizationId, 'organizationId');
  if (!batchId) return { ok: false, reason: 'batchId required' };

  const claimed = await ImportBatch.findOneAndUpdate(
    { _id: batchId, organizationId, status: 'queued' },
    {
      $set: {
        status: 'importing',
        startedAt: new Date(),
        processedRows: 0,
        errorCode: '',
        errorMessage: '',
      },
    },
    { new: true }
  );

  if (!claimed) {
    const existing = await ImportBatch.findOne({ _id: batchId, organizationId }).select('status').lean();
    logger.info('[resourceImport] processImportBatch skip (not queued)', {
      batchId,
      status: existing?.status,
    });
    return { ok: false, reason: 'not_queued', status: existing?.status };
  }

  const frontendUrl = String(claimed.frontendUrl || '').replace(/\/+$/, '');
  const uploadedBy = claimed.uploadedBy;
  const previewRows = Array.isArray(claimed.previewPayload) ? claimed.previewPayload : [];
  if (!previewRows.length) {
    await ImportBatch.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: 'failed',
          errorCode: 'PREVIEW_PAYLOAD_EMPTY',
          errorMessage: 'previewPayload trống',
        },
      }
    );
    return { ok: false, reason: 'empty_payload' };
  }

  const organization = await Organization.findById(organizationId).select('name').lean();
  const organizationName = String(organization?.name || 'VoiceHub').trim();

  const deptDocs = await Department.find({ organization: organizationId }).select('_id name').lean();
  const deptMap = new Map(
    deptDocs.map((d) => [String(d.name || '').trim().toLowerCase(), String(d._id)])
  );

  let rowsWithCodes;
  try {
    rowsWithCodes = await allocateCodesForRows(organizationId, previewRows);
    await ImportBatch.updateOne(
      { _id: claimed._id },
      { $set: { previewPayload: rowsWithCodes, totalRows: rowsWithCodes.length } }
    );
  } catch (allocErr) {
    await ImportBatch.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: 'failed',
          errorCode: allocErr?.errorCode || 'EMPLOYEE_CODE_ALLOCATE_FAILED',
          errorMessage: String(allocErr?.message || allocErr).slice(0, 800),
        },
      }
    );
    return { ok: false, reason: 'allocate_failed' };
  }

  const compensation = [];
  const chunks = chunkArray(rowsWithCodes, CHUNK_SIZE);

  try {
    for (const chunk of chunks) {
      const chunkStarted = nowMs();
      // eslint-disable-next-line no-await-in-loop
      const chunkResults = await runWithConcurrency(chunk, CONCURRENCY, async (row) => {
        try {
          const departmentId = deptMap.get(String(row.departmentCode || '').trim().toLowerCase());
          if (!departmentId) {
            throw Object.assign(new Error(`departmentCode không tồn tại: ${row.departmentCode}`), {
              errorCode: 'VALIDATION_DEPARTMENT_NOT_FOUND',
            });
          }

          const { userId, pendingActivation, timings } = await provisionRow({
            row,
            organizationId,
            uploadedBy,
          });

          await Department.updateOne(
            { _id: departmentId, organization: organizationId },
            { $addToSet: { members: userId } }
          );

          // Mail không block critical path (fail-soft + cập nhật emailSent sau)
          if (frontendUrl) {
            void sendProvisionSetPasswordEmail({
              userId,
              frontendUrl,
              organizationName,
              firstName: row.firstName || '',
              lastName: row.lastName || '',
            })
              .then((mailOut) => {
                if (!mailOut?.emailScheduled) return;
                return ImportBatch.updateOne(
                  { _id: claimed._id, 'rows.rowNumber': row.rowNumber },
                  { $set: { 'rows.$.emailSent': true } }
                );
              })
              .catch((mailErr) => {
                logger.warn('[resourceImport] set-password email failed (fail-soft)', {
                  email: row.email,
                  userId,
                  message: mailErr?.message || mailErr,
                });
              });
          }

          return {
            ok: true,
            rowNumber: row.rowNumber,
            email: row.email,
            userId,
            departmentId,
            emailSent: false,
            pendingActivation: Boolean(pendingActivation),
            timings,
          };
        } catch (e) {
          return {
            ok: false,
            rowNumber: row.rowNumber,
            email: row.email,
            message: e?.message || String(e),
            errorCode: e?.errorCode || 'RESOURCE_IMPORT_FAILED',
          };
        }
      });

      const failed = chunkResults.find((r) => r && !r.ok);
      const okResults = chunkResults.filter((r) => r?.ok);
      for (const result of okResults) {
        compensation.push({ userId: result.userId, departmentId: result.departmentId });
      }
      // eslint-disable-next-line no-await-in-loop
      await persistChunkProgress(claimed._id, okResults);

      logger.info('[resourceImport] chunk timings', {
        batchId: String(claimed._id),
        chunkRows: chunk.length,
        ok: okResults.length,
        failed: failed ? 1 : 0,
        concurrency: CONCURRENCY,
        chunkMs: nowMs() - chunkStarted,
        avgAuthMs: avgTiming(okResults, 'authMs'),
        avgProfileMs: avgTiming(okResults, 'profileMs'),
        avgMembershipMs: avgTiming(okResults, 'membershipMs'),
        avgTotalMs: avgTiming(okResults, 'totalMs'),
      });

      if (failed) {
        throw Object.assign(new Error(failed.message || 'Row import failed'), {
          errorCode: failed.errorCode,
          rowNumber: failed.rowNumber,
        });
      }
    }
  } catch (rowErr) {
    logger.error('[resourceImport] processImportBatch failed', {
      message: rowErr?.message || rowErr,
      rowNumber: rowErr?.rowNumber,
      batchId,
    });

    const failRow = Number(rowErr?.rowNumber) || 0;
    if (failRow) {
      await ImportBatch.updateOne(
        { _id: claimed._id, 'rows.rowNumber': failRow },
        {
          $set: {
            'rows.$.status': 'failed',
            'rows.$.errorMessage': String(rowErr?.message || rowErr).slice(0, 800),
          },
        }
      );
    }

    await compensateAll(compensation, organizationId);
    // Dòng chưa kịp xử lý vẫn "pending" → đánh skipped để HR không tưởng treo
    await ImportBatch.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: 'failed',
          errorCode: rowErr?.errorCode || 'RESOURCE_IMPORT_FAILED',
          errorMessage: String(rowErr?.message || rowErr).slice(0, 800),
          'rows.$[pending].status': 'skipped',
          'rows.$[pending].errorMessage': 'Bỏ qua do batch fail (compensate)',
        },
      },
      { arrayFilters: [{ 'pending.status': 'pending' }] }
    );
    return { ok: false, reason: 'row_failed', rowNumber: failRow };
  }

  await ImportBatch.updateOne(
    { _id: claimed._id },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        processedRows: rowsWithCodes.length,
        previewPayload: null,
      },
    }
  );

  return {
    ok: true,
    batchId: String(claimed._id),
    totalRows: rowsWithCodes.length,
    status: 'completed',
  };
}

/**
 * Confirm: nhận việc → queued → enqueue (HTTP nhanh). Worker chạy processImportBatch.
 * IMPORT_CONFIRM_ASYNC=false → chạy sync (chỉ demo nhỏ).
 */
async function confirmMembersExcel({
  organizationId,
  uploadedBy,
  batchId,
  frontendUrl = '',
}) {
  requireEnv(organizationId, 'organizationId');
  if (!batchId) {
    throw Object.assign(new Error('batchId bắt buộc'), { statusCode: 400, errorCode: 'VALIDATION_REQUIRED' });
  }

  const batch = await ImportBatch.findOne({ _id: batchId, organizationId });
  if (!batch) {
    throw Object.assign(new Error('Batch không tồn tại'), { statusCode: 404, errorCode: 'BATCH_NOT_FOUND' });
  }
  if (String(batch.status) !== 'preview') {
    throw Object.assign(new Error('Batch không ở trạng thái preview (đã import hoặc lỗi).'), {
      statusCode: 400,
      errorCode: 'BATCH_NOT_PREVIEW',
    });
  }
  if (Number(batch.errorCount) > 0) {
    throw Object.assign(new Error('Batch còn lỗi validation — không Confirm được.'), {
      statusCode: 400,
      errorCode: 'BATCH_HAS_ERRORS',
    });
  }

  const previewRows = Array.isArray(batch.previewPayload) ? batch.previewPayload : [];
  if (!previewRows.length) {
    throw Object.assign(new Error('previewPayload trống'), {
      statusCode: 400,
      errorCode: 'PREVIEW_PAYLOAD_EMPTY',
    });
  }

  const {
    isAsyncConfirmEnabled,
    enqueueMemberImportOrRunInline,
  } = require('../messaging/memberImport.publisher');

  const useAsync = isAsyncConfirmEnabled();

  if (!useAsync) {
    // Legacy sync path (demo nhỏ) — claim qua queued rồi process ngay
    batch.status = 'queued';
    batch.frontendUrl = String(frontendUrl || '').replace(/\/+$/, '');
    batch.processedRows = 0;
    await batch.save();
    const out = await processImportBatch({ organizationId, batchId: String(batch._id) });
    if (!out?.ok) {
      const err = new Error('Excel import failed. Compensating actions applied.');
      err.statusCode = 500;
      err.errorCode = 'RESOURCE_IMPORT_FAILED';
      throw err;
    }
    return {
      batchId: String(batch._id),
      totalRows: out.totalRows || previewRows.length,
      processedRows: out.totalRows || previewRows.length,
      status: 'completed',
      async: false,
      chunkSize: CHUNK_SIZE,
      concurrency: CONCURRENCY,
    };
  }

  const claimed = await ImportBatch.findOneAndUpdate(
    { _id: batchId, organizationId, status: 'preview' },
    {
      $set: {
        status: 'queued',
        frontendUrl: String(frontendUrl || '').replace(/\/+$/, ''),
        processedRows: 0,
        errorCode: '',
        errorMessage: '',
        startedAt: null,
        completedAt: null,
      },
    },
    { new: true }
  );

  if (!claimed) {
    throw Object.assign(new Error('Batch không còn ở trạng thái preview.'), {
      statusCode: 409,
      errorCode: 'BATCH_NOT_PREVIEW',
    });
  }

  const job = { organizationId: String(organizationId), batchId: String(claimed._id) };
  const enq = await enqueueMemberImportOrRunInline(job, processImportBatch);

  return {
    batchId: String(claimed._id),
    totalRows: claimed.totalRows || previewRows.length,
    processedRows: 0,
    status: 'queued',
    async: true,
    enqueueMode: enq.mode,
    chunkSize: CHUNK_SIZE,
    concurrency: CONCURRENCY,
  };
}

/**
 * Legacy one-shot: preview + confirm (async enqueue — client nên poll batch).
 */
async function importMembersExcel(args) {
  const preview = await previewMembersExcel(args);
  return confirmMembersExcel({
    organizationId: args.organizationId,
    uploadedBy: args.uploadedBy,
    batchId: preview.batchId,
    frontendUrl: args.frontendUrl || '',
  });
}

module.exports = {
  importMembersExcel,
  previewMembersExcel,
  confirmMembersExcel,
  processImportBatch,
  DATA_LIMIT,
  CHUNK_SIZE,
  CONCURRENCY,
};
