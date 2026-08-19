const { unwrapPlaintext } = require('@enterprise/shared');

function slimFileMeta(fileMeta, { includeStoragePath = false } = {}) {
  if (!fileMeta || typeof fileMeta !== 'object') return undefined;
  const out = {};
  if (fileMeta.originalName) out.originalName = fileMeta.originalName;
  if (fileMeta.mimeType) out.mimeType = fileMeta.mimeType;
  if (fileMeta.byteSize != null) out.byteSize = fileMeta.byteSize;
  if (includeStoragePath && fileMeta.storagePath) out.storagePath = fileMeta.storagePath;
  return Object.keys(out).length ? out : undefined;
}

const CLIENT_MESSAGE_FULL_FIELDS = [
  '_id', 'senderId', 'senderDisplayName', 'content', 'originalContent', 'messageType',
  'roomId', 'organizationId', 'receiverId', 'conversationId', 'createdAt', 'updatedAt',
  'isRead', 'readAt', 'replyToMessageId', 'isDeleted', 'isRecalled', 'editedAt',
  'reactions', 'fileMeta', 'signedReadUrl', 'mentions', 'embeds', 'links', 'visibility', 'refs',
];

function pickClientFullMessage(o, senderId) {
  const picked = { senderId };
  for (const key of CLIENT_MESSAGE_FULL_FIELDS) {
    if (o[key] !== undefined) picked[key] = o[key];
  }
  if (picked.fileMeta) {
    picked.fileMeta = slimFileMeta(picked.fileMeta, { includeStoragePath: false });
  }
  return picked;
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
  if (o.originalContent) o.originalContent = unwrapPlaintext(o.originalContent);

  const senderId = String(o.senderId?._id || o.senderId || '');
  if (fields === 'full') {
    return pickClientFullMessage(o, senderId);
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
  const fm = slimFileMeta(o.fileMeta);
  if (fm) summary.fileMeta = fm;
  if (o.signedReadUrl) summary.signedReadUrl = o.signedReadUrl;
  return summary;
}

module.exports = { toClientMessage, slimFileMeta };
