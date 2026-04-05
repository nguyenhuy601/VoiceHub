const messageService = require('../services/message.service');
const { emitRealtimeEvent } = require('/shared');

class MessageController {
  /**
   * Nội bộ: xóa toàn bộ DM giữa hai user (friend-service gọi khi xóa bạn).
   * Bảo vệ bằng header x-internal-token (CHAT_INTERNAL_TOKEN).
   */
  async deleteDmBetweenUsers(req, res) {
    try {
      const { userIdA, userIdB } = req.body || {};
      if (!userIdA || !userIdB) {
        return res.status(400).json({
          success: false,
          message: 'userIdA and userIdB are required',
        });
      }

      const result = await messageService.deleteDirectMessagesBetweenUsers(userIdA, userIdB);

      await emitRealtimeEvent({
        event: 'friend:dm_cleared',
        userIds: [String(userIdA), String(userIdB)],
        payload: {
          userIdA: String(userIdA),
          userIdB: String(userIdB),
          deletedCount: result.deletedCount,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Tạo tin nhắn mới
  async createMessage(req, res) {
    try {
      const { content, receiverId, roomId, messageType, organizationId } = req.body;
      const senderId = req.user?.id || req.user?._id;

      if (!content || (!receiverId && !roomId)) {
        return res.status(400).json({
          success: false,
          message: 'Content and receiverId or roomId are required',
        });
      }

      const messageData = {
        senderId,
        content,
        messageType: messageType || 'text',
        organizationId,
      };

      if (receiverId) {
        messageData.receiverId = receiverId;
      }

      if (roomId) {
        messageData.roomId = roomId;
      }

      const message = await messageService.createMessage(messageData);

      if (receiverId) {
        await emitRealtimeEvent({
          event: 'friend:new_message',
          userId: String(receiverId),
          payload: message,
        });
        await emitRealtimeEvent({
          event: 'friend:sent',
          userId: String(senderId),
          payload: message,
        });
      }

      if (roomId) {
        await emitRealtimeEvent({
          event: 'room:new_message',
          roomId: String(roomId),
          payload: message,
        });
      }

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Danh sách tin nhắn kênh tổ chức chưa đọc (mới nhất trước).
   */
  async getUnreadOrgMessagesFeed(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
      const messages = await messageService.findUnreadOrgRoomMessages(userId, limit);

      res.json({
        success: true,
        data: { messages },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Thống kê tin nhắn cho dashboard: hôm nay / hôm qua + % thay đổi (tin gửi đến user, DM).
   */
  async getMessageStatsSummary(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endToday = new Date(startToday);
      endToday.setDate(endToday.getDate() + 1);

      const startYesterday = new Date(startToday);
      startYesterday.setDate(startYesterday.getDate() - 1);
      const endYesterday = startToday;

      const [todayCount, yesterdayCount, unreadCount] = await Promise.all([
        messageService.countIncomingMessagesInRange(userId, startToday, endToday),
        messageService.countIncomingMessagesInRange(userId, startYesterday, endYesterday),
        messageService.countUnreadIncoming(userId),
      ]);

      let changePercent = 0;
      let trend = 'flat';
      if (yesterdayCount > 0) {
        changePercent = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
        if (changePercent > 0) trend = 'up';
        else if (changePercent < 0) trend = 'down';
        else trend = 'flat';
      } else if (todayCount > 0) {
        changePercent = 100;
        trend = 'up';
      }

      res.json({
        success: true,
        data: {
          todayCount,
          yesterdayCount,
          unreadCount,
          changePercent,
          trend,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy tin nhắn theo ID
  async getMessageById(req, res) {
    try {
      const { messageId } = req.params;
      const message = await messageService.getMessageById(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found',
        });
      }

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách tin nhắn
  async getMessages(req, res) {
    try {
      const { receiverId, roomId, organizationId, page, limit } = req.query;
      const userId = req.user?.id || req.user?._id;

      const filter = {};

      if (receiverId) {
        filter.$or = [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId },
        ];
      } else if (roomId) {
        filter.roomId = roomId;
      } else {
        filter.$or = [
          { senderId: userId },
          { receiverId: userId },
        ];
      }

      if (organizationId) {
        filter.organizationId = organizationId;
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      };

      if (receiverId && userId) {
        const a = String(userId);
        const b = String(receiverId);
        options.dmCacheKey = [a, b].sort().join(':');
      }

      const result = await messageService.getMessages(filter, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markAsRead(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.markAsRead(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found',
        });
      }

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa tin nhắn
  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.deleteMessage(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or unauthorized',
        });
      }

      res.json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thu hồi tin nhắn (Recall)
  async recallMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.recallMessage(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or unauthorized',
        });
      }

      res.json({
        success: true,
        message: 'Message recalled successfully',
        data: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Chỉnh sửa tin nhắn
  async editMessage(req, res) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.user?.id || req.user?._id;

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const message = await messageService.editMessage(messageId, userId, content.trim());

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or unauthorized',
        });
      }

      res.json({
        success: true,
        message: 'Message edited successfully',
        data: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new MessageController();




