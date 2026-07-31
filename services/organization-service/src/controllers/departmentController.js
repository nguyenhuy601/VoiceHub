const Department = require('../models/Department');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const { ensureDepartmentRole } = require('../services/hierarchyRoleSync');
const { ensureDepartmentDefaultChannels } = require('../services/departmentChannelProvision.service');
const { findActiveDepartmentNameConflict } = require('../utils/orgUnitNameConflict');
const { orgConflict } = require('../utils/orgApiError');

exports.getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find({ organization: req.params.orgId });

    res.json({ status: 'success', data: departments });
  } catch (error) {
    next(error);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name, description, head } = req.body;
    let branchId = req.body?.branch || null;
    let divisionId = req.body?.division || null;

    if (!branchId || !divisionId) {
      const defaultBranch = await Branch.findOne({
        organization: req.params.orgId,
        isActive: true,
      })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean();
      if (defaultBranch && !branchId) branchId = defaultBranch._id;
      if (!divisionId && defaultBranch) {
        const defaultDivision = await Division.findOne({
          organization: req.params.orgId,
          branch: defaultBranch._id,
          isActive: true,
        })
          .sort({ isDefault: -1, createdAt: 1 })
          .lean();
        if (defaultDivision) divisionId = defaultDivision._id;
      }
    }

    const conflict = await findActiveDepartmentNameConflict({
      organizationId: req.params.orgId,
      divisionId: divisionId || null,
      name,
    });
    if (conflict) {
      return orgConflict(res, 'Phòng ban cùng tên đã tồn tại trong khối này', 'ORG_DEPARTMENT_NAME_EXISTS');
    }

    const department = await Department.create({
      name,
      description,
      organization: req.params.orgId,
      branch: branchId,
      division: divisionId,
      head: null,
      members: [],
    });
    await ensureDepartmentRole(req.params.orgId, department._id, department.name);
    const actorId = req.user?.id || req.user?.userId || req.user?._id || null;
    if (head) {
      const { setHead } = require('../services/departmentMembership.service');
      await setHead(req.params.orgId, department._id, head, { actorUserId: actorId }).catch(() => null);
    }
    await ensureDepartmentDefaultChannels({
      orgId: req.params.orgId,
      departmentId: department._id,
      department,
      actorId: actorId || head || null,
    });

    const refreshed = await Department.findById(department._id);
    res.status(201).json({ status: 'success', data: refreshed || department });
  } catch (error) {
    next(error);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    // Huy: mở rộng patch — division (phòng ban cha), members / membersAdd, head, isActive
    const { name, description, head, division, members, membersAdd, isActive } = req.body || {};
    const orgId = req.params.orgId;
    const deptId = req.params.id;
    const actorUserId = req.user?.id || req.user?.userId || req.user?._id || null;

    const {
      setMembers,
      addMembers,
      setHead,
    } = require('../services/departmentMembership.service');

    const applyMembershipError = (error) => {
      if (error.statusCode === 409) {
        return orgConflict(res, error.message, error.errorCode || 'DEPT_MEMBERSHIP_CONFLICT');
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ status: 'fail', message: error.message });
      }
      return null;
    };

    // membersAdd = merge (Transfer/Assign); members = replace đầy đủ (DeptMembersPanel).
    if (Array.isArray(membersAdd) && membersAdd.length) {
      try {
        await addMembers(orgId, deptId, membersAdd, { actorUserId });
      } catch (error) {
        const handled = applyMembershipError(error);
        if (handled) return handled;
        throw error;
      }
    } else if (members !== undefined && Array.isArray(members)) {
      try {
        await setMembers(orgId, deptId, members, { actorUserId });
      } catch (error) {
        const handled = applyMembershipError(error);
        if (handled) return handled;
        throw error;
      }
    }
    if (head !== undefined) {
      try {
        await setHead(orgId, deptId, head || null, { actorUserId });
      } catch (error) {
        if (error.statusCode === 409) {
          return orgConflict(res, error.message, error.errorCode || 'DEPT_MEMBERSHIP_CONFLICT');
        }
        if (error.statusCode === 404) {
          return res.status(404).json({ status: 'fail', message: error.message });
        }
        throw error;
      }
    }

    const patch = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (isActive !== undefined) patch.isActive = Boolean(isActive);

    if (division !== undefined) {
      const Division = require('../models/Division');
      const div = await Division.findOne({
        _id: division,
        organization: orgId,
        isActive: true,
      }).lean();
      if (!div) {
        return res.status(404).json({ status: 'fail', message: 'Division not found' });
      }
      patch.division = div._id;
      patch.branch = div.branch || null;
    }

    let department;
    if (Object.keys(patch).length) {
      department = await Department.findOneAndUpdate(
        { _id: deptId, organization: orgId },
        patch,
        { new: true }
      );
    } else {
      department = await Department.findOne({ _id: deptId, organization: orgId });
    }

    if (!department) {
      return res.status(404).json({ status: 'fail', message: 'Department not found' });
    }
    if (department.isActive !== false) {
      await ensureDepartmentRole(orgId, department._id, department.name);
    }
    if (req.body?.isActive !== undefined) {
      const { dualWriteSyncOuActive } = require('../services/orgOuDualWrite.service');
      await dualWriteSyncOuActive(
        orgId,
        'Department',
        department._id,
        department.isActive !== false
      );
    }

    const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
    const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
    await invalidateOrgReadCache(orgId, {
      eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED,
    }).catch(() => null);

    res.json({ status: 'success', data: department });
  } catch (error) {
    next(error);
  }
};

exports.deleteDepartment = async (req, res, next) => {
  try {
    const department = await Department.findOneAndUpdate(
      { _id: req.params.id, organization: req.params.orgId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!department) {
      return res.status(404).json({ status: 'error', message: 'Department not found' });
    }
    const orgId = req.params.orgId;
    try {
      const { dualWriteSyncOuActive } = require('../services/orgOuDualWrite.service');
      await dualWriteSyncOuActive(orgId, 'Department', department._id, false);
      const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
      const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
      await invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(
        () => null
      );
    } catch (e) {
      console.warn('[deleteDepartment] OU sync:', e.message);
    }
    res.json({ status: 'success', message: 'Department disabled', data: department });
  } catch (error) {
    next(error);
  }
};
