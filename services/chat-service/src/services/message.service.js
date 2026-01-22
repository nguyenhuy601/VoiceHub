const Message = require('../models/Message');
const { getRedisClient } = require('/shared');

class MessageService {
  // Tạo tin nhắn mới
  async createMessage(messageData) {
    try {
      const message = new Message(messageData);
      await message.save();

      // Cache message trong Redis
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${message._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(message));
      }

      return message;
    } catch (error) {
      throw new Error(`Error creating message: ${error.message}`);
    }
  }

  // Lấy tin nhắn theo ID
  async getMessageById(messageId) {
    try {
      // Kiểm tra cache trước
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const message = await Message.findById(messageId)
        .populate('senderId', 'username email')
        .populate('receiverId', 'username email');

      // Cache message
      if (redis && message) {
        const cacheKey = `message:${messageId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(message));
      }

      return message;
    } catch (error) {
      throw new Error(`Error getting message: ${error.message}`);
    }
  }

  // Lấy danh sách tin nhắn
  async getMessages(filter, options = {}) {
    try {
      const { page = 1, limit = 50, sort = { createdAt: -1 } } = options;

      const messages = await Message.find(filter)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('senderId', 'username email')
        .populate('receiverId', 'username email');

      const total = await Message.countDocuments(filter);

      return {
        messages,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      throw new Error(`Error getting messages: ${error.message}`);
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markAsRead(messageId, userId) {
    try {
      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          isRead: true,
          readAt: new Date(),
        },
        { new: true }
      );

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return message;
    } catch (error) {
      throw new Error(`Error marking message as read: ${error.message}`);
    }
  }

  // Xóa tin nhắn
  async deleteMessage(messageId, userId) {
    try {
      const message = await Message.findOneAndDelete({
        _id: messageId,
        senderId: userId,
      });

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return message;
    } catch (error) {
      throw new Error(`Error deleting message: ${error.message}`);
    }
  }
}

module.exports = new MessageService();


