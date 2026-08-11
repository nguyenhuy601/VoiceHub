const ROLE_PERMISSION_SERVICE_URL = String(process.env.ROLE_PERMISSION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ROLE_PERMISSION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ROLE_PERMISSION_SERVICE_URL');
const Membership = require('../models/Membership');
const {
  orgUnauthorized,
  orgAccessDenied,
  orgNotFound,
  orgMemberNotFound,
  orgValidation,
  orgConflict,
  orgCatch,
  orgOperationalError,
  orgFail,
} = require('../utils/orgApiError');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const { resolveEffectiveScopesFromAssignments } = require('../services/memberScopePolicy.service');
const { resolveOrgAccess, toObjectId } = require('../utils/orgAccess');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { emitRealtimeEvent } = require('../clients/realtime.client');
const { resolveFrontendUrl, logger } = require('@enterprise/shared');
const { ensureDefaultOrgRoles, syncUserOrgRole, stripUserOrgRoles } = require('../services/rolePermissionOrgSync');
const { invalidateOrgReadCache, invalidateOrgAcl } = require('../services/orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { provisionUserByAdmin } = require('../clients/authProvision.client');
const { searchUserByEmail } = require('../clients/userLookup.client');
const { sendCompanyInviteEmail } = require('../clients/authInviteEmail.client');
const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');
const { fetchAuthSummaryByUserIds } = require('../clients/authSummaryBatch.client');
const {
  assertEmailDomainAllowed,
  resolveAllowedEmailDomains,
} = require('../utils/emailDomainPolicy');
const CompanyInvite = require('../models/CompanyInvite');
const { bulkUpdateUserProfileFields } = require('../clients/userProfileBulkImport.client');
const {
  allocateNextEmployeeCode,
  peekNextEmployeeCode,
} = require('../services/employeeCodeAllocate.service');
const crypto = require('crypto');
const {
  attachPlacementFromStructure,
  buildDepartmentRoster,
} = require('../services/structurePlacement.service');
// Không log JWT/link mời đầy đủ — production nên dùng HTTPS cho FRONTEND_URL.
const ALLOWED_ROLES = ['owner', 'admin', 'hr', 'member'];
const INVITE_LINK_SECRET = String(process.env.INVITE_LINK_SECRET || process.env.JWT_SECRET || '').trim();
const INVITE_LINK_EXPIRES_IN = process.env.INVITE_LINK_EXPIRES_IN || '7d';
const COMPANY_INVITE_TTL_MS = Math.max(
  3600000,
  Number(process.env.COMPANY_INVITE_TTL_MS || 7 * 24 * 60 * 60 * 1000) || 7 * 24 * 60 * 60 * 1000
);

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex');
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}
const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!NOTIFICATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: NOTIFICATION_SERVICE_URL');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function notificationServiceAxiosOpts() {
  const opts = { timeout: 8000 };
  if (NOTIFICATION_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN };
  }
  return opts;
}

function canAdminManageTarget(targetRole) {
  const normalizedTarget = Membership.normalizeRole(targetRole);
  return normalizedTarget !== 'owner' && normalizedTarget !== 'admin';
}

async function getActiveOrgUserIds(orgId) {
  if (!orgId) return [];
  const userIds = await Membership.distinct('user', {
    organization: orgId,
    status: 'active',
  });
  return [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
}

const MEMBER_LIST_FULL_ACCESS_ROLES = ['owner', 'admin', 'hr'];

const ROLE_PERMISSION_BASE = String(
  process.env.ROLE_PERMISSION_SERVICE_URL
).replace(/\/$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function rolePermissionInternalHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

async function fetchOrgRolesList(orgId, userId) {
  const oid = String(orgId || '').trim();
  const uid = String(userId || '').trim();
  if (!oid || !uid || !GATEWAY_INTERNAL_TOKEN) return [];
  try {
    const headers = {
      ...rolePermissionInternalHeaders(),
      'x-user-id': uid,
    };
    const res = await axios.get(
      `${ROLE_PERMISSION_BASE}/api/roles/server/${encodeURIComponent(oid)}`,
      { headers, timeout: 8000, validateStatus: () => true }
    );
    if (res.status >= 400) {
      logger.warn('[fetchOrgRolesList] list roles failed', {
        orgId: oid,
        userId: uid,
        status: res.status,
        message: res.data?.message,
      });
      return [];
    }
    const body = res.data?.data ?? res.data;
    return Array.isArray(body) ? body : [];
  } catch (err) {
    logger.warn('[fetchOrgRolesList] list roles error', { orgId: oid, message: err?.message });
    return [];
  }
}

async function listMembersForOrg(req) {
  const orgIdRaw = String(req.params.orgId || '').trim();
  if (!toObjectId(orgIdRaw)) {
    const err = new Error('orgId không hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_INVALID_ID';
    throw err;
  }
  const orgId = orgIdRaw;
  const userId = String(req.user?.id || req.user?.userId || req.user?._id || '');
  if (!userId) {
    const err = new Error('Not authenticated');
    err.statusCode = 401;
    throw err;
  }

  const access = await resolveOrgAccess(userId, orgId);
  if (!access.ok) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    err.code = 'ORG_ACCESS_DENIED';
    throw err;
  }
  const viewerMembership = access.membership;
  if (!viewerMembership) {
    return [];
  }

  const departmentIdQuery = String(req.query?.departmentId || '').trim();
  if (departmentIdQuery) {
    return listMembersForDepartmentRoster(orgId, departmentIdQuery);
  }

  const members = await Membership.find({ organization: orgId, status: 'active' })
    .select('user organization role joinedAt status invitedBy createdAt updatedAt')
    .lean();

  const viewerRole = Membership.normalizeRole(viewerMembership.role);
  if (MEMBER_LIST_FULL_ACCESS_ROLES.includes(viewerRole)) {
    return members;
  }

  const viewerEffectiveScopes = await resolveEffectiveScopesFromAssignments(orgId, userId);

  const memberUserIds = [
    ...new Set(members.map((row) => String(row.user?._id || row.user || '')).filter(Boolean)),
  ];
  const scopeByUserId = new Map();
  await Promise.all(
    memberUserIds.map(async (uid) => {
      const scopes =
        uid === userId ? viewerEffectiveScopes : await resolveEffectiveScopesFromAssignments(orgId, uid);
      scopeByUserId.set(uid, scopes);
    })
  );

  const filtered = members.filter((member) => {
    const memberUserId = String(member.user?._id || member.user || '');
    if (memberUserId === userId) return true;
    const memberScopes = scopeByUserId.get(memberUserId);
    if (!memberScopes) return false;
    for (const tid of viewerEffectiveScopes.teamIds) {
      if (memberScopes.teamIds.has(String(tid))) return true;
    }
    for (const did of viewerEffectiveScopes.departmentIds) {
      if (memberScopes.departmentIds.has(String(did))) return true;
    }
    for (const vid of viewerEffectiveScopes.divisionIds) {
      if (memberScopes.divisionIds.has(String(vid))) return true;
    }
    return false;
  });

  return filtered.map((member) => {
    const memberUserId = String(member.user?._id || member.user || '');
    const scopes = scopeByUserId.get(memberUserId);
    const teamId = scopes?.teamIds?.values?.().next?.().value || null;
    const departmentId = scopes?.departmentIds?.values?.().next?.().value || null;
    const divisionId = scopes?.divisionIds?.values?.().next?.().value || null;
    return {
      ...member,
      team: teamId ? String(teamId) : null,
      department: departmentId ? String(departmentId) : null,
      division: divisionId ? String(divisionId) : null,
      branch: null,
    };
  });
}

/**
 * Roster 1 phòng cho wizard tạo project — People Graph + OU matrix.
 * Query param trên GET /members (không thêm route).
 */
async function listMembersForDepartmentRoster(orgId, rawDeptId) {
  const Department = require('../models/Department');
  const OrganizationalUnit = require('../models/OrganizationalUnit');
  const OrgUnitMembership = require('../models/OrgUnitMembership');

  let legacyDeptId = String(rawDeptId || '').trim();
  const asDept = await Department.findOne({ _id: legacyDeptId, organization: orgId })
    .select('_id')
    .lean();
  const ouIds = [];
  if (!asDept) {
    const ou = await OrganizationalUnit.findOne({ _id: legacyDeptId, organization: orgId })
      .select('_id legacyRef')
      .lean();
    if (ou?._id) ouIds.push(String(ou._id));
    if (ou?.legacyRef?.id) legacyDeptId = String(ou.legacyRef.id);
  } else {
    const ouByLegacy = await OrganizationalUnit.findOne({
      organization: orgId,
      'legacyRef.id': asDept._id,
    })
      .select('_id')
      .lean();
    if (ouByLegacy?._id) ouIds.push(String(ouByLegacy._id));
  }

  const roster = await buildDepartmentRoster(orgId, { departmentIds: [legacyDeptId] });
  const ids = new Set((roster[0]?.memberIds || []).map((id) => String(id)));

  if (ouIds.length) {
    const rows = await OrgUnitMembership.find({
      organization: orgId,
      unitId: { $in: ouIds },
    })
      .select('userId')
      .lean();
    for (const row of rows) {
      if (row?.userId) ids.add(String(row.userId));
    }
  }

  if (!ids.size) return [];

  const objectIds = [...ids].map((id) => toObjectId(id)).filter(Boolean);
  const members = await Membership.find({
    organization: orgId,
    status: 'active',
    user: { $in: objectIds.length ? objectIds : ids },
  })
    .select('user organization role joinedAt status invitedBy createdAt updatedAt')
    .lean();

  return members.map((member) => ({
    ...member,
    department: legacyDeptId,
    departmentId: legacyDeptId,
  }));
}

exports.getMembers = async (req, res, next) => {
  try {
    const members = await listMembersForOrg(req);
    return res.json({ status: 'success', data: members });
  } catch (error) {
    const handled = orgOperationalError(res, error);
    if (handled) return handled;
    return next(error);
  }
};

async function enrichMembersForAdminList(members) {
  const userIds = members
    .map((m) => String(m.user?._id || m.user || m.userId || '').trim())
    .filter(Boolean);
  const [profileMap, authMap] = await Promise.all([
    fetchProfilesByUserIds(userIds),
    fetchAuthSummaryByUserIds(userIds),
  ]);

  return members.map((member) => {
    const userId = String(member.user?._id || member.user || member.userId || '').trim();
    const profile = profileMap.get(userId) || {};
    const auth = authMap.get(userId) || {};
    const email = String(profile.email || auth.email || '').trim() || null;
    const emailLocal = email && email.includes('@') ? email.split('@')[0] : '';
    const displayName =
      profile.displayName ||
      profile.fullName ||
      [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
      profile.username ||
      emailLocal ||
      null;
    return {
      ...member,
      userId,
      email,
      displayName,
      username: profile.username || null,
      avatar: profile.avatar || null,
      jobTitle: profile.jobTitle || profile.preferences?.jobTitle || null,
      isActive: auth.isActive,
      mustChangePassword: auth.mustChangePassword,
      isLocked: auth.isLocked,
      lastLoginAt: auth.lastLoginAt || null,
      // Huy: gắn systemRole để FE/BE lọc tài khoản admin hệ thống khỏi danh sách user
      systemRole: String(auth.systemRole || 'employee').toLowerCase() === 'admin' ? 'admin' : 'employee',
    };
  });
}

/** Gom members + roles RBAC — một request cho sidebar (wave-2d). */
exports.getMembersWithRoles = async (req, res, next) => {
  try {
    const userId = String(req.user?.id || req.user?.userId || req.user?._id || '');
    const [members, roles] = await Promise.all([
      listMembersForOrg(req),
      fetchOrgRolesList(req.params.orgId, userId),
    ]);
    const enriched = await enrichMembersForAdminList(members);
    const withPlacement = await attachPlacementFromStructure(req.params.orgId, enriched);
    return res.json({ status: 'success', data: { members: withPlacement, roles } });
  } catch (error) {
    const handled = orgOperationalError(res, error);
    if (handled) return handled;
    return next(error);
  }
};

exports.previewNextEmployeeCode = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    if (!orgId) return orgValidation(res, 'orgId is required');
    const employeeCode = await peekNextEmployeeCode(orgId);
    return res.json({ status: 'success', data: { employeeCode } });
  } catch (error) {
    return next(error);
  }
};

exports.inviteMember = async (req, res, next) => {
  try {
    const { email, firstName, lastName, role, departmentId, jobTitle } = req.body || {};
    const inviterId = req.user?.id || req.user?.userId || req.user?._id;
    const orgId = req.params.orgId;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return orgValidation(res, 'email is required');
    }

    const jobTitleTrim = String(jobTitle || '').trim();
    if (!jobTitleTrim) {
      return orgValidation(res, 'jobTitle (chức danh) bắt buộc khi mời nhân sự.');
    }

    const deptIdRaw = String(departmentId || '').trim();
    if (!deptIdRaw) {
      return orgValidation(res, 'departmentId (phòng ban) bắt buộc khi mời nhân sự.');
    }

    const department = await Department.findOne({
      _id: deptIdRaw,
      organization: orgId,
      isActive: { $ne: false },
    })
      .select('_id name')
      .lean();
    if (!department) {
      return orgValidation(res, 'Phòng ban không tồn tại trong công ty.');
    }

    const organization = await Organization.findById(orgId).select('name settings.allowedEmailDomains').lean();
    if (!organization) {
      return orgNotFound(res);
    }

    const domainGate = assertEmailDomainAllowed(
      normalizedEmail,
      resolveAllowedEmailDomains(organization)
    );
    if (!domainGate.ok) {
      return orgValidation(res, domainGate.message);
    }

    const inviterMembership = await Membership.findOne({
      user: inviterId,
      organization: orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    const inviterRole = Membership.normalizeRole(inviterMembership?.role);
    let normalizedRole = Membership.normalizeRole(role || 'member');
    if (inviterRole === 'hr') {
      normalizedRole = 'member';
    }
    if (inviterRole === 'admin' && ['owner', 'admin'].includes(normalizedRole)) {
      normalizedRole = 'member';
    }
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return orgValidation(res, 'Invalid role');
    }

    const existingProfile = await searchUserByEmail(normalizedEmail);
    if (existingProfile) {
      const existingUserId = String(
        existingProfile.userId || existingProfile.id || existingProfile._id || ''
      ).trim();
      if (existingUserId) {
        const existingMembership = await Membership.findOne({
          user: existingUserId,
          organization: orgId,
          status: 'active',
        }).lean();
        if (existingMembership) {
          return orgConflict(res, 'Đã là thành viên công ty.', 'ORG_ALREADY_MEMBER');
        }
      }
    }

    await CompanyInvite.updateMany(
      { organization: orgId, email: normalizedEmail, status: 'pending' },
      { $set: { status: 'revoked' } }
    );

    let employeeCode;
    try {
      employeeCode = await allocateNextEmployeeCode(orgId);
    } catch (allocErr) {
      return orgFail(
        res,
        allocErr.statusCode || 500,
        allocErr.message || 'Không cấp được mã nhân viên',
        allocErr.errorCode || 'EMPLOYEE_CODE_ALLOCATE_FAILED'
      );
    }

    const rawToken = generateInviteToken();
    const invite = await CompanyInvite.create({
      organization: orgId,
      email: normalizedEmail,
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim(),
      employeeCode,
      departmentId: department._id,
      departmentName: String(department.name || '').trim(),
      jobTitle: jobTitleTrim,
      role: normalizedRole,
      invitedBy: inviterId || null,
      tokenHash: hashInviteToken(rawToken),
      status: 'pending',
      expiresAt: new Date(Date.now() + COMPANY_INVITE_TTL_MS),
    });

    const frontendUrl = resolveFrontendUrl(req).replace(/\/+$/, '');
    const inviteUrl = `${frontendUrl}/accept-company-invite?token=${encodeURIComponent(rawToken)}`;

    const invitePayload = {
      inviteId: String(invite._id),
      email: normalizedEmail,
      role: normalizedRole,
      employeeCode,
      departmentId: String(department._id),
      departmentName: invite.departmentName,
      jobTitle: jobTitleTrim,
      expiresAt: invite.expiresAt,
    };

    try {
      await sendCompanyInviteEmail({
        email: normalizedEmail,
        inviteUrl,
        organizationName: organization.name || 'VoiceHub',
        firstName: invite.firstName,
        lastName: invite.lastName,
      });
    } catch (emailErr) {
      logger.warn('[inviteMember] invite email failed; returning inviteUrl for manual share', {
        email: normalizedEmail,
        message: emailErr?.message || emailErr,
        errorCode: emailErr?.errorCode,
      });
      return res.status(201).json({
        status: 'success',
        data: {
          ...invitePayload,
          emailSent: false,
          inviteUrl,
          emailError:
            emailErr?.messageUser ||
            emailErr?.message ||
            'Không gửi được email (kiểm tra EMAIL_USER / Gmail App Password).',
        },
        message:
          'Lời mời đã tạo nhưng chưa gửi được email. Hãy copy link bên dưới gửi tay cho nhân viên.',
      });
    }

    res.status(201).json({
      status: 'success',
      data: {
        ...invitePayload,
        emailSent: true,
        inviteUrl: process.env.NODE_ENV !== 'production' ? inviteUrl : undefined,
      },
      message: 'Đã gửi email lời mời nhận tài khoản',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public — nhân viên mở link trong email: tạo tài khoản (nếu chưa có) + membership active.
 * Trả email + temporaryPassword đúng một lần (khi vừa tạo mới).
 */
exports.acceptCompanyInvite = async (req, res, next) => {
  try {
    const rawToken = String(req.body?.token || req.query?.token || '').trim();
    if (!rawToken) {
      return orgValidation(res, 'token is required');
    }

    const tokenHash = hashInviteToken(rawToken);
    const invite = await CompanyInvite.findOne({ tokenHash }).lean();
    if (!invite) {
      return orgFail(res, 404, 'Lời mời không hợp lệ hoặc đã hết hạn.', 'ORG_INVITE_INVALID');
    }

    if (invite.status === 'accepted' && invite.acceptedUserId) {
      return res.json({
        status: 'success',
        data: {
          email: invite.email,
          temporaryPassword: null,
          alreadyAccepted: true,
          alreadyHadAccount: true,
          mustChangePassword: false,
          organizationId: String(invite.organization),
        },
        message: 'Tài khoản đã được tạo trước đó. Vui lòng đăng nhập.',
      });
    }

    if (invite.status !== 'pending') {
      return orgFail(res, 400, 'Lời mời không còn hiệu lực.', 'ORG_INVITE_INVALID');
    }

    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      await CompanyInvite.updateOne({ _id: invite._id }, { $set: { status: 'expired' } });
      return orgFail(res, 400, 'Lời mời đã hết hạn.', 'ORG_INVITE_EXPIRED');
    }

    let provisionMeta;
    try {
      provisionMeta = await provisionUserByAdmin({
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        // Click invite = chứng minh mailbox → active ngay + mk tạm một lần trên FE.
        readyForLogin: true,
      });
    } catch (provisionErr) {
      const status = provisionErr.statusCode || 400;
      return orgFail(
        res,
        status,
        provisionErr.message || 'Provision failed',
        provisionErr.errorCode || 'ORG_PROVISION_FAILED'
      );
    }

    const resolvedUserId = String(provisionMeta.userId || '').trim();
    if (!resolvedUserId) {
      return orgFail(res, 500, 'Không tạo được tài khoản', 'ORG_PROVISION_FAILED');
    }

    const normalizedRole = Membership.normalizeRole(invite.role || 'member');
    const membership = await Membership.findOneAndUpdate(
      { user: resolvedUserId, organization: invite.organization },
      {
        user: resolvedUserId,
        organization: invite.organization,
        role: normalizedRole,
        status: 'active',
        invitedBy: invite.invitedBy || null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await syncUserOrgRole(resolvedUserId, invite.organization, normalizedRole);

    // Ghi mã NV + chức danh HR; gắn phòng (cấu trúc — không để NV tự chọn).
    const displayName = [invite.lastName, invite.firstName].filter(Boolean).join(' ').trim();
    try {
      const profilePayload = {
        structureOnly: true,
        uploadedBy: invite.invitedBy || null,
        resourceConfig: {
          maxConcurrentProjects: 2,
        },
      };
      if (invite.employeeCode) profilePayload.employeeCode = invite.employeeCode;
      if (invite.jobTitle) profilePayload.jobTitle = invite.jobTitle;
      if (displayName) profilePayload.displayName = displayName;
      if (invite.employeeCode || invite.jobTitle || displayName) {
        await bulkUpdateUserProfileFields(resolvedUserId, profilePayload);
      }
    } catch (profileErr) {
      logger.warn('[acceptCompanyInvite] profile bulk fields failed:', profileErr?.message || profileErr);
    }

    if (invite.departmentId) {
      try {
        await Department.updateOne(
          { _id: invite.departmentId, organization: invite.organization },
          { $addToSet: { members: resolvedUserId } }
        );
      } catch (deptErr) {
        logger.warn('[acceptCompanyInvite] department placement failed:', deptErr?.message || deptErr);
      }
    }

    await CompanyInvite.updateOne(
      { _id: invite._id },
      {
        $set: {
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedUserId: resolvedUserId,
        },
      }
    );

    const created = Boolean(provisionMeta.created);
    res.json({
      status: 'success',
      data: {
        email: invite.email,
        temporaryPassword: created ? provisionMeta.temporaryPassword || null : null,
        alreadyAccepted: false,
        alreadyHadAccount: !created,
        mustChangePassword: created || Boolean(provisionMeta.mustChangePassword),
        organizationId: String(invite.organization),
        membershipId: String(membership._id),
        userId: resolvedUserId,
        employeeCode: invite.employeeCode || null,
        jobTitle: invite.jobTitle || null,
        departmentId: invite.departmentId ? String(invite.departmentId) : null,
      },
      message: created
        ? 'Tài khoản đã được tạo. Vui lòng đăng nhập bằng thông tin được cấp.'
        : 'Tài khoản đã tồn tại và đã được thêm vào công ty. Vui lòng đăng nhập.',
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyInvitations = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return orgUnauthorized(res);
    }

    const invitations = await Membership.find({
      user: userId,
      status: 'pending',
    })
      .select('organization role invitedBy createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const orgIds = [...new Set(invitations.map((i) => String(i.organization)).filter(Boolean))];
    const orgDocs = orgIds.length
      ? await Organization.find({ _id: { $in: orgIds }, isActive: true })
        .select('name description logo')
        .lean()
      : [];
    const orgMap = Object.fromEntries(orgDocs.map((o) => [String(o._id), o]));

    const normalized = invitations
      .filter((item) => orgMap[String(item.organization)])
      .map((item) => ({
        invitationId: item._id,
        organization: orgMap[String(item.organization)],
        role: item.role,
        invitedBy: item.invitedBy || null,
        createdAt: item.createdAt,
      }));

    res.json({ status: 'success', data: normalized });
  } catch (error) {
    next(error);
  }
};

exports.respondToInvitation = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const { action } = req.body || {};
    const { invitationId } = req.params;

    if (!userId) {
      return orgUnauthorized(res);
    }
    if (!['accept', 'reject'].includes(action)) {
      return orgValidation(res, 'Action must be accept or reject');
    }

    const invitation = await Membership.findOne({
      _id: invitationId,
      user: userId,
      status: 'pending',
    });

    if (!invitation) {
      return orgFail(res, 404, 'Invitation not found', 'ORG_NOT_FOUND');
    }

    if (action === 'accept') {
      const org = await Organization.findById(invitation.organization).lean();
      if (!org || !org.isActive) {
        return orgNotFound(res);
      }

      // Chuẩn hoá role mặc định khi tham gia thành công: luôn là member.
      invitation.role = 'member';
      invitation.status = 'active';
      invitation.joinedAt = new Date();
      await invitation.save();

      await ensureDefaultOrgRoles(invitation.organization);
      await syncUserOrgRole(
        userId,
        invitation.organization,
        'member'
      );

      await emitRealtimeEvent({
        event: 'organization:invitation_accepted',
        userIds: [String(userId), String(invitation.invitedBy || '')].filter(Boolean),
        payload: {
          invitationId: String(invitation._id),
          organizationId: String(invitation.organization),
          userId: String(userId),
          timestamp: new Date().toISOString(),
        },
      });
      return res.json({ status: 'success', data: invitation, message: 'Invitation accepted' });
    }

    await Membership.deleteOne({ _id: invitationId });
    await emitRealtimeEvent({
      event: 'organization:invitation_rejected',
      userIds: [String(userId), String(invitation.invitedBy || '')].filter(Boolean),
      payload: {
        invitationId: String(invitation._id),
        organizationId: String(invitation.organization),
        userId: String(userId),
        timestamp: new Date().toISOString(),
      },
    });
    return res.json({ status: 'success', message: 'Invitation rejected' });
  } catch (error) {
    next(error);
  }
};

exports.createInviteLink = async (req, res, next) => {
  try {
    if (!INVITE_LINK_SECRET) {
      return res.status(500).json({ status: 'error', message: 'INVITE_LINK_SECRET is not configured' });
    }

    const orgId = req.params.orgId;
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const branchIdRaw = req.body?.branchId || null;
    const divisionIdRaw = req.body?.divisionId || null;
    if (!orgId || !userId) {
      return orgValidation(res, 'Invalid request');
    }

    let branchContext = null;
    let divisionContext = null;
    if (branchIdRaw) {
      branchContext = await Branch.findOne({
        _id: branchIdRaw,
        organization: orgId,
        isActive: true,
      })
        .select('_id name')
        .lean();
      if (!branchContext) {
        return orgValidation(res, 'Chi nhánh không hợp lệ');
      }
    }
    if (divisionIdRaw) {
      divisionContext = await Division.findOne({
        _id: divisionIdRaw,
        organization: orgId,
        isActive: true,
      })
        .select('_id name branch')
        .lean();
      if (!divisionContext) {
        return orgValidation(res, 'Khối không hợp lệ');
      }
      if (branchContext && String(divisionContext.branch) !== String(branchContext._id)) {
        return orgValidation(res, 'Khối không thuộc chi nhánh đã chọn');
      }
      if (!branchContext) {
        branchContext = await Branch.findById(divisionContext.branch).select('_id name').lean();
      }
    }

    const token = jwt.sign(
      {
        type: 'organization_invite',
        orgId,
        createdBy: userId,
        inviteContext: {
          branchId: branchContext?._id ? String(branchContext._id) : null,
          branchName: branchContext?.name || '',
          divisionId: divisionContext?._id ? String(divisionContext._id) : null,
          divisionName: divisionContext?.name || '',
        },
      },
      INVITE_LINK_SECRET,
      { expiresIn: INVITE_LINK_EXPIRES_IN }
    );

    const frontendUrl = resolveFrontendUrl(req);
    const inviteUrl = `${frontendUrl}/organizations?orgId=${encodeURIComponent(orgId)}&inviteToken=${encodeURIComponent(
      token
    )}`;

    res.json({
      status: 'success',
      data: {
        token,
        inviteUrl,
        expiresIn: INVITE_LINK_EXPIRES_IN,
        context: {
          branchId: branchContext?._id ? String(branchContext._id) : null,
          branchName: branchContext?.name || '',
          divisionId: divisionContext?._id ? String(divisionContext._id) : null,
          divisionName: divisionContext?.name || '',
        },
      },
      message: 'Invite link generated',
    });
  } catch (error) {
    next(error);
  }
};

exports.joinViaLink = async (req, res, next) => {
  try {
    if (!INVITE_LINK_SECRET) {
      return res.status(500).json({ status: 'error', message: 'INVITE_LINK_SECRET is not configured' });
    }

    const { token } = req.body || {};
    if (!token) {
      return orgValidation(res, 'Invite token is required');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, INVITE_LINK_SECRET);
    } catch (error) {
      return orgValidation(res, 'Invalid or expired invite token');
    }

    if (decoded?.type !== 'organization_invite') {
      return orgValidation(res, 'Invalid invite token type');
    }

    if (String(decoded.orgId) !== String(req.params.orgId)) {
      return orgValidation(res, 'Invite token organization mismatch');
    }

    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) {
      return orgUnauthorized(res);
    }

    const org = await Organization.findById(req.params.orgId).lean();
    if (!org || !org.isActive) {
      return orgNotFound(res);
    }

    const inviteContext = decoded?.inviteContext || {};
    const membership = await Membership.findOneAndUpdate(
      { user: userId, organization: req.params.orgId },
      {
        user: userId,
        organization: req.params.orgId,
        role: 'member',
        status: 'active',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await ensureDefaultOrgRoles(req.params.orgId);
    await syncUserOrgRole(userId, req.params.orgId, 'member');

    await emitRealtimeEvent({
      event: 'organization:member_joined',
      userIds: await getActiveOrgUserIds(req.params.orgId),
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(userId),
        membershipId: String(membership._id),
        timestamp: new Date().toISOString(),
      },
    });

    await invalidateOrgReadCache(req.params.orgId, {
      userId: String(userId),
      eventType: ORG_EVENT_TYPES.MEMBER_JOINED,
    });

    res.json({
      status: 'success',
      data: {
        membership,
        inviteContext: {
          branchId: inviteContext?.branchId || null,
          branchName: inviteContext?.branchName || '',
          divisionId: inviteContext?.divisionId || null,
          divisionName: inviteContext?.divisionName || '',
        },
      },
      message: 'Joined organization via invite link',
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMemberRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const requesterId = req.user?.id || req.user?.userId || req.user?._id;
    const requesterMembership = await Membership.findOne({
      user: requesterId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    const requesterRole = Membership.normalizeRole(requesterMembership?.role);
    if (requesterRole === 'hr') {
        return orgAccessDenied(res, 'HR không có quyền đổi vai trò thành viên');
    }
    const normalizedRole = Membership.normalizeRole(role || 'member');
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return orgValidation(res, 'Invalid role');
    }
    const targetMembership = await Membership.findOne({
      user: req.params.userId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    if (!targetMembership) {
      return orgMemberNotFound(res);
    }
    const targetRole = Membership.normalizeRole(targetMembership.role);

    // Owner giữ toàn quyền; admin chỉ được thao tác vai trò thấp hơn.
    if (requesterRole === 'admin') {
      if (!canAdminManageTarget(targetRole)) {
        return orgAccessDenied(res, 'Admin không được đổi vai trò owner/admin');
      }
      if (['owner', 'admin'].includes(normalizedRole)) {
        return orgAccessDenied(res, 'Admin không được gán vai trò owner/admin');
      }
    }

    const membership = await Membership.findOneAndUpdate(
      { user: req.params.userId, organization: req.params.orgId },
      { role: normalizedRole },
      { new: true }
    );

    if (membership) {
      await ensureDefaultOrgRoles(req.params.orgId);
      await syncUserOrgRole(req.params.userId, req.params.orgId, normalizedRole);
    }

    await emitRealtimeEvent({
      event: 'organization:member_role_updated',
      userIds: await getActiveOrgUserIds(req.params.orgId),
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(req.params.userId),
        role: normalizedRole,
        timestamp: new Date().toISOString(),
      },
    });

    await invalidateOrgAcl(req.params.orgId, String(req.params.userId), {
      eventType: ORG_EVENT_TYPES.ROLE_UPDATED,
    });

    res.json({ status: 'success', data: membership });
  } catch (error) {
    next(error);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    const requesterId = req.user?.id || req.user?.userId || req.user?._id;
    const requesterMembership = await Membership.findOne({
      user: requesterId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    const requesterRole = Membership.normalizeRole(requesterMembership?.role);

    const targetMembership = await Membership.findOne({
      user: req.params.userId,
      organization: req.params.orgId,
      status: 'active',
    })
      .select('role')
      .lean();
    if (!targetMembership) {
      return orgMemberNotFound(res);
    }
    const targetRole = Membership.normalizeRole(targetMembership.role);

    // Chỉ owner mới có thể quản lý owner/admin. Admin chỉ được xóa role thấp hơn.
    if (requesterRole === 'admin' && !canAdminManageTarget(targetRole)) {
      return orgAccessDenied(res, 'Admin không được xóa owner/admin');
    }

    await Membership.findOneAndDelete({
      user: req.params.userId,
      organization: req.params.orgId,
    });

    await stripUserOrgRoles(req.params.userId, req.params.orgId);

    const orgUserIds = await getActiveOrgUserIds(req.params.orgId);
    const targetUserId = String(req.params.userId || '');
    if (targetUserId && !orgUserIds.includes(targetUserId)) {
      orgUserIds.push(targetUserId);
    }

    await emitRealtimeEvent({
      event: 'organization:member_removed',
      userIds: orgUserIds,
      payload: {
        organizationId: String(req.params.orgId),
        userId: String(req.params.userId),
        timestamp: new Date().toISOString(),
      },
    });

    await invalidateOrgReadCache(req.params.orgId, {
      userId: String(req.params.userId),
      eventType: ORG_EVENT_TYPES.MEMBER_REMOVED,
    });

    res.json({ status: 'success', message: 'Member removed' });
  } catch (error) {
    next(error);
  }
};

/** Người dùng tự rời tổ chức (không cần quyền admin). Chủ sở hữu duy nhất không được rời — phải xóa tổ chức hoặc chuyển quyền. */
exports.leaveOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return orgUnauthorized(res);
    }

    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    });

    if (!membership) {
      return orgMemberNotFound(res, 'Bạn không thuộc tổ chức này');
    }

    const normalizedRole = Membership.normalizeRole(membership.role);
    if (normalizedRole === 'owner') {
      const ownerCount = await Membership.countDocuments({
        organization: orgId,
        status: 'active',
        role: 'owner',
      });
      if (ownerCount <= 1) {
        return orgValidation(res, 'Bạn là chủ sở hữu duy nhất. Hãy xóa tổ chức hoặc chuyển quyền sở hữu trước khi rời.');
      }
    }

    await Membership.findOneAndDelete({ _id: membership._id });

    await stripUserOrgRoles(userId, orgId);

    const orgUserIds = await getActiveOrgUserIds(orgId);
    const leavingUserId = String(userId || '');
    if (leavingUserId && !orgUserIds.includes(leavingUserId)) {
      orgUserIds.push(leavingUserId);
    }

    await emitRealtimeEvent({
      event: 'organization:member_removed',
      userIds: orgUserIds,
      payload: {
        organizationId: String(orgId),
        userId: String(userId),
        timestamp: new Date().toISOString(),
      },
    });

    await invalidateOrgReadCache(orgId, {
      userId: String(userId),
      eventType: ORG_EVENT_TYPES.MEMBER_REMOVED,
    });

    res.json({ status: 'success', message: 'Đã rời tổ chức' });
  } catch (error) {
    next(error);
  }
};
