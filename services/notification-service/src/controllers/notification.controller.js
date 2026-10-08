const notificationService = require('../services/notification.service');
const { publishDispatchJob } = require('../messaging/notificationDispatch.publisher');
const logger = require('@enterprise/shared/utils/logger');
const {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE,
} = require('../middlewares/sendServiceError');
const { BULK_MAX_USER_IDS } = require('../utils/notificationErrorMap');
const {
  resolveNotificationScope,
  isObjectIdString,
} = require('../utils/notificationScopePolicy');
const { assertActiveOrgMembership } = require('../clients/organizationMembership.client');
const { assertNotificationWriteAllowed } = require('../utils/notificationWriteLimit');

function logNotificationFailure(label, error, userId) {
  if (error?.errorCode === 'NOTIFICATION_RATE_LIMITED') {
    logger.warn(label, { userId: userId == null ? undefined : String(userId) });
    return;
  }
  logger.error(label, error?.message);
}

function sendValidationError(res, message) {
  return sendServiceError(res, 400, { errorCode: 'NOTIFICATION_VALIDATION_ERROR', message });
}

function sendUnauthorized(res) {
  return sendServiceError(res, 401, { errorCode: 'NOTIFICATION_UNAUTHORIZED', message: 'Unauthorized' });
}

function sendCatchError(res, error, fallbackMessage) {
  return sendErrorFromCatch(res, error, 500, fallbackMessage, INTERNAL_ERROR_CODE);
}

/**
 * @returns {Promise<null | { scope: string, organizationId: string }>}
 * null = response already sent
 */
async function resolveScopedAccess(res, userId, raw, { defaultScope = 'personal' } = {}) {
  const resolved = resolveNotificationScope(raw, { defaultScope });
  if (!resolved.ok) {
    sendServiceError(res, resolved.status, {
      errorCode: resolved.errorCode,
      message: resolved.message,
    });
    return null;
  }

  if (resolved.scope === 'organization') {
    const membership = await assertActiveOrgMembership(userId, resolved.organizationId);
    if (membership === 'unavailable') {
      sendServiceError(res, 503, {
        errorCode: 'NOTIFICATION_ORG_LOOKUP_UNAVAILABLE',
        message: 'Organization membership lookup unavailable',
      });
      return null;
    }
    if (membership === 'forbidden') {
      logger.warn('[notification] org forbidden', {
        userId: String(userId),
        organizationId: resolved.organizationId,
      });
      sendServiceError(res, 403, {
        errorCode: 'NOTIFICATION_ORG_FORBIDDEN',
        message: 'Not a member of this organization',
      });
      return null;
    }
  }

  return { scope: resolved.scope, organizationId: resolved.organizationId };
}

function pickScopeRaw(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  return {
    scope: body.scope != null ? body.scope : query.scope,
    organizationId:
      body.organizationId != null ? body.organizationId : query.organizationId,
  };
}

class NotificationController {
  _asyncDispatchEnabled() {
    return String(process.env.NOTIFICATION_ASYNC_DISPATCH || 'false').toLowerCase() === 'true';
  }

  // Tạo notification mới
  async createNotification(req, res) {
    try {
      const { userId, type, title, content, data, actionUrl } = req.body;

      if (!userId || !type || !title || !content) {
        return sendValidationError(res, 'userId, type, title and content are required');
      }

      if (this._asyncDispatchEnabled()) {
        try {
          await publishDispatchJob({
            kind: 'single',
            userId,
            notification: { type, title, content, data, actionUrl },
          });
          return res.status(202).json({ success: true, queued: true });
        } catch (publishErr) {
          logger.warn(
            '[notification] async dispatch unavailable, fallback sync: %s',
            publishErr?.code || publishErr?.message || publishErr
          );
        }
      }
      const notification = await notificationService.createNotification({
        userId,
        type,
        title,
        content,
        data,
        actionUrl,
      });

      res.status(201).json({
        success: true,
        data: notification,
      });
    } catch (error) {
      logger.error('Create notification error:', error?.message);
      return sendCatchError(res, error, 'Không thể tạo thông báo');
    }
  }

  // Tạo nhiều notifications
  async createBulkNotifications(req, res) {
    try {
      const { userIds, type, title, content, data, actionUrl } = req.body;

      if (!userIds || !Array.isArray(userIds) || !type || !title || !content) {
        return sendValidationError(res, 'userIds (array), type, title and content are required');
      }
      if (userIds.length > BULK_MAX_USER_IDS) {
        return sendServiceError(res, 400, {
          errorCode: 'NOTIFICATION_BULK_TOO_LARGE',
          message: `userIds must not exceed ${BULK_MAX_USER_IDS} items`,
        });
      }

      if (this._asyncDispatchEnabled()) {
        try {
          await publishDispatchJob({
            kind: 'bulk',
            userIds,
            notification: { type, title, content, data, actionUrl },
          });
          return res.status(202).json({ success: true, queued: true });
        } catch (publishErr) {
          logger.warn(
            '[notification] async bulk dispatch unavailable, fallback sync: %s',
            publishErr?.code || publishErr?.message || publishErr
          );
        }
      }
      const notifications = await notificationService.createBulkNotifications(userIds, {
        type,
        title,
        content,
        data,
        actionUrl,
      });

      res.status(201).json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      logger.error('Create bulk notifications error:', error?.message);
      return sendCatchError(res, error, 'Không thể gửi thông báo hàng loạt');
    }
  }

  // Lấy notifications của user
  async getUserNotifications(req, res) {
    try {
      const authenticatedUserId = req.user?.id || req.userContext?.userId;
      if (!authenticatedUserId) {
        return sendUnauthorized(res);
      }
      const paramUserId = req.params.userId ? String(req.params.userId).trim() : null;
      if (paramUserId && paramUserId !== String(authenticatedUserId)) {
        return sendServiceError(res, 403, { errorCode: 'NOTIFICATION_FORBIDDEN', message: 'Forbidden' });
      }
      const userId = authenticatedUserId;
      const { isRead, type, page, limit, organizationId, scope, before, fields } = req.query;

      let scopedOrganizationId = organizationId;
      let scopedScope = scope;
      if (scope != null && String(scope).trim() !== '') {
        const access = await resolveScopedAccess(
          res,
          userId,
          { scope, organizationId },
          { defaultScope: 'personal' }
        );
        if (!access) return undefined;
        scopedScope = access.scope;
        scopedOrganizationId = access.organizationId || undefined;
      } else if (organizationId != null && String(organizationId).trim() !== '') {
        if (!isObjectIdString(organizationId)) {
          return sendValidationError(res, 'organizationId is invalid');
        }
      }

      const result = await notificationService.getUserNotifications(userId, {
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
        type,
        organizationId: scopedOrganizationId,
        scope: scopedScope,
        fields,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
        before: before || undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get user notifications error:', error?.message);
      return sendCatchError(res, error, 'Không thể tải danh sách thông báo');
    }
  }

  /** Gọi nội bộ từ voice-service sau duyệt/từ chối yêu cầu vào phòng */
  async markVoiceRoomJoinRequestReadInternal(req, res) {
    try {
      const { userId, roomId, requestId, requestUserId } = req.body || {};
      if (!userId || !roomId) {
        return sendValidationError(res, 'userId and roomId are required');
      }
      const result = await notificationService.markVoiceRoomJoinRequestRead(userId, {
        roomId,
        requestId,
        requestUserId,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Mark voice room join request read (internal) error:', error?.message);
      return sendCatchError(res, error, 'Không thể cập nhật thông báo');
    }
  }

  // Đánh dấu đã đọc thông báo yêu cầu vào phòng voice (host đã duyệt/từ chối)
  async markVoiceRoomJoinRequestRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { roomId, requestId, requestUserId } = req.body || {};
      if (!userId) {
        return sendUnauthorized(res);
      }
      if (!roomId) {
        return sendValidationError(res, 'roomId is required');
      }
      await assertNotificationWriteAllowed({ userId, bucket: 'item' });
      const result = await notificationService.markVoiceRoomJoinRequestRead(userId, {
        roomId,
        requestId,
        requestUserId,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      logNotificationFailure(
        'Mark voice room join request read error:',
        error,
        req.user?.id || req.userContext?.userId
      );
      return sendCatchError(res, error, 'Không thể cập nhật thông báo');
    }
  }

  // Đánh dấu đã đọc mọi thông báo kết bạn liên quan tới một user (sau accept/reject)
  async markFriendRelatedRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { counterpartyId } = req.body || {};

      if (!userId) {
        return sendUnauthorized(res);
      }
      if (!counterpartyId) {
        return sendValidationError(res, 'counterpartyId is required');
      }

      await assertNotificationWriteAllowed({ userId, bucket: 'item' });
      const result = await notificationService.markFriendRelatedRead(userId, counterpartyId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logNotificationFailure(
        'Mark friend-related read error:',
        error,
        req.user?.id || req.userContext?.userId
      );
      return sendCatchError(res, error, 'Không thể cập nhật thông báo');
    }
  }

  // Đánh dấu notification là đã đọc
  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return sendUnauthorized(res);
      }
      if (!isObjectIdString(notificationId)) {
        return sendValidationError(res, 'notificationId is invalid');
      }

      await assertNotificationWriteAllowed({ userId, bucket: 'item' });
      const notification = await notificationService.markAsRead(notificationId, userId);

      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      logNotificationFailure('Mark as read error:', error, req.user?.id || req.userContext?.userId);
      return sendCatchError(res, error, 'Không thể đánh dấu đã đọc');
    }
  }

  // Đánh dấu tất cả notifications là đã đọc
  async markAllAsRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return sendUnauthorized(res);
      }

      await assertNotificationWriteAllowed({ userId, bucket: 'bulk' });
      const access = await resolveScopedAccess(res, userId, pickScopeRaw(req), {
        defaultScope: 'personal',
      });
      if (!access) return undefined;

      const result = await notificationService.markAllAsRead(userId, access);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logNotificationFailure('Mark all as read error:', error, req.user?.id || req.userContext?.userId);
      return sendCatchError(res, error, 'Không thể đánh dấu đã đọc toàn bộ');
    }
  }

  // Xóa notification
  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return sendUnauthorized(res);
      }
      if (!isObjectIdString(notificationId)) {
        return sendValidationError(res, 'notificationId is invalid');
      }

      await assertNotificationWriteAllowed({ userId, bucket: 'item' });
      const notification = await notificationService.deleteNotification(notificationId, userId);

      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      logNotificationFailure('Delete notification error:', error, req.user?.id || req.userContext?.userId);
      return sendCatchError(res, error, 'Không thể xóa thông báo');
    }
  }

  // Xóa tất cả notifications đã đọc
  async deleteAllRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return sendUnauthorized(res);
      }

      await assertNotificationWriteAllowed({ userId, bucket: 'bulk' });
      const access = await resolveScopedAccess(res, userId, pickScopeRaw(req), {
        defaultScope: 'personal',
      });
      if (!access) return undefined;

      const result = await notificationService.deleteAllRead(userId, access);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logNotificationFailure('Delete all read error:', error, req.user?.id || req.userContext?.userId);
      return sendCatchError(res, error, 'Không thể xóa thông báo đã đọc');
    }
  }
}

module.exports = new NotificationController();
