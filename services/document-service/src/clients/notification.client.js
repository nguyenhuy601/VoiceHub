/**
 * Gửi inbox document qua notification-service (HTTP nội bộ).
 * Không phụ thuộc webhook replica.
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');
const { fetchOrganizationAdminUserIds } = require('./orgMemberships.client');
const { documentActionUrl } = require('../utils/documentActionUrl');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isDocumentNotifyEnabled() {
  const raw = String(process.env.DOCUMENT_NOTIFY ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function isConfigured() {
  return Boolean(NOTIFICATION_SERVICE_URL && NOTIFICATION_INTERNAL_TOKEN);
}

async function postBulk({ userIds, title, content, data, actionUrl, excludeUserId }) {
  if (!isDocumentNotifyEnabled() || !isConfigured()) return false;
  const ex = String(excludeUserId || '').trim();
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))].filter(
    (id) => id !== ex
  );
  if (!ids.length) return false;
  try {
    const res = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds: ids,
        type: 'document',
        title,
        content,
        data: data || {},
        actionUrl: actionUrl || undefined,
      },
      {
        headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      logger.warn('[notification.client] document bulk HTTP %s', res.status);
    }
    return ok;
  } catch (err) {
    logger.warn('[notification.client] document bulk failed: %s', err?.message || err);
    return false;
  }
}

/**
 * Khi upload vào org hoặc bật chia sẻ (isPublic) — báo admin/owner (trừ uploader).
 */
async function maybeNotifyDocumentShared({ document, actorUserId, reason = 'uploaded' }) {
  if (!isDocumentNotifyEnabled()) return false;
  const doc = document?.toObject ? document.toObject() : document;
  if (!doc) return false;

  const organizationId = String(doc.organizationId || '').trim();
  const documentId = String(doc._id || doc.id || '').trim();
  if (!organizationId || !documentId) return false;

  // Chỉ chuông khi tài liệu thuộc org và (public hoặc vừa upload vào workspace)
  if (reason === 'updated' && doc.isPublic !== true) return false;

  const adminIds = await fetchOrganizationAdminUserIds(organizationId, actorUserId);
  const name = String(doc.name || 'Tài liệu').trim() || 'Tài liệu';
  const title = reason === 'shared' || (reason === 'updated' && doc.isPublic)
    ? 'Tài liệu được chia sẻ'
    : 'Tài liệu mới trong workspace';
  const content =
    reason === 'shared' || (reason === 'updated' && doc.isPublic)
      ? `"${name}" đã được chia sẻ với workspace.`
      : `"${name}" vừa được tải lên.`;

  return postBulk({
    userIds: adminIds,
    title,
    content,
    data: {
      kind: 'document_shared',
      documentId,
      documentName: name,
      organizationId,
      uploadedBy: String(doc.uploadedBy || actorUserId || ''),
    },
    actionUrl: documentActionUrl({ documentId, organizationId }),
    excludeUserId: actorUserId || doc.uploadedBy,
  });
}

module.exports = {
  isDocumentNotifyEnabled,
  documentActionUrl,
  maybeNotifyDocumentShared,
};
