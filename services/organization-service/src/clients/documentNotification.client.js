/**
 * Gửi inbox document qua notification-service (HTTP nội bộ).
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');
const Membership = require('../models/Membership');
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

/** Owner/admin active của org — in-process (không HTTP self). */
async function fetchOrganizationAdminUserIds(organizationId) {
  const oid = String(organizationId || '').trim();
  if (!oid) return [];
  try {
    const rows = await Membership.find({
      organization: oid,
      status: 'active',
    })
      .select('user role')
      .lean();
    return rows
      .filter((row) => {
        const role = Membership.normalizeRole(row?.role);
        return role === 'owner' || role === 'admin';
      })
      .map((row) => String(row?.user || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
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
      logger.warn('[documentNotification.client] bulk HTTP %s', res.status);
    }
    return ok;
  } catch (err) {
    logger.warn('[documentNotification.client] bulk failed: %s', err?.message || err);
    return false;
  }
}

async function maybeNotifyDocumentShared({ document, actorUserId, reason = 'uploaded' }) {
  if (!isDocumentNotifyEnabled()) return false;
  const doc = document?.toObject ? document.toObject() : document;
  if (!doc) return false;

  const organizationId = String(doc.organizationId || '').trim();
  const documentId = String(doc._id || doc.id || '').trim();
  if (!organizationId || !documentId) return false;

  if (reason === 'updated' && doc.isPublic !== true) return false;

  const adminIds = await fetchOrganizationAdminUserIds(organizationId);
  const name = String(doc.name || 'Tài liệu').trim() || 'Tài liệu';
  const title =
    reason === 'shared' || (reason === 'updated' && doc.isPublic)
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
  fetchOrganizationAdminUserIds,
};
