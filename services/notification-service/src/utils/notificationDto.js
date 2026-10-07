const { unwrapPlaintext } = require('@enterprise/shared/utils/migration');

const SUMMARY_DATA_KEYS = [
  'organizationId',
  'workspaceId',
  'channelId',
  'meetingId',
  'userId',
  'friendId',
  'action',
  'kind',
  'roomId',
  'requestId',
  'requestUserId',
];

function pickSummaryData(data) {
  if (!data || typeof data !== 'object') return data || {};
  const out = {};
  for (const key of SUMMARY_DATA_KEYS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

/** Whitelist trả client: không userId (chủ sở hữu = caller), readAt, encV, __v. */
function toClientNotification(doc, options = {}) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const fields = String(options?.fields || '').trim().toLowerCase();
  const data =
    fields === 'summary' ? pickSummaryData(o.data) : o.data;

  return {
    _id: o._id,
    id: o._id,
    type: o.type,
    title: unwrapPlaintext(o.title),
    content: unwrapPlaintext(o.content),
    isRead: o.isRead,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    data,
    actionUrl: o.actionUrl ? unwrapPlaintext(o.actionUrl) : o.actionUrl,
  };
}

module.exports = { toClientNotification, pickSummaryData, SUMMARY_DATA_KEYS };
