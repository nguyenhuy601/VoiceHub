const messageService = require('../services/message.service');

class MessageController {
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




