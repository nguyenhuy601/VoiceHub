const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const {
  orgFail,
  orgValidation,
} = require('../utils/orgApiError');
const {
  ensureDivisionRole,
  ensureDepartmentRole,
  ensureTeamRole,
} = require('../services/hierarchyRoleSync');
const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { ensureDepartmentDefaultChannels } = require('../services/departmentChannelProvision.service');

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
    const includeInactive = String(req.query?.includeInactive || '') === '1';
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
    const doc = await Branch.create({
      organization: req.params.orgId,
      name: unwrapName(req.body?.name, 'Chi nhánh mới'),
      location: String(req.body?.location || '').trim(),
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
    await bumpOrgReadCache(req.params.orgId);
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.listDivisions = async (req, res, next) => {
  try {
    const rows = await Division.find({
      organization: req.params.orgId,
      branch: req.params.branchId,
      isActive: true,
    }).sort({ createdAt: 1 });
    res.json({ status: 'success', data: rows });
  } catch (error) {
    next(error);
  }
};

exports.createDivision = async (req, res, next) => {
  try {
    const doc = await Division.create({
      organization: req.params.orgId,
      branch: req.params.branchId,
      name: unwrapName(req.body?.name, 'Khối mới'),
    });
    await ensureDivisionRole(req.params.orgId, doc._id, doc.name);
    await bumpOrgReadCache(req.params.orgId);
    res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    next(error);
  }
};

exports.updateDivision = async (req, res, next) => {
  try {
    const doc = await Division.findOneAndUpdate(
      {
        _id: req.params.divisionId,
        organization: req.params.orgId,
        isActive: true,
      },
      {
        $set: {
          name: unwrapName(req.body?.name, 'Khối mới'),
        },
      },
      { new: true }
    );
    if (!doc) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    await ensureDivisionRole(req.params.orgId, doc._id, doc.name);
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
    const doc = await Department.create({
      organization: req.params.orgId,
      branch: division.branch,
      division: division._id,
      name: unwrapName(req.body?.name, 'Phòng ban mới'),
      description: String(req.body?.description || '').trim(),
      head: req.body?.head || null,
    });
    await ensureDepartmentRole(req.params.orgId, doc._id, doc.name);
    const actorId = req.user?.id || req.user?.userId || req.user?._id || doc.head || null;
    await ensureDepartmentDefaultChannels({
      orgId: req.params.orgId,
      departmentId: doc._id,
      department: doc,
      actorId,
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
    const doc = await Team.create({
      organization: req.params.orgId,
      branch: department.branch || null,
      division: department.division || null,
      department: department._id,
      name: unwrapName(req.body?.name, 'Team mới'),
      description: String(req.body?.description || '').trim(),
      leader: req.body?.leader || null,
    });
    await ensureTeamRole(req.params.orgId, doc._id, doc.name);
    await Channel.insertMany([
      {
        name: 'general',
        type: 'chat',
        description: 'Team text chat',
        organization: req.params.orgId,
        branch: department.branch || null,
        division: department.division || null,
        department: department._id,
        team: doc._id,
        leader: req.body?.leader || null,
      },
      {
        name: 'voice',
        type: 'voice',
        description: 'Team voice channel',
        organization: req.params.orgId,
        branch: department.branch || null,
        division: department.division || null,
        department: department._id,
        team: doc._id,
        leader: req.body?.leader || null,
      },
    ]);
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateTeamByHierarchy = async (req, res, next) => {
  try {
    // Huy: mở rộng body — description, leader, department, members, isActive (archive)
    const patch = {};
    if (req.body?.name !== undefined) patch.name = unwrapName(req.body.name, 'Team');
    if (req.body?.description !== undefined) patch.description = String(req.body.description || '').trim();
    if (req.body?.leader !== undefined) patch.leader = req.body.leader || null;
    if (req.body?.department !== undefined) patch.department = req.body.department || null;
    if (req.body?.members !== undefined && Array.isArray(req.body.members)) {
      patch.members = req.body.members;
    }
    if (req.body?.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

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

    const doc = await Team.findOneAndUpdate(
      {
        _id: req.params.teamId,
        organization: req.params.orgId,
      },
      { $set: patch },
      { new: true }
    );
    if (!doc) {
      return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
    }
    if (doc.isActive !== false) {
      await ensureTeamRole(req.params.orgId, doc._id, doc.name);
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
      leader: req.body?.leader || team.leader || null,
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.createChannelByScope = async (req, res, next) => {
  try {
    const levelRaw = String(req.body?.level || '').trim().toLowerCase();
    const level = ['division', 'department', 'team'].includes(levelRaw) ? levelRaw : 'team';
    const type = allowedChannelTypes.has(String(req.body?.type || '').trim())
      ? String(req.body.type).trim()
      : 'chat';
    const actorId = req.user?.id || req.user?.userId || req.user?._id || null;

    if (level === 'team') {
      const teamId = req.body?.teamId || req.params.teamId;
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
        leader: req.body?.leader || team.leader || actorId,
      });
      await bumpOrgReadCache(req.params.orgId);
      return res.status(201).json({ status: 'success', data: doc });
    }

    if (level === 'department') {
      const departmentId = req.body?.departmentId || null;
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
        leader: req.body?.leader || actorId,
      });
      await bumpOrgReadCache(req.params.orgId);
      return res.status(201).json({ status: 'success', data: doc });
    }

    const divisionId = req.body?.divisionId || null;
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
      leader: req.body?.leader || actorId,
    });
    await bumpOrgReadCache(req.params.orgId);
    return res.status(201).json({ status: 'success', data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateChannelByScope = async (req, res, next) => {
  try {
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
