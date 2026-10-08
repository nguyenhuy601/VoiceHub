const { unwrapPlaintext } = require('@enterprise/shared/utils/migration');
const { toPublicPoll } = require('./pollPolicy');

function slimFileMeta(fileMeta) {
  if (!fileMeta || typeof fileMeta !== 'object') return undefined;
  const out = {};
  if (fileMeta.originalName) out.originalName = fileMeta.originalName;
  if (fileMeta.mimeType) out.mimeType = fileMeta.mimeType;
  if (fileMeta.byteSize != null) out.byteSize = fileMeta.byteSize;
  // Client cần storagePath để tải qua GET /messages/storage/object (MinIO) hoặc attach signed URL (Firebase).
  if (fileMeta.storagePath) out.storagePath = fileMeta.storagePath;
  return Object.keys(out).length ? out : undefined;
}

const CLIENT_MESSAGE_FULL_FIELDS = [
  '_id', 'senderId', 'senderDisplayName', 'content', 'messageType',
  'roomId', 'organizationId', 'receiverId', 'conversationId', 'createdAt', 'updatedAt',
  'isRead', 'readAt', 'replyToMessageId', 'isDeleted', 'isRecalled', 'editedAt',
  'reactions', 'fileMeta', 'signedReadUrl', 'mentions', 'embeds', 'links', 'visibility', 'refs',
  'activityEventId', 'poll',
];

const WITHHELD_WHEN_REMOVED = ['fileMeta', 'signedReadUrl', 'refs', 'originalContent'];

/**
 * Tin đã thu hồi/xóa không trả nội dung người dùng. Ngoại lệ: tin `system` bị GC đánh dấu xóa
 * (placeholder "[Tệp đã hết hạn]" do server sinh) vẫn giữ content để UI hiển thị.
 */
function isContentWithheld(o) {
  if (o.isRecalled) return true;
  return Boolean(o.isDeleted) && o.messageType !== 'system';
}

function withholdRemovedContent(message) {
  message.content = '';
  for (const key of WITHHELD_WHEN_REMOVED) delete message[key];
  return message;
}

function pickClientFullMessage(o, senderId) {
  const picked = { senderId };
  for (const key of CLIENT_MESSAGE_FULL_FIELDS) {
    if (o[key] !== undefined) picked[key] = o[key];
  }
  if (picked.fileMeta) {
    picked.fileMeta = slimFileMeta(picked.fileMeta);
  }
  return picked;
}

function applyPublicPoll(message, source, viewerId) {
  if (source?.messageType !== 'poll' || !source.poll) return message;
  const pub = toPublicPoll(source.poll, viewerId);
  if (pub) message.poll = pub;
  else delete message.poll;
  return message;
}

/**
 * @param {object} doc - mongoose doc or plain
 * @param {{ fields?: 'summary'|'full' }} opts
 */
function toClientMessage(doc, opts = {}) {
  if (!doc) return null;
  const fields = opts.fields === 'full' ? 'full' : 'summary';
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.content = unwrapPlaintext(o.content);
  const withheld = isContentWithheld(o);

  const senderId = String(o.senderId?._id || o.senderId || '');
  const viewerId = opts.viewerId || '';
  if (fields === 'full') {
    const full = applyPublicPoll(pickClientFullMessage(o, senderId), o, viewerId);
    return withheld ? withholdRemovedContent(full) : full;
  }

  const summary = {
    _id: o._id,
    id: o._id,
    senderId,
    senderDisplayName: String(o.senderDisplayName || '').trim(),
    content: o.content,
    messageType: o.messageType || 'text',
    roomId: o.roomId,
    organizationId: o.organizationId,
    receiverId: o.receiverId,
    conversationId: o.conversationId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    isRead: o.isRead,
    readAt: o.readAt,
    replyToMessageId: o.replyToMessageId,
    isDeleted: o.isDeleted,
    isRecalled: o.isRecalled,
    editedAt: o.editedAt,
    reactions: Array.isArray(o.reactions)
      ? o.reactions.map((r) => ({
          emoji: r.emoji,
          userId: String(r.userId?._id || r.userId || ''),
          createdAt: r.createdAt,
        }))
      : [],
  };
  if (o.visibility && o.visibility.mode) {
    summary.visibility = {
      mode: o.visibility.mode,
      projectId: o.visibility.projectId,
      ...(o.visibility.projectName ? { projectName: o.visibility.projectName } : {}),
    };
  }
  if (Array.isArray(o.refs) && o.refs.length) {
    summary.refs = o.refs.map((r) => ({
      kind: r.kind,
      id: r.id,
      projectId: r.projectId,
      ...(r.label ? { label: r.label } : {}),
    }));
  }
  if (o.activityEventId) summary.activityEventId = String(o.activityEventId);
  const fm = slimFileMeta(o.fileMeta);
  if (fm) summary.fileMeta = fm;
  if (o.signedReadUrl) summary.signedReadUrl = o.signedReadUrl;
  applyPublicPoll(summary, o, viewerId);
  return withheld ? withholdRemovedContent(summary) : summary;
}

module.exports = { toClientMessage, slimFileMeta };
