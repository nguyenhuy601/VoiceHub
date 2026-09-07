const Channel = require('../models/Channel');
const Department = require('../models/Department');
const { logger } = require('@enterprise/shared');
const { invalidateOrgReadCache } = require('./orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { postDepartmentWelcomeMessage } = require('../clients/chatDepartmentWelcome.client');
const {
  DEFAULT_DEPT_CHANNEL_DEFS,
  buildDeptChannelSeed,
  buildExistingDefaultChannelQuery,
  isDepartmentDefaultAnnounceChannel,
  selectDepartmentAnnounceKeepers,
} = require('./departmentChannelProvision.logic');

async function bumpOrgReadCache(orgId) {
  return invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(
    () => null
  );
}

function scheduleDepartmentWelcome(organizationId, chatChannel, departmentName) {
  if (!chatChannel?._id) return;
  setImmediate(() => {
    postDepartmentWelcomeMessage({
      organizationId,
      roomId: String(chatChannel._id),
      departmentName,
    }).catch((err) => {
      logger.warn('[departmentChannelProvision] welcome failed:', err?.message || err);
    });
  });
}

/**
 * Soft-deactivate announce trùng trong 1 org (giữ bản cũ nhất mỗi phòng).
 * @returns {{ deactivatedIds: string[] }}
 */
async function deactivateDuplicateDepartmentAnnounceChannels(organizationId, channels) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return { deactivatedIds: [] };

  const keepers = selectDepartmentAnnounceKeepers(channels);
  const toDeactivate = (channels || []).filter((channel) => {
    if (!isDepartmentDefaultAnnounceChannel(channel)) return false;
    if (channel.isActive === false) return false;
    const id = String(channel._id || '');
    return id && !keepers.has(id);
  });

  if (!toDeactivate.length) return { deactivatedIds: [] };

  const ids = toDeactivate.map((c) => c._id).filter(Boolean);
  await Channel.updateMany(
    { _id: { $in: ids }, organization: orgId },
    { $set: { isActive: false } }
  );
  await bumpOrgReadCache(orgId);
  logger.info(
    `[departmentChannelProvision] deactivated ${ids.length} duplicate announce channel(s) org=${orgId}`
  );
  return { deactivatedIds: ids.map((id) => String(id)) };
}

/**
 * Idempotent: ensure department-scoped announcement channel exists (1 / phòng).
 * Soft-deactivate bản trùng name/type cùng phòng.
 * @returns {Promise<{ created: object[], existing: object[], deactivatedIds: string[] }>}
 */
async function ensureDepartmentDefaultChannels({ orgId, departmentId, department: departmentDoc, actorId }) {
  const organizationId = String(orgId || '').trim();
  const deptId = String(departmentId || departmentDoc?._id || '').trim();
  if (!organizationId || !deptId) {
    return { created: [], existing: [], deactivatedIds: [] };
  }

  let department = departmentDoc;
  if (!department?.branch && !department?.division) {
    department = await Department.findOne({ _id: deptId, organization: organizationId }).lean();
  }
  if (!department) {
    return { created: [], existing: [], deactivatedIds: [] };
  }

  const leaderId = actorId || department.head || null;
  const base = {
    organizationId,
    branchId: department.branch,
    divisionId: department.division,
    departmentId: department._id,
    leaderId,
  };

  const created = [];
  const existing = [];

  for (const def of DEFAULT_DEPT_CHANNEL_DEFS) {
    const found = await Channel.findOne(buildExistingDefaultChannelQuery(organizationId, deptId, def))
      .sort({ createdAt: 1 })
      .lean();

    if (found) {
      existing.push(found);
      continue;
    }

    // Legacy: general chat vẫn dùng được như announcement fallback — không tạo trùng nếu đã có general
    if (def.type === 'announcement') {
      const legacyGeneral = await Channel.findOne({
        organization: organizationId,
        department: deptId,
        team: null,
        type: 'chat',
        name: { $regex: /^general$/i },
        isActive: true,
      })
        .sort({ createdAt: 1 })
        .lean();
      if (legacyGeneral) {
        existing.push(legacyGeneral);
        continue;
      }
    }

    const doc = await Channel.create(buildDeptChannelSeed(base, def));
    created.push(doc.toObject ? doc.toObject() : doc);
  }

  const activeInDept = await Channel.find({
    organization: organizationId,
    department: deptId,
    team: null,
    isActive: true,
  })
    .sort({ createdAt: 1 })
    .lean();
  const { deactivatedIds } = await deactivateDuplicateDepartmentAnnounceChannels(
    organizationId,
    activeInDept
  );

  if (created.length) {
    await bumpOrgReadCache(organizationId);
    const welcomeChannel =
      created.find((c) => String(c.type) === 'announcement') ||
      created.find((c) => String(c.type) === 'chat') ||
      created[0];
    if (welcomeChannel) {
      scheduleDepartmentWelcome(organizationId, welcomeChannel, department.name || '');
    }
  }

  return { created, existing, deactivatedIds };
}

module.exports = {
  DEFAULT_DEPT_CHANNEL_DEFS,
  buildDeptChannelSeed,
  buildExistingDefaultChannelQuery,
  isDepartmentDefaultAnnounceChannel,
  selectDepartmentAnnounceKeepers,
  deactivateDuplicateDepartmentAnnounceChannels,
  ensureDepartmentDefaultChannels,
};
