const axios = require('axios');
const { mongoose } = require('/shared/config/mongo');
const { getRedisClient, logger } = require('/shared');
const Membership = require('../models/Membership');
const JoinApplication = require('../models/JoinApplication');
const Channel = require('../models/Channel');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Server = require('../models/Server');
const Organization = require('../models/Organization');

const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();

const TASK_SERVICE_URL = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
const DOCUMENT_SERVICE_URL = (process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3010').replace(/\/$/, '');
const VOICE_SERVICE_URL = (process.env.VOICE_SERVICE_URL || 'http://voice-service:3005').replace(/\/$/, '');
const CHAT_SERVICE_URL = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
const AI_TASK_SERVICE_URL = (process.env.AI_TASK_SERVICE_URL || 'http://ai-task-service:3020').replace(/\/$/, '');
const ROLE_PERMISSION_SERVICE_URL = (process.env.ROLE_PERMISSION_SERVICE_URL || 'http://role-permission-service:3015').replace(
  /\/$/,
  ''
);

function gatewayHeaders() {
  const h = { 'Content-Type': 'application/json' };
  h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

function chatHeaders() {
  const h = { 'Content-Type': 'application/json' };
  h['x-chat-internal-token'] = CHAT_INTERNAL_TOKEN;
  return h;
}

async function purgeRemoteTasks(organizationId) {
  const url = `${TASK_SERVICE_URL}/api/tasks/internal/purge-organization/${encodeURIComponent(organizationId)}`;
  const res = await axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true });
  if (res.status !== 200) {
    throw new Error(`task-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function purgeRemoteDocuments(organizationId) {
  const url = `${DOCUMENT_SERVICE_URL}/internal/documents/purge-organization/${encodeURIComponent(organizationId)}`;
  const res = await axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true });
  if (res.status !== 200) {
    throw new Error(`document-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function purgeRemoteMeetings(organizationId) {
  const url = `${VOICE_SERVICE_URL}/api/meetings/internal/purge-organization/${encodeURIComponent(organizationId)}`;
  const res = await axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true });
  if (res.status !== 200) {
    throw new Error(`voice-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function purgeRemoteChatMessages(organizationId) {
  const url = `${CHAT_SERVICE_URL}/api/messages/internal/purge-organization-messages`;
  const res = await axios.post(
    url,
    { organizationId },
    { headers: chatHeaders(), timeout: 120000, validateStatus: () => true }
  );
  if (res.status !== 200) {
    throw new Error(`chat-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function purgeRemoteAiTaskData(organizationId) {
  const url = `${AI_TASK_SERVICE_URL}/api/ai/tasks/internal/purge-organization/${encodeURIComponent(organizationId)}`;
  const res = await axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true });
  if (res.status !== 200) {
    throw new Error(`ai-task-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function purgeRemoteRoles(organizationId) {
  const url = `${ROLE_PERMISSION_SERVICE_URL}/api/internal/roles/purge-by-server/${encodeURIComponent(organizationId)}`;
  const res = await axios.post(url, {}, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true });
  if (res.status !== 200) {
    throw new Error(`role-permission-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function purgeLocalOrganizationRecords(organizationId) {
  const oid = new mongoose.Types.ObjectId(String(organizationId));

  await Team.deleteMany({ organization: oid });
  await Channel.deleteMany({ organization: oid });
  await Department.deleteMany({ organization: oid });
  await Server.deleteMany({ organizationId: oid });
  await JoinApplication.deleteMany({ organization: oid });
  await Membership.deleteMany({ organization: oid });

  const redis = getRedisClient();
  if (redis) {
    await redis.del(`organization:${organizationId}`);
  }

  await Organization.findByIdAndDelete(oid);
}

/**
 * Xóa dữ liệu tổ chức trên mọi service + bản ghi Organization trong DB nội bộ.
 */
async function purgeOrganizationEverywhere(organizationId) {
  if (!mongoose.Types.ObjectId.isValid(String(organizationId))) {
    throw new Error('Invalid organization id');
  }
  if (!GATEWAY_INTERNAL_TOKEN) {
    throw new Error('GATEWAY_INTERNAL_TOKEN is required to purge organization data across services');
  }
  if (!CHAT_INTERNAL_TOKEN) {
    throw new Error('CHAT_INTERNAL_TOKEN is required to purge organization chat messages');
  }
  const oidStr = String(organizationId);

  await Promise.all([
    purgeRemoteTasks(oidStr),
    purgeRemoteDocuments(oidStr),
    purgeRemoteMeetings(oidStr),
    purgeRemoteChatMessages(oidStr),
    purgeRemoteAiTaskData(oidStr),
    purgeRemoteRoles(oidStr),
  ]);

  await purgeLocalOrganizationRecords(oidStr);
  logger.info(`[organizationCascadePurge] completed for ${oidStr}`);
}

module.exports = { purgeOrganizationEverywhere };
