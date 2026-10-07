const FAILED_ERROR_CODE = 'SUMMARY_GENERATION_FAILED';

function toStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [];
}

function toPublicResult(result) {
  if (!result || typeof result !== 'object') return null;
  const range = result.messageRange || {};
  return {
    overview: String(result.overview || ''),
    keyPoints: toStringList(result.keyPoints),
    actionItems: (Array.isArray(result.actionItems) ? result.actionItems : []).map((item) => ({
      title: String(item?.title || ''),
      assigneeHint: String(item?.assigneeHint || ''),
      dueDateHint: String(item?.dueDateHint || ''),
    })),
    participants: toStringList(result.participants),
    language: String(result.language || ''),
    messageRange: {
      fromMessageId: String(range.fromMessageId || ''),
      toMessageId: String(range.toMessageId || ''),
      count: Number(range.count) || 0,
    },
  };
}

function toPublicSummary(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const source = o.sourceMeta || {};
  const options = o.options || {};
  const isFailed = o.status === 'failed';
  return {
    summaryId: String(o._id),
    status: o.status,
    scope: o.scope,
    organizationId: String(o.organizationId),
    roomId: String(o.roomId),
    sourceMeta: {
      messageCount: Number(source.messageCount) || 0,
      firstMessageId: String(source.firstMessageId || ''),
      lastMessageId: String(source.lastMessageId || ''),
      exportedAt: source.exportedAt || null,
    },
    options: {
      unreadOnly: Boolean(options.unreadOnly),
      sinceMessageId: String(options.sinceMessageId || ''),
      maxMessages: Number(options.maxMessages) || 0,
    },
    result: toPublicResult(o.result),
    error: '',
    ...(isFailed ? { errorCode: FAILED_ERROR_CODE } : {}),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    expiresAt: o.expiresAt,
  };
}

module.exports = { toPublicSummary, FAILED_ERROR_CODE };
