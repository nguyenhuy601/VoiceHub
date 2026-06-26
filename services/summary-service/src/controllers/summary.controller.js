const { CONVERSATION_SUMMARY_GENERATE_QUEUE } = require('@enterprise/shared/messaging/conversationSummaryEvents');
const ConversationSummary = require('../models/ConversationSummary');
const { publishJson } = require('../messaging/rabbit');
const {
  buildThreadKey,
  assertOrgChannelAccess,
  fetchOrgThreadExport,
} = require('../utils/verifySummarySource');

const CACHE_TTL_SEC = Math.max(
  60,
  parseInt(process.env.SUMMARY_CACHE_TTL_SEC || '900', 10) || 900
);
const DEFAULT_MAX_MESSAGES = Math.min(
  Math.max(parseInt(process.env.SUMMARY_DEFAULT_MAX_MESSAGES || '200', 10) || 200, 1),
  500
);

function fail(res, status, message, errorCode) {
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    messageUser: message,
  });
}

function toPublicSummary(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    summaryId: String(o._id),
    status: o.status,
    scope: o.scope,
    organizationId: String(o.organizationId),
    roomId: String(o.roomId),
    sourceMeta: o.sourceMeta,
    options: o.options,
    result: o.result,
    modelMeta: o.modelMeta,
    error: o.error || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    expiresAt: o.expiresAt,
  };
}

async function findCachedSummary(threadKey, lastMessageId) {
  if (!lastMessageId) return null;
  return ConversationSummary.findOne({
    threadKey,
    'sourceMeta.lastMessageId': String(lastMessageId),
    status: 'ready',
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
}

class SummaryController {
  async createSummary(req, res) {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'SUMMARY_USER_CONTEXT_MISSING');

    const { scope, organizationId, roomId, options: rawOptions } = req.body || {};
    if (scope && scope !== 'org_channel') {
      return fail(res, 400, 'MVP chỉ hỗ trợ scope org_channel', 'SUMMARY_SCOPE_UNSUPPORTED');
    }
    if (!organizationId || !roomId) {
      return fail(res, 400, 'organizationId và roomId là bắt buộc', 'SUMMARY_BAD_REQUEST');
    }

    const options = {
      unreadOnly: Boolean(rawOptions?.unreadOnly),
      sinceMessageId: rawOptions?.sinceMessageId ? String(rawOptions.sinceMessageId) : '',
      maxMessages: Math.min(
        Math.max(parseInt(rawOptions?.maxMessages, 10) || DEFAULT_MAX_MESSAGES, 1),
        500
      ),
    };

    try {
      await assertOrgChannelAccess({ organizationId, roomId, userId });
    } catch (verifyErr) {
      const status = Number(verifyErr?.statusCode) || 403;
      return fail(
        res,
        status,
        verifyErr.message || 'Forbidden',
        verifyErr.errorCode || 'SUMMARY_FORBIDDEN'
      );
    }

    let exportData;
    try {
      exportData = await fetchOrgThreadExport({
        organizationId,
        roomId,
        userId,
        options,
      });
    } catch (exportErr) {
      const status = Number(exportErr?.statusCode) || 502;
      return fail(res, status, 'Không thể tải lịch sử hội thoại', 'SUMMARY_EXPORT_FAILED');
    }

    if (!exportData?.messageCount) {
      return fail(res, 422, 'Không có tin nhắn để tóm tắt', 'SUMMARY_NO_MESSAGES');
    }

    const threadKey = buildThreadKey(organizationId, roomId);
    const cached = await findCachedSummary(threadKey, exportData.lastMessageId);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: { ...toPublicSummary(cached), cached: true },
      });
    }

    const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
    const summary = await ConversationSummary.create({
      generatedBy: userId,
      organizationId,
      roomId,
      scope: 'org_channel',
      status: 'queued',
      threadKey,
      sourceMeta: {
        messageCount: exportData.messageCount,
        firstMessageId: exportData.firstMessageId || '',
        lastMessageId: exportData.lastMessageId || '',
        exportedAt: exportData.exportedAt || new Date(),
      },
      options,
      expiresAt,
    });

    const queue = process.env.RABBITMQ_SUMMARY_GENERATE_QUEUE || CONVERSATION_SUMMARY_GENERATE_QUEUE;
    await publishJson(queue, {
      summaryId: String(summary._id),
      organizationId: String(organizationId),
      roomId: String(roomId),
      generatedBy: String(userId),
      options,
    });

    return res.status(202).json({
      success: true,
      data: {
        summaryId: String(summary._id),
        status: 'queued',
        cached: false,
      },
    });
  }

  async getSummaryById(req, res) {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'SUMMARY_USER_CONTEXT_MISSING');

    const summary = await ConversationSummary.findById(req.params.id).lean();
    if (!summary) return fail(res, 404, 'Không tìm thấy bản tóm tắt', 'SUMMARY_NOT_FOUND');
    if (String(summary.generatedBy) !== String(userId)) {
      return fail(res, 403, 'Bạn không có quyền truy cập bản tóm tắt này', 'SUMMARY_FORBIDDEN');
    }

    return res.json({
      success: true,
      data: toPublicSummary(summary),
    });
  }

  async getLatestSummary(req, res) {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'SUMMARY_USER_CONTEXT_MISSING');

    const { organizationId, roomId } = req.query || {};
    if (!organizationId || !roomId) {
      return fail(res, 400, 'organizationId và roomId là bắt buộc', 'SUMMARY_BAD_REQUEST');
    }

    try {
      await assertOrgChannelAccess({ organizationId, roomId, userId });
    } catch (verifyErr) {
      const status = Number(verifyErr?.statusCode) || 403;
      return fail(res, status, verifyErr.message || 'Forbidden', 'SUMMARY_FORBIDDEN');
    }

    const threadKey = buildThreadKey(organizationId, roomId);
    const summary = await ConversationSummary.findOne({
      threadKey,
      generatedBy: userId,
      status: 'ready',
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!summary) {
      return fail(res, 404, 'Chưa có bản tóm tắt', 'SUMMARY_NOT_FOUND');
    }

    return res.json({
      success: true,
      data: toPublicSummary(summary),
    });
  }
}

module.exports = new SummaryController();
