const axios = require('axios');
const XLSX = require('xlsx');

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
const { logger } = require('@enterprise/shared');
const Organization = require('../models/Organization');
const ImportBatch = require('../models/ImportBatch');
const Department = require('../models/Department');
const Membership = require('../models/Membership');

const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function requireEnv(value, name) {
  if (!value) throw new Error(`${name} not configured`);
}

function toNumberOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function guessPrimaryDomainFromJobTitle(jobTitle) {
  const jt = String(jobTitle || '').toLowerCase();
  if (!jt) return 'other';
  if (jt.includes('frontend') || jt.includes('front-end') || jt.includes('react') || jt.includes('vue')) return 'fe';
  if (jt.includes('backend') || jt.includes('back-end') || jt.includes('node') || jt.includes('server')) return 'be';
  if (jt.includes('fullstack') || jt.includes('full stack')) return 'fullstack';
  if (jt.includes('mobile') || jt.includes('ios') || jt.includes('android')) return 'mobile';
  if (jt.includes('qa') || jt.includes('tester') || jt.includes('test')) return 'qa';
  if (jt.includes('ba') || jt.includes('business analyst') || jt.includes('analyst')) return 'ba';
  if (jt.includes('devops') || jt.includes('kubernetes') || jt.includes('docker')) return 'devops';
  return 'other';
}

async function deactivateProvisionedAuthUser(userId) {
  // auth-service internal route deactivates userAuth.isActive/isEmailVerified
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

  const provisionMeta = await provisionUserByAdmin({
    email,
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    systemRole: 'employee',
    resetPassword: true,
    readyForLogin: false,
  });

  const userId = String(provisionMeta?.userId || '').trim();
  if (!userId) {
    throw Object.assign(new Error('Auth provision did not return userId'), { errorCode: 'PROVISION_FAILED' });
  }

  // Bulk set user profile fields (HR internal)
  const primaryDomain = row.primaryDomain || guessPrimaryDomainFromJobTitle(row.jobTitle);
  const skills = row.skills.map((s) => String(s)).filter(Boolean);

  await bulkUpdateUserProfileFields(userId, {
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

  const roleNormalized = row.orgRole || 'member';

  // Create membership (org-service DB)
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

  // Place into Department.members by departmentCode = Department.name
  // (we already prefetch departmentId map earlier)

  // A+C soft: primaryDomain → Responsibility (không đè nếu đã gán; không fail import)
  try {
    await softAssignResponsibilityFromPrimaryDomain({
      organizationId,
      userId,
      primaryDomain,
    });
  } catch (respErr) {
    logger.warn('[resourceImport] soft Responsibility assign failed:', respErr?.message || respErr);
  }

  return {
    userId,
    membershipId: membership?._id,
    pendingActivation: Boolean(provisionMeta?.pendingActivation),
  };
}

async function importMembersExcel({
  organizationId,
  uploadedBy,
  fileBuffer,
  fileName = '',
  frontendUrl = '',
}) {
  requireEnv(organizationId, 'organizationId');
  if (!fileBuffer) throw new Error('fileBuffer is required');

  const organization = await Organization.findById(organizationId)
    .select('name settings.allowedEmailDomains')
    .lean();
  if (!organization) {
    throw Object.assign(new Error('Organization not found'), {
      statusCode: 404,
      errorCode: 'ORG_NOT_FOUND',
    });
  }
  const allowedEmailDomains = resolveAllowedEmailDomains(organization);
  const organizationName = String(organization.name || 'VoiceHub').trim();

  // 1) Parse workbook (sheet 1)
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error('Excel file missing sheet');

  const sheet = wb.Sheets[sheetName];
  const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(rows2d) || rows2d.length < 2) {
    throw Object.assign(new Error('Excel has no data rows'), { statusCode: 400, errorCode: 'VALIDATION_REQUIRED' });
  }

  const headerRow = rows2d[0];
  const headerIndex = {};
  for (let i = 0; i < headerRow.length; i += 1) {
    const key = String(headerRow[i] || '').trim().toLowerCase();
    if (!key) continue;
    headerIndex[key] = i;
  }

  const getCell = (row, key) => {
    const idx = headerIndex[String(key).toLowerCase()];
    if (idx == null) return '';
    return row[idx];
  };

  const normalizedRowsRaw = [];
  const dataLimit = 200;
  for (let i = 1; i < rows2d.length && normalizedRowsRaw.length < dataLimit; i += 1) {
    const rowArr = rows2d[i];
    const rowNumber = i + 1; // Excel line number (1-based)
    normalizedRowsRaw.push({
      rowNumber,
      employeeCode: getCell(rowArr, 'employeecode'),
      fullName: getCell(rowArr, 'fullname') || getCell(rowArr, 'displayname') || getCell(rowArr, 'hoten'),
      email: getCell(rowArr, 'email'),
      phone: getCell(rowArr, 'phone') || getCell(rowArr, 'sodienthoai') || getCell(rowArr, 'sdt'),
      departmentCode: getCell(rowArr, 'departmentcode'),
      jobTitle: getCell(rowArr, 'jobtitle'),
      primaryDomain: getCell(rowArr, 'primarydomain') || getCell(rowArr, 'domain'),
      skills: getCell(rowArr, 'skills'),
      yearsExperience: getCell(rowArr, 'yearsexperience'),
      maxConcurrentProjects: getCell(rowArr, 'maxconcurrentprojects'),
      orgRole: getCell(rowArr, 'orgrole'),
    });
  }

  // 2) Validate-all before any DB write
  const validation = validateResourceImportRows(normalizedRowsRaw, { allowedEmailDomains });
  if (!validation.ok) {
    const err = new Error('Excel import validation failed');
    err.statusCode = 400;
    err.errorCode = validation.errorCode || 'VALIDATION_ERROR';
    err.details = validation.details || [];
    throw err;
  }

  // 2b) employeeCode đã tồn tại (profile + pending invite) → hủy cả file
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
    const err = new Error('Excel import validation failed');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    err.details = details;
    throw err;
  }

  // 2c) Dòng trống employeeCode → auto-allocate batch (1 bootstrap, tránh timeout gateway 20s)
  const assignedInBatch = new Set(explicitCodes.map((c) => String(c).toUpperCase()));
  const needAllocate = validation.normalizedRows.filter(
    (row) => row.needsEmployeeCodeAllocate || !row.employeeCode
  );
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

  // 3) Department prefetch by name (departmentCode = Department.name)
  const deptDocs = await Department.find({ organization: organizationId }).select('_id name').lean();
  const deptMap = new Map(deptDocs.map((d) => [String(d.name || '').trim().toLowerCase(), String(d._id)]));

  // Ensure all rows' departmentCode exist
  for (const row of validation.normalizedRows) {
    const key = String(row.departmentCode || '').trim().toLowerCase();
    if (!deptMap.has(key)) {
      const err = new Error(`departmentCode not found: ${row.departmentCode}`);
      err.statusCode = 400;
      err.errorCode = 'VALIDATION_DEPARTMENT_NOT_FOUND';
      err.details = [{ rowNumber: row.rowNumber, message: 'departmentCode không tồn tại' }];
      throw err;
    }
  }

  const batch = await ImportBatch.create({
    organizationId,
    uploadedBy,
    fileName,
    totalRows: validation.normalizedRows.length,
    status: 'importing',
    rows: validation.normalizedRows.map((r) => ({
      rowNumber: r.rowNumber,
      email: r.email,
      status: 'skipped',
      userId: null,
      errorMessage: '',
    })),
    startedAt: new Date(),
  });

  const compensation = []; // { userId, departmentId }
  try {
    for (let idx = 0; idx < validation.normalizedRows.length; idx += 1) {
      const row = validation.normalizedRows[idx];
      const departmentId = deptMap.get(String(row.departmentCode).trim().toLowerCase());

      try {
        const { userId, pendingActivation } = await provisionRow({ row, organizationId, uploadedBy });

        // Department placement
        await Department.updateOne(
          { _id: departmentId, organization: organizationId },
          { $addToSet: { members: userId } }
        );

        compensation.push({ userId, departmentId });

        let emailSent = false;
        try {
          const mailOut = await sendProvisionSetPasswordEmail({
            userId,
            frontendUrl,
            organizationName,
            firstName: row.firstName || '',
            lastName: row.lastName || '',
          });
          emailSent = Boolean(mailOut?.emailScheduled);
          if (!emailSent) {
            logger.warn('[resourceImport] set-password email not scheduled', {
              email: row.email,
              userId,
              skipped: mailOut?.skipped,
            });
          }
        } catch (mailErr) {
          logger.warn('[resourceImport] set-password email failed (fail-soft)', {
            email: row.email,
            userId,
            message: mailErr?.message || mailErr,
          });
        }

        // Update batch row status
        await ImportBatch.updateOne(
          { _id: batch._id, 'rows.rowNumber': row.rowNumber },
          {
            $set: {
              'rows.$.status': 'ok',
              'rows.$.userId': userId,
              'rows.$.errorMessage': '',
              'rows.$.emailSent': emailSent,
              'rows.$.pendingActivation': Boolean(pendingActivation),
            },
          }
        );
      } catch (rowErr) {
        logger.error('[resourceImport] row failed', {
          rowNumber: row.rowNumber,
          email: row.email,
          message: rowErr?.message || rowErr,
        });
        await ImportBatch.updateOne(
          { _id: batch._id, 'rows.rowNumber': row.rowNumber },
          {
            $set: {
              'rows.$.status': 'failed',
              'rows.$.errorMessage': String(rowErr?.message || rowErr).slice(0, 800),
            },
          }
        );

        // Strict rejection: compensate what already created in previous rows
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

        await ImportBatch.updateOne(
          { _id: batch._id },
          { $set: { status: 'failed' }, $unset: { completedAt: 1 } }
        );

        const err = new Error('Excel import failed. Compensating actions applied.');
        err.statusCode = 500;
        err.errorCode = rowErr?.errorCode || 'RESOURCE_IMPORT_FAILED';
        err.details = [{ rowNumber: row.rowNumber, message: rowErr?.message || String(rowErr) }];
        throw err;
      }
    }
  } catch (outerErr) {
    logger.error('[resourceImport] outer failed', outerErr?.message || outerErr);
    throw outerErr;
  }

  await ImportBatch.updateOne(
    { _id: batch._id },
    { $set: { status: 'completed', completedAt: new Date() } }
  );

  return { batchId: String(batch._id), totalRows: batch.totalRows };
}

module.exports = {
  importMembersExcel,
};

