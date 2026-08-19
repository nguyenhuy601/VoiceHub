const { mongoose } = require('@enterprise/shared/config/mongo');
const { logger } = require('@enterprise/shared');
const Channel = require('../models/Channel');
const Team = require('../models/Team');
const { invalidateOrgReadCache } = require('./orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const {
  PROJECT_CHANNEL_KINDS,
  isProjectChatChannelsEnabled,
} = require('../utils/projectChannelAcl');

const CORE_KIND_DEFS = Object.freeze([
  {
    kind: 'general',
    name: 'general',
    type: 'chat',
    description: 'Project general chat',
  },
  {
    kind: 'announcement',
    name: 'announcement',
    type: 'announcement',
    description: 'Project announcements',
  },
  {
    kind: 'cross_team',
    name: 'cross-team',
    type: 'chat',
    description: 'Cross-team project chat',
  },
]);

function toOid(raw) {
  const s = String(raw || '').trim();
  if (!s || !mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function uniqueOids(ids = []) {
  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    const oid = toOid(raw);
    if (!oid) continue;
    const key = String(oid);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(oid);
  }
  return out;
}

function coreFindFilter(organizationId, projectId, kind) {
  return {
    organization: organizationId,
    projectId,
    projectChannelKind: kind,
    isActive: true,
  };
}

function teamFindFilter(organizationId, projectId, teamId) {
  return {
    organization: organizationId,
    projectId,
    projectChannelKind: 'team',
    team: teamId,
    isActive: true,
  };
}

async function bumpOrgReadCache(orgId) {
  return invalidateOrgReadCache(orgId, { eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED }).catch(
    () => null
  );
}

async function resolveProjectNameSnapshot({ organizationId, projectId, projectTitle }) {
  const titled = String(projectTitle || '').trim();
  if (titled) return titled;
  const sibling = await Channel.findOne({
    organization: organizationId,
    projectId,
    projectChannelKind: 'general',
    isActive: true,
  })
    .select('projectName')
    .lean();
  return String(sibling?.projectName || '').trim();
}

async function ensureOneCoreChannel({
  organizationId,
  projectId,
  def,
  projectName,
  leaderId,
  writerIds,
}) {
  const found = await Channel.findOne(coreFindFilter(organizationId, projectId, def.kind)).lean();
  if (found) return { created: false, channel: found };

  const isAnnouncement = def.kind === 'announcement';
  const doc = await Channel.create({
    name: def.name,
    description: def.description,
    type: def.type,
    organization: organizationId,
    branch: null,
    division: null,
    department: null,
    team: null,
    leader: leaderId || null,
    members: isAnnouncement ? writerIds : [],
    isActive: true,
    projectId,
    projectChannelKind: def.kind,
    projectName,
    projectTeamName: '',
  });
  return { created: true, channel: doc.toObject ? doc.toObject() : doc };
}

/**
 * Idempotent: #general + #announcement + #cross-team cho một project.
 */
async function ensureProjectCoreChannels({
  organizationId,
  projectId,
  projectTitle,
  createdBy,
  writerUserIds,
}) {
  if (!isProjectChatChannelsEnabled()) {
    return { created: [], existing: [] };
  }
  const orgOid = toOid(organizationId);
  const projectOid = toOid(projectId);
  if (!orgOid || !projectOid) {
    return { created: [], existing: [] };
  }

  const leaderId = toOid(createdBy);
  const writerIds = uniqueOids([createdBy, ...(Array.isArray(writerUserIds) ? writerUserIds : [])]);
  const projectName = await resolveProjectNameSnapshot({
    organizationId: orgOid,
    projectId: projectOid,
    projectTitle,
  });

  const created = [];
  const existing = [];
  for (const def of CORE_KIND_DEFS) {
    try {
      const result = await ensureOneCoreChannel({
        organizationId: orgOid,
        projectId: projectOid,
        def,
        projectName,
        leaderId,
        writerIds,
      });
      if (result.created) created.push(result.channel);
      else existing.push(result.channel);
    } catch (err) {
      if (err?.code === 11000) {
        const found = await Channel.findOne(
          coreFindFilter(orgOid, projectOid, def.kind)
        ).lean();
        if (found) existing.push(found);
        continue;
      }
      throw err;
    }
  }

  if (created.length) await bumpOrgReadCache(String(organizationId));
  return { created, existing };
}

/**
 * Idempotent: team channel khi org Team có mặt trên project (ownerTeamId).
 * Không seed mọi team của org.
 */
async function ensureProjectTeamChannel({
  organizationId,
  projectId,
  teamId,
  projectTitle,
  createdBy,
}) {
  if (!isProjectChatChannelsEnabled()) {
    return { created: [], existing: [] };
  }
  const orgOid = toOid(organizationId);
  const projectOid = toOid(projectId);
  const teamOid = toOid(teamId);
  if (!orgOid || !projectOid || !teamOid) {
    return { created: [], existing: [] };
  }

  const teamDoc = await Team.findOne({ _id: teamOid, organization: orgOid }).select('name').lean();
  if (!teamDoc) {
    logger.warn('[projectChannelProvision] skip team channel: team not in org', {
      organizationId: String(organizationId),
      teamId: String(teamId),
    });
    return { created: [], existing: [] };
  }

  const found = await Channel.findOne(teamFindFilter(orgOid, projectOid, teamOid)).lean();
  if (found) return { created: [], existing: [found] };

  const projectName = await resolveProjectNameSnapshot({
    organizationId: orgOid,
    projectId: projectOid,
    projectTitle,
  });
  const teamName = String(teamDoc.name || '').trim() || 'team';

  try {
    const doc = await Channel.create({
      name: teamName,
      description: `Project team ${teamName}`,
      type: 'chat',
      organization: orgOid,
      branch: null,
      division: null,
      department: null,
      team: teamOid,
      leader: toOid(createdBy),
      members: [],
      isActive: true,
      projectId: projectOid,
      projectChannelKind: 'team',
      projectName,
      projectTeamName: teamName,
    });
    await bumpOrgReadCache(String(organizationId));
    return { created: [doc.toObject ? doc.toObject() : doc], existing: [] };
  } catch (err) {
    if (err?.code === 11000) {
      const again = await Channel.findOne(teamFindFilter(orgOid, projectOid, teamOid)).lean();
      return { created: [], existing: again ? [again] : [] };
    }
    throw err;
  }
}

function workgroupFindFilter(organizationId, projectId, parentTaskId) {
  return {
    organization: organizationId,
    projectId,
    projectChannelKind: 'workgroup',
    parentTaskId,
    isActive: true,
  };
}

/**
 * Idempotent: workgroup channel for a level-2 parent task.
 */
async function ensureProjectWorkGroupChannel({
  organizationId,
  projectId,
  parentTaskId,
  channelName,
  createdBy,
}) {
  if (!isProjectChatChannelsEnabled()) {
    return { created: false, channel: null };
  }
  const orgOid = toOid(organizationId);
  const projectOid = toOid(projectId);
  const parentOid = toOid(parentTaskId);
  if (!orgOid || !projectOid || !parentOid) {
    return { created: false, channel: null };
  }

  const found = await Channel.findOne(workgroupFindFilter(orgOid, projectOid, parentOid)).lean();
  if (found) return { created: false, channel: found };

  const projectName = await resolveProjectNameSnapshot({
    organizationId: orgOid,
    projectId: projectOid,
    projectTitle: '',
  });
  const name = String(channelName || '').trim() || 'workgroup';

  try {
    const doc = await Channel.create({
      name,
      description: `Work group: ${name}`,
      type: 'chat',
      organization: orgOid,
      branch: null,
      division: null,
      department: null,
      team: null,
      leader: toOid(createdBy),
      members: [],
      isActive: true,
      projectId: projectOid,
      projectChannelKind: 'workgroup',
      projectName,
      projectTeamName: '',
      parentTaskId: parentOid,
    });
    await bumpOrgReadCache(String(organizationId));
    return { created: true, channel: doc.toObject ? doc.toObject() : doc };
  } catch (err) {
    if (err?.code === 11000) {
      const again = await Channel.findOne(workgroupFindFilter(orgOid, projectOid, parentOid)).lean();
      return { created: false, channel: again };
    }
    throw err;
  }
}

async function applyChannelProvisionEvent(data) {
  const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {};
  const kind = String(payload.kind || data?.kind || '').trim().toLowerCase();
  const organizationId = data?.organizationId || payload.organizationId;
  const projectId = data?.projectId || payload.projectId;
  const projectTitle = payload.projectTitle || '';
  const createdBy = payload.createdBy || data?.userId || null;
  const writerUserIds = Array.isArray(payload.writerUserIds) ? payload.writerUserIds : [];

  if (kind === 'team') {
    return ensureProjectTeamChannel({
      organizationId,
      projectId,
      teamId: payload.teamId,
      projectTitle,
      createdBy,
    });
  }

  return ensureProjectCoreChannels({
    organizationId,
    projectId,
    projectTitle,
    createdBy,
    writerUserIds,
  });
}

module.exports = {
  PROJECT_CHANNEL_KINDS,
  CORE_KIND_DEFS,
  coreFindFilter,
  teamFindFilter,
  workgroupFindFilter,
  ensureProjectCoreChannels,
  ensureProjectTeamChannel,
  ensureProjectWorkGroupChannel,
  applyChannelProvisionEvent,
};
