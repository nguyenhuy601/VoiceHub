const { CONVERSATION_SUMMARY_GENERATE_QUEUE } = require('@enterprise/shared/messaging/conversationSummaryEvents');
const ConversationSummary = require('../models/ConversationSummary');
const { publishJson } = require('../messaging/rabbit');
const {
  buildThreadKey,
  assertOrgChannelAccess,
  fetchOrgThreadExport,
} = require('../utils/verifySummarySource');
const { SummaryError } = require('../utils/summaryErrors');
const { parseCreateSummaryInput, parseLatestQuery } = require('../utils/summaryInput');
const { toPublicSummary } = require('../utils/summaryDto');
const {
  MAX_JOBS_PER_MINUTE,
  findInflightSummary,
  countRecentJobs,
} = require('../utils/summaryThrottle');

const CACHE_TTL_SEC = Math.max(
  60,
  parseInt(process.env.SUMMARY_CACHE_TTL_SEC || '900', 10) || 900
);

function resolveGenerateQueue() {
  return process.env.RABBITMQ_SUMMARY_GENERATE_QUEUE || CONVERSATION_SUMMARY_GENERATE_QUEUE;
}

function requireUserId(req) {
  const userId = String(req.user?.id || '').trim();
  if (!userId) throw new SummaryError('SUMMARY_USER_CONTEXT_MISSING');
  return userId;
}

function createSummaryController({
  Model = ConversationSummary,
  publish = publishJson,
  verifyAccess = assertOrgChannelAccess,
  exportThread = fetchOrgThreadExport,
  now = () => Date.now(),
} = {}) {
  function findCachedSummary(threadKey, lastMessageId) {
    if (!lastMessageId) return null;
    return Model.findOne({
      threadKey,
      'sourceMeta.lastMessageId': String(lastMessageId),
      status: 'ready',
      expiresAt: { $gt: new Date(now()) },
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  async function markQueueFailed(summaryId) {
    try {
      await Model.updateOne(
        { _id: summaryId },
        { $set: { status: 'failed', error: 'queue_unavailable' } }
      );
    } catch (err) {
      console.error('[summary-service] mark failed error', {
        code: 'SUMMARY_QUEUE_UNAVAILABLE',
        summaryId: String(summaryId),
        cause: err?.name || null,
      });
    }
  }

  async function createSummary(req, res) {
    const userId = requireUserId(req);
    const { organizationId, roomId, options } = parseCreateSummaryInput(req.body);

    await verifyAccess({ organizationId, roomId, userId });
    const exportData = await exportThread({ organizationId, roomId, userId, options });
    if (!exportData?.messageCount) throw new SummaryError('SUMMARY_NO_MESSAGES');

    const threadKey = buildThreadKey(organizationId, roomId);
    const lastMessageId = String(exportData.lastMessageId || '');

    const cached = await findCachedSummary(threadKey, lastMessageId);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: { ...toPublicSummary(cached), cached: true },
      });
    }

    const inflight = await findInflightSummary(Model, {
      threadKey,
      userId,
      lastMessageId,
      now: now(),
    });
    if (inflight) {
      return res.status(202).json({
        success: true,
        data: { summaryId: String(inflight._id), status: inflight.status, cached: false },
      });
    }

    const recentJobs = await countRecentJobs(Model, { userId, now: now() });
    if (recentJobs >= MAX_JOBS_PER_MINUTE) throw new SummaryError('SUMMARY_RATE_LIMITED');

    const summary = await Model.create({
      generatedBy: userId,
      organizationId,
      roomId,
      scope: 'org_channel',
      status: 'queued',
      threadKey,
      sourceMeta: {
        messageCount: exportData.messageCount,
        firstMessageId: exportData.firstMessageId || '',
        lastMessageId,
        exportedAt: exportData.exportedAt || new Date(now()),
      },
      options,
      expiresAt: new Date(now() + CACHE_TTL_SEC * 1000),
    });

    try {
      await publish(resolveGenerateQueue(), {
        summaryId: String(summary._id),
        organizationId,
        roomId,
        generatedBy: userId,
        options,
      });
    } catch (err) {
      await markQueueFailed(summary._id);
      throw new SummaryError('SUMMARY_QUEUE_UNAVAILABLE', { cause: err });
    }

    return res.status(202).json({
      success: true,
      data: { summaryId: String(summary._id), status: 'queued', cached: false },
    });
  }

  async function getSummaryById(req, res) {
    const userId = requireUserId(req);
    const summary = await Model.findById(req.params.id).lean();
    if (!summary) throw new SummaryError('SUMMARY_NOT_FOUND');
    if (String(summary.generatedBy) !== userId) throw new SummaryError('SUMMARY_FORBIDDEN');
    return res.json({ success: true, data: toPublicSummary(summary) });
  }

  async function getLatestSummary(req, res) {
    const userId = requireUserId(req);
    const { organizationId, roomId } = parseLatestQuery(req.query);
    await verifyAccess({ organizationId, roomId, userId });

    const summary = await Model.findOne({
      threadKey: buildThreadKey(organizationId, roomId),
      generatedBy: userId,
      status: 'ready',
      expiresAt: { $gt: new Date(now()) },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!summary) throw new SummaryError('SUMMARY_NOT_FOUND');
    return res.json({ success: true, data: toPublicSummary(summary) });
  }

  return { createSummary, getSummaryById, getLatestSummary };
}

module.exports = createSummaryController();
module.exports.createSummaryController = createSummaryController;
