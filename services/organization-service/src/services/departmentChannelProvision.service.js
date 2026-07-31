const Channel = require('../models/Channel');
const Department = require('../models/Department');
const { logger } = require('@enterprise/shared');
const { invalidateOrgReadCache } = require('./orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { postDepartmentWelcomeMessage } = require('../clients/chatDepartmentWelcome.client');

const DEFAULT_DEPT_CHANNEL_DEFS = [
  {
    name: 'announcements',
    description: 'Department official announcements',
    type: 'announcement',
  },
];

function buildDeptChannelSeed({ organizationId, branchId, divisionId, departmentId, leaderId }, def) {
  return {
    name: def.name,
    description: def.description,
    type: def.type,
    organization: organizationId,
    branch: branchId || null,
    division: divisionId || null,
    department: departmentId,
    team: null,
    leader: leaderId || null,
    isActive: true,
  };
}

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
 * Idempotent: ensure department-scoped general (chat) + voice channels exist.
 * Khi tạo mới kênh chat → System Bot chào (D4), fail-soft.
 * @returns {Promise<{ created: object[], existing: object[] }>}
 */
async function ensureDepartmentDefaultChannels({ orgId, departmentId, department: departmentDoc, actorId }) {
  const organizationId = String(orgId || '').trim();
  const deptId = String(departmentId || departmentDoc?._id || '').trim();
  if (!organizationId || !deptId) {
    return { created: [], existing: [] };
  }

  let department = departmentDoc;
  if (!department?.branch && !department?.division) {
    department = await Department.findOne({ _id: deptId, organization: organizationId }).lean();
  }
  if (!department) {
    return { created: [], existing: [] };
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
    const found = await Channel.findOne({
      organization: organizationId,
      department: deptId,
      team: null,
      type: def.type,
      isActive: true,
    })
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

  if (created.length) {
    await bumpOrgReadCache(organizationId);
    const newChat = created.find((c) => String(c.type) === 'chat');
    if (newChat) {
      scheduleDepartmentWelcome(organizationId, newChat, department.name || '');
    }
  }

  return { created, existing };
}

module.exports = {
  DEFAULT_DEPT_CHANNEL_DEFS,
  buildDeptChannelSeed,
  ensureDepartmentDefaultChannels,
};
