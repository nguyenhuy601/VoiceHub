const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const {
  orgFail,
  orgValidation,
  orgConflict,
} = require('../utils/orgApiError');
const {
  ensureDivisionRole,
  ensureDepartmentRole,
  ensureTeamRole,
} = require('../services/hierarchyRoleSync');
const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { ensureDepartmentDefaultChannels } = require('../services/departmentChannelProvision.service');
const {
  dualWriteCreateOu,
  dualWriteSyncOuActive,
  dualWriteSyncOuLeadership,
} = require('../services/orgOuDualWrite.service');
const {
  findActiveDepartmentNameConflict,
  findActiveTeamNameConflict,
} = require('../utils/orgUnitNameConflict');
const { mongoose } = require('@enterprise/shared/config/mongo');
const { toPlainId, normalizeMemberIdList, assertActiveOrgMembers } = require('../utils/orgMemberIds');
const { assertTextLimits } = require('../utils/orgTextLimits');
const { canIncludeInactiveStructure } = require('../utils/orgElevatedAccess');

const bumpOrgReadCache = (orgId) =>
  invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(
    () => null
  );

const unwrapName = (v, fallback) => {
  const s = String(v || '').trim();
  return s || fallback;
};
const allowedChannelTypes = new Set(['chat', 'voice', 'announcement']);

exports.listBranches = async (req, res, next) => {
  try {
    // Huy: cho phép ?includeInactive=1 để admin xem chi nhánh đã vô hiệu
    const includeInactive = await canIncludeInactiveStructure(req);
    const filter = { organization: req.params.orgId };
    if (!includeInactive) filter.isActive = true;
    const rows = await Branch.find(filter).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createBranch = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name, description: req.body?.location });
    const doc = await Branch.create({
      organization: req.params.orgId,
      name: unwrapName(req.body?.name, 'Chi nhánh mới'),
      location: String(req.body?.location || '').trim(),
    });
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'branch',
      legacyCollection: 'Branch',
      legacyDoc: doc,
    });
    await bumpOrgReadCache(req.params.orgId);
    res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    next(error);
  }
};

/** Huy: Cập nhật / vô hiệu hóa chi nhánh (cùng resource branches — domain Cơ cấu tổ chức). */
exports.updateBranch = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name, description: req.body?.location });
    const patch = {};
    if (req.body?.name !== undefined) patch.name = unwrapName(req.body.name, 'Chi nhánh');
    if (req.body?.location !== undefined) patch.location = String(req.body.location || '').trim();
    if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

    const doc = await Branch.findOneAndUpdate(
      { _id: req.params.branchId, organization: req.params.orgId },
      { $set: patch },
      { new: true }
    );
    if (!doc) {
      return orgFail(res, 404, 'Branch not found', 'ORG_NOT_FOUND');
    }
    if (patch.isActive !== undefined) {
      await dualWriteSyncOuActive(req.params.orgId, 'Branch', doc._id, doc.isActive !== false);
    }
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listDivisions = async (req, res, next) => {
  try {
    const query = {
      organization: req.params.orgId,
      isActive: true,
    };
    if (req.params.branchId) {
      query.branch = req.params.branchId;
    }
    const rows = await Division.find(query).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createDivision = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name });
    const rawBranch = req.params.branchId || req.body?.branchId;
    const branchParam = typeof rawBranch === 'string' ? rawBranch.trim() : '';
    const branchId =
      branchParam && branchParam !== '_' && branchParam !== 'root' ? toPlainId(branchParam) : null;
    if (branchId) {
      const branch = await Branch.findOne({
        _id: branchId,
        organization: req.params.orgId,
        isActive: { $ne: false },
      }).lean();
      if (!branch) {
        return orgFail(res, 404, 'Branch not found', 'ORG_NOT_FOUND');
      }
    }
    const doc = await Division.create({
      organization: req.params.orgId,
      branch: branchId,
      name: unwrapName(req.body?.name, 'Khối mới'),
    });
    await ensureDivisionRole(req.params.orgId, doc._id, doc.name);
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'division',
      legacyCollection: 'Division',
      legacyDoc: doc,
      parentLegacy: branchId ? { collection: 'Branch', id: branchId } : null,
    });
    await bumpOrgReadCache(req.params.orgId);
    res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    next(error);
  }
};

/** Huy: Cập nhật / vô hiệu hóa khối (parity updateBranch — domain Cơ cấu tổ chức). */
exports.updateDivision = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name });
    const patch = {};
    if (req.body?.name !== undefined) patch.name = unwrapName(req.body.name, 'Khối mới');
    if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);
    if (!Object.keys(patch).length) {
      return orgFail(res, 400, 'No fields to update', 'ORG_VALIDATION');
    }

    const doc = await Division.findOneAndUpdate(
      { _id: req.params.divisionId, organization: req.params.orgId },
      { $set: patch },
      { new: true }
    );
    if (!doc) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    if (doc.isActive !== false) {
      await ensureDivisionRole(req.params.orgId, doc._id, doc.name);
    }
    if (patch.isActive !== undefined) {
      await dualWriteSyncOuActive(req.params.orgId, 'Division', doc._id, doc.isActive !== false);
    }
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listDepartmentsByDivision = async (req, res, next) => {
  try {
    const rows = await Department.find({
      organization: req.params.orgId,
      division: req.params.divisionId,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createDepartmentByDivision = async (req, res, next) => {
  try {
    const division = await Division.findOne({
      _id: req.params.divisionId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!division) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const head = toPlainId(req.body?.head);
    if (head) await assertActiveOrgMembers(req.params.orgId, [head]);
    const name = unwrapName(req.body?.name, 'Phòng ban mới');
    const conflict = await findActiveDepartmentNameConflict({
      organizationId: req.params.orgId,
      divisionId: division._id,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Phòng ban cùng tên đã tồn tại trong khối này', 'ORG_DEPARTMENT_NAME_EXISTS');
    }
    const doc = await Department.create({
      organization: req.params.orgId,
      branch: division.branch || null,
      division: division._id,
      name,
      description: String(req.body?.description || '').trim(),
      head,
    });
    await ensureDepartmentRole(req.params.orgId, doc._id, doc.name);
    const actorId = req.user?.id || req.user?.userId || req.user?._id || doc.head || null;
    await ensureDepartmentDefaultChannels({
      orgId: req.params.orgId,
      departmentId: doc._id,
      department: doc,
      actorId,
    });
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'department',
      legacyCollection: 'Department',
      legacyDoc: doc,
      parentLegacy: { collection: 'Division', id: division._id },
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

/** Huy: Tạo phòng ban gốc (template không có division). */
exports.createDepartmentRoot = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const head = toPlainId(req.body?.head);
    if (head) await assertActiveOrgMembers(req.params.orgId, [head]);
    const name = unwrapName(req.body?.name, 'Phòng ban mới');
    const conflict = await findActiveDepartmentNameConflict({
      organizationId: req.params.orgId,
      divisionId: null,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Phòng ban cùng tên đã tồn tại', 'ORG_DEPARTMENT_NAME_EXISTS');
    }
    const doc = await Department.create({
      organization: req.params.orgId,
      branch: null,
      division: null,
      name,
      description: String(req.body?.description || '').trim(),
      head,
    });
    await ensureDepartmentRole(req.params.orgId, doc._id, doc.name);
    const actorId = req.user?.id || req.user?.userId || req.user?._id || doc.head || null;
    await ensureDepartmentDefaultChannels({
      orgId: req.params.orgId,
      departmentId: doc._id,
      department: doc,
      actorId,
    });
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'department',
      legacyCollection: 'Department',
      legacyDoc: doc,
      parentLegacy: null,
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listTeamsByDepartment = async (req, res, next) => {
  try {
    const rows = await Team.find({
      organization: req.params.orgId,
      department: req.params.deptId,
      isActive: true,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createTeamByDepartment = async (req, res, next) => {
  try {
    const department = await Department.findOne({
      _id: req.params.deptId,
      organization: req.params.orgId,
    }).lean();
    if (!department) {
      return orgFail(res, 404, 'Department not found', 'ORG_NOT_FOUND');
    }
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const leader = toPlainId(req.body?.leader);
    if (leader) await assertActiveOrgMembers(req.params.orgId, [leader]);
    const name = unwrapName(req.body?.name, 'Team mới');
    const conflict = await findActiveTeamNameConflict({
      organizationId: req.params.orgId,
      departmentId: department._id,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Team cùng tên đã tồn tại trong phòng ban này', 'ORG_TEAM_NAME_EXISTS');
    }
    const doc = await Team.create({
      organization: req.params.orgId,
      branch: department.branch || null,
      division: department.division || null,
      department: department._id,
      name,
      description: String(req.body?.description || '').trim(),
      leader,
      isActive: true,
    });
    await ensureTeamRole(req.params.orgId, doc._id, doc.name);
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'team',
      legacyCollection: 'Team',
      legacyDoc: doc,
      parentLegacy: { collection: 'Department', id: department._id },
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

/** Huy: Tạo team dưới division (template product/outsourcing — không có department). */
exports.createTeamByDivision = async (req, res, next) => {
  try {
    const division = await Division.findOne({
      _id: req.params.divisionId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!division) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const leader = toPlainId(req.body?.leader);
    if (leader) await assertActiveOrgMembers(req.params.orgId, [leader]);
    const name = unwrapName(req.body?.name, 'Team mới');
    const conflict = await findActiveTeamNameConflict({
      organizationId: req.params.orgId,
      divisionId: division._id,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Team cùng tên đã tồn tại trong khối này', 'ORG_TEAM_NAME_EXISTS');
    }
    const doc = await Team.create({
      organization: req.params.orgId,
      branch: division.branch || null,
      division: division._id,
      department: null,
      name,
      description: String(req.body?.description || '').trim(),
      leader,
      isActive: true,
    });
    await ensureTeamRole(req.params.orgId, doc._id, doc.name);
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'team',
      legacyCollection: 'Team',
      legacyDoc: doc,
      parentLegacy: { collection: 'Division', id: division._id },
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

/** Huy: Tạo team gốc (template startup — chỉ team). */
exports.createTeamRoot = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const leader = toPlainId(req.body?.leader);
    if (leader) await assertActiveOrgMembers(req.params.orgId, [leader]);
    const name = unwrapName(req.body?.name, 'Team mới');
    const conflict = await findActiveTeamNameConflict({
      organizationId: req.params.orgId,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Team cùng tên đã tồn tại', 'ORG_TEAM_NAME_EXISTS');
    }
    const doc = await Team.create({
      organization: req.params.orgId,
      branch: null,
      division: null,
      department: null,
      name,
      description: String(req.body?.description || '').trim(),
      leader,
      isActive: true,
    });
    await ensureTeamRole(req.params.orgId, doc._id, doc.name);
    await dualWriteCreateOu(req.params.orgId, {
      levelKey: 'team',
      legacyCollection: 'Team',
      legacyDoc: doc,
      parentLegacy: null,
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateTeamByHierarchy = async (req, res, next) => {
  try {
    // Huy: mở rộng body — description, leader, department, members, isActive (archive)
    const orgId = req.params.orgId;
    const body = req.body || {};
    const hasDelta = body.membersAdd !== undefined || body.membersRemove !== undefined;
    if (hasDelta && body.members !== undefined) {
      return orgFail(
        res,
        400,
        'Không gửi đồng thời members với membersAdd/membersRemove.',
        'ORG_MEMBERS_PATCH_CONFLICT'
      );
    }
    assertTextLimits({ name: body.name, description: body.description });

    const patch = {};
    if (body.name !== undefined) patch.name = unwrapName(body.name, 'Team');
    if (body.description !== undefined) patch.description = String(body.description || '').trim();
    if (body.leader !== undefined) {
      patch.leader = toPlainId(body.leader);
      if (patch.leader) await assertActiveOrgMembers(orgId, [patch.leader]);
    }
    if (body.department !== undefined) patch.department = toPlainId(body.department);
    if (body.members !== undefined && Array.isArray(body.members)) {
      patch.members = normalizeMemberIdList(body.members);
      await assertActiveOrgMembers(orgId, patch.members);
    }
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);

    const membersAdd = hasDelta ? normalizeMemberIdList(body.membersAdd) : [];
    const membersRemove = hasDelta ? normalizeMemberIdList(body.membersRemove) : [];
    if (membersAdd.length) await assertActiveOrgMembers(orgId, membersAdd);

    if (patch.department) {
      const department = await Department.findOne({
        _id: patch.department,
        organization: req.params.orgId,
      }).lean();
      if (!department) {
        return orgFail(res, 404, 'Department not found', 'ORG_NOT_FOUND');
      }
      patch.branch = department.branch || null;
      patch.division = department.division || null;
    }

    const teamFilter = { _id: req.params.teamId, organization: orgId };
    let previousMembers = null;
    if (patch.members !== undefined) {
      const previousTeam = await Team.findOne(teamFilter).select('members').lean();
      previousMembers = previousTeam?.members || [];
    } else if (membersAdd.length || membersRemove.length) {
      // Pipeline update: thêm/bớt nguyên tử, không ghi đè thay đổi đồng thời của admin khác.
      const toOids = (ids) => ids.map((id) => new mongoose.Types.ObjectId(id));
      const beforeDelta = await Team.findOneAndUpdate(
        teamFilter,
        [
          {
            $set: {
              members: {
                $setDifference: [
                  { $setUnion: [{ $ifNull: ['$members', []] }, toOids(membersAdd)] },
                  toOids(membersRemove),
                ],
              },
            },
          },
        ],
        { new: false, projection: { members: 1 }, updatePipeline: true }
      ).lean();
      if (!beforeDelta) {
        return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
      }
      previousMembers = beforeDelta.members || [];
    }

    const doc = Object.keys(patch).length
      ? await Team.findOneAndUpdate(teamFilter, { $set: patch }, { new: true })
      : await Team.findOne(teamFilter);
    if (!doc) {
      return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
    }
    if (doc.isActive !== false) {
      await ensureTeamRole(orgId, doc._id, doc.name);
    }
    if (previousMembers !== null) {
      const {
        syncTeamHierarchyRolesFromMemberChange,
      } = require('../clients/hierarchyRoleAssign.client');
      await syncTeamHierarchyRolesFromMemberChange(
        orgId,
        doc._id,
        doc.name,
        previousMembers,
        doc.members || []
      ).catch(() => null);
    }
    if (patch.isActive !== undefined) {
      await dualWriteSyncOuActive(req.params.orgId, 'Team', doc._id, doc.isActive !== false);
    }
    if (patch.leader !== undefined) {
      await dualWriteSyncOuLeadership(req.params.orgId, 'Team', doc._id, {
        leaderUserId: doc.leader || null,
      });
    }
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listChannelsByTeam = async (req, res, next) => {
  try {
    const rows = await Channel.find({
      organization: req.params.orgId,
      team: req.params.teamId,
      isActive: true,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createChannelByTeam = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const team = await Team.findOne({
      _id: req.params.teamId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!team) {
      return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
    }
    const doc = await Channel.create({
      organization: req.params.orgId,
      branch: team.branch || null,
      division: team.division || null,
      department: team.department,
      team: team._id,
      name: unwrapName(req.body?.name, 'kênh-mới'),
      description: String(req.body?.description || '').trim(),
      type: ['chat', 'voice', 'announcement'].includes(req.body?.type) ? req.body.type : 'chat',
      leader: toPlainId(req.body?.leader) || team.leader || null,
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.createChannelByScope = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name, description: req.body?.description });
    const levelRaw = String(req.body?.level || '').trim().toLowerCase();
    const level = ['division', 'department', 'team'].includes(levelRaw) ? levelRaw : 'team';
    const type = allowedChannelTypes.has(String(req.body?.type || '').trim())
      ? String(req.body.type).trim()
      : 'chat';
    const actorId = req.user?.id || req.user?.userId || req.user?._id || null;

    if (level === 'team') {
      const teamId = toPlainId(req.body?.teamId) || req.params.teamId;
      if (!teamId) {
        return orgValidation(res, 'teamId is required');
      }
      const team = await Team.findOne({
        _id: teamId,
        organization: req.params.orgId,
        isActive: true,
      }).lean();
      if (!team) {
        return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
      }
      const doc = await Channel.create({
        organization: req.params.orgId,
        branch: team.branch || null,
        division: team.division || null,
        department: team.department || null,
        team: team._id,
        name: unwrapName(req.body?.name, 'kênh-mới'),
        description: String(req.body?.description || '').trim(),
        type,
        leader: toPlainId(req.body?.leader) || team.leader || actorId,
      });
      await bumpOrgReadCache(req.params.orgId);
      return res.status(201).json({ status: 'success', data: doc });
    }

    if (level === 'department') {
      const departmentId = toPlainId(req.body?.departmentId);
      if (!departmentId) {
        return orgValidation(res, 'departmentId is required');
      }
      const department = await Department.findOne({
        _id: departmentId,
        organization: req.params.orgId,
      }).lean();
      if (!department) {
        return orgFail(res, 404, 'Department not found', 'ORG_NOT_FOUND');
      }

      const rawName = String(req.body?.name || '').trim().toLowerCase();
      const isDefaultDeptChannel =
        (type === 'chat' && (!rawName || rawName === 'general')) ||
        (type === 'voice' && (!rawName || rawName === 'voice'));

      if (isDefaultDeptChannel) {
        const { created, existing } = await ensureDepartmentDefaultChannels({
          orgId: req.params.orgId,
          departmentId,
          department,
          actorId,
        });
        const pool = [...existing, ...created].filter((row) => String(row.type) === type);
        const doc = pool[0];
        if (!doc) {
          return orgFail(res, 500, 'Failed to provision department channel', 'ORG_INTERNAL');
        }
        const status = created.length ? 201 : 200;
        return res.status(status).json({ status: 'success', data: doc });
      }

      const doc = await Channel.create({
        organization: req.params.orgId,
        branch: department.branch || null,
        division: department.division || null,
        department: department._id,
        team: null,
        name: unwrapName(req.body?.name, 'kênh-mới'),
        description: String(req.body?.description || '').trim(),
        type,
        leader: toPlainId(req.body?.leader) || actorId,
      });
      await bumpOrgReadCache(req.params.orgId);
      return res.status(201).json({ status: 'success', data: doc });
    }

    const divisionId = toPlainId(req.body?.divisionId);
    if (!divisionId) {
      return orgValidation(res, 'divisionId is required');
    }
    const division = await Division.findOne({
      _id: divisionId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!division) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    const doc = await Channel.create({
      organization: req.params.orgId,
      branch: division.branch || null,
      division: division._id,
      department: null,
      team: null,
      name: unwrapName(req.body?.name, 'kênh-mới'),
      description: String(req.body?.description || '').trim(),
      type,
      leader: toPlainId(req.body?.leader) || actorId,
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateChannelByScope = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name });
    const doc = await Channel.findOneAndUpdate(
      {
        _id: req.params.channelId,
        organization: req.params.orgId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'kênh-mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateChannelByTeam = async (req, res, next) => {
  try {
    assertTextLimits({ name: req.body?.name });
    const doc = await Channel.findOneAndUpdate(
      {
        _id: req.params.channelId,
        organization: req.params.orgId,
        team: req.params.teamId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'kênh-mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

function isProtectedDefaultChannel(channel) {
  if (!channel) return true;
  const name = String(channel.name || '').trim().toLowerCase();
  const type = String(channel.type || 'chat').trim().toLowerCase();
  if (type === 'voice') return name === 'voice';
  return name === 'general';
}

exports.deleteChannelByScope = async (req, res, next) => {
  try {
    const channel = await Channel.findOne({
      _id: req.params.channelId,
      organization: req.params.orgId,
      isActive: true,
    }).lean();
    if (!channel) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }
    if (isProtectedDefaultChannel(channel)) {
      return orgValidation(res, 'Cannot delete default channel');
    }
    await Channel.findOneAndUpdate({ _id: channel._id }, { isActive: false }, { new: true });
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', message: 'Channel deleted' });
  } catch (error) {
    return next(error);
  }
};
