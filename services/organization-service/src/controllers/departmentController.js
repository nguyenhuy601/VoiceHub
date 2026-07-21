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
      head,
    });
    await ensureDepartmentRole(req.params.orgId, department._id, department.name);
    const actorId = req.user?.id || req.user?.userId || req.user?._id || department.head || null;
    await ensureDepartmentDefaultChannels({
      orgId: req.params.orgId,
      departmentId: department._id,
      department,
      actorId,
    });

    res.status(201).json({ status: 'success', data: department });
  } catch (error) {
    next(error);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    // Huy: mở rộng patch — division (phòng ban cha), members (điều chuyển), head, isActive (vô hiệu)
    const { name, description, head, division, members, isActive } = req.body || {};
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (head !== undefined) patch.head = head || null;
    if (members !== undefined && Array.isArray(members)) patch.members = members;
    if (isActive !== undefined) patch.isActive = Boolean(isActive);

    if (division !== undefined) {
      const Division = require('../models/Division');
      const div = await Division.findOne({
        _id: division,
        organization: req.params.orgId,
        isActive: true,
      }).lean();
      if (!div) {
        return res.status(404).json({ status: 'fail', message: 'Division not found' });
      }
      patch.division = div._id;
      patch.branch = div.branch || null;
    }

    const department = await Department.findOneAndUpdate(
      { _id: req.params.id, organization: req.params.orgId },
      patch,
      { new: true }
    );
    if (!department) {
      return res.status(404).json({ status: 'fail', message: 'Department not found' });
    }
    if (department.isActive !== false) {
      await ensureDepartmentRole(req.params.orgId, department._id, department.name);
    }
    if (req.body?.isActive !== undefined) {
      const { dualWriteSyncOuActive } = require('../services/orgOuDualWrite.service');
      await dualWriteSyncOuActive(
        req.params.orgId,
        'Department',
        department._id,
        department.isActive !== false
      );
    }
    if (head !== undefined) {
      const { dualWriteSyncOuLeadership } = require('../services/orgOuDualWrite.service');
      await dualWriteSyncOuLeadership(req.params.orgId, 'Department', department._id, {
        headUserId: department.head || null,
      });
    }

    const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
    const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
    await invalidateOrgReadCache(req.params.orgId, {
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
