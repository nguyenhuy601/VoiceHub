const Notification = require('../models/Notification');
const { getRedisClient, logger } = require('/shared');

class NotificationService {
  // Tạo notification mới
  async createNotification(notificationData) {
    try {
      const { userId, type, title, content, data, actionUrl } = notificationData;

      const notification = new Notification({
        userId,
        type,
        title,
        content,
        data: data || {},
        actionUrl,
      });

      await notification.save();

      // Emit real-time notification (nếu có Socket.IO)
      // io.to(`user:${userId}`).emit('notification', notification);

      logger.info(`Notification created: ${notification._id} for user: ${userId}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw new Error(`Error creating notification: ${error.message}`);
    }
  }

  // Tạo nhiều notifications cùng lúc
  async createBulkNotifications(userIds, notificationData) {
    try {
      const { type, title, content, data, actionUrl } = notificationData;

      const notifications = userIds.map((userId) => ({
        userId,
        type,
        title,
        content,
        data: data || {},
        actionUrl,
      }));

      const created = await Notification.insertMany(notifications);

      logger.info(`Bulk notifications created: ${created.length} notifications`);
      return created;
    } catch (error) {
      logger.error('Error creating bulk notifications:', error);
      throw new Error(`Error creating bulk notifications: ${error.message}`);
    }
  }

  // Lấy notifications của user
  async getUserNotifications(userId, options = {}) {
    try {
      const { isRead, type, page = 1, limit = 50 } = options;

      const filter = { userId };
      if (isRead !== undefined) filter.isRead = isRead;
      if (type) filter.type = type;

      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Notification.countDocuments(filter);
      const unreadCount = await Notification.countDocuments({ userId, isRead: false });

      return {
        notifications,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
        unreadCount,
      };
    } catch (error) {
      logger.error('Error getting user notifications:', error);
      throw new Error(`Error getting user notifications: ${error.message}`);
    }
  }

  // Đánh dấu notification là đã đọc
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        },
        { new: true }
      );

      if (!notification) {
        throw new Error('Notification not found');
      }

      logger.info(`Notification marked as read: ${notificationId}`);
      return notification;
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw new Error(`Error marking notification as read: ${error.message}`);
    }
  }

  // Đánh dấu tất cả notifications là đã đọc
  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        }
      );

      logger.info(`All notifications marked as read for user: ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw new Error(`Error marking all notifications as read: ${error.message}`);
    }
  }

  // Xóa notification
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        userId,
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      logger.info(`Notification deleted: ${notificationId}`);
      return notification;
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw new Error(`Error deleting notification: ${error.message}`);
    }
  }

  // Xóa tất cả notifications đã đọc
  async deleteAllRead(userId) {
    try {
      const result = await Notification.deleteMany({
        userId,
        isRead: true,
      });

      logger.info(`All read notifications deleted for user: ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error deleting all read notifications:', error);
      throw new Error(`Error deleting all read notifications: ${error.message}`);
    }
  }
}

module.exports = new NotificationService();

