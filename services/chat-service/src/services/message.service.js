const { mongo, getRedisClient } = require('/shared');
const { mongoose } = mongo;
const Message = require('../models/Message');

const MONGO_UNAVAILABLE_MSG = 'Service temporarily unavailable. Please try again later.';

// Helper: đảm bảo MongoDB đã sẵn sàng, tránh lỗi buffering timed out
async function ensureMongoReady() {
  if (mongoose.connection.readyState === 1) return;

  const state = mongoose.connection.readyState;
  console.warn(
    `[ChatService] MongoDB not connected (readyState=${state}). Operation will fail fast instead of buffering.`
  );
  throw new Error(MONGO_UNAVAILABLE_MSG);
}

function normalizeMongoError(error) {
  if (
    error?.name === 'MongooseError' ||
    (error?.message && error.message.includes('buffering timed out'))
  ) {
    return new Error(MONGO_UNAVAILABLE_MSG);
  }
  return error;
}

class MessageService {
  // Tạo tin nhắn mới
  async createMessage(messageData) {
    try {
      await ensureMongoReady();
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
      const err = normalizeMongoError(error);
      throw new Error(`Error creating message: ${err.message}`);
    }
  }

  // Lấy tin nhắn theo ID
  async getMessageById(messageId) {
    try {
      await ensureMongoReady();
      // Kiểm tra cache trước
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Không populate User tại đây vì chat-service không đăng ký schema User;
      // FE chỉ cần content/createdAt, thông tin user sẽ lấy từ user-service.
      const message = await Message.findById(messageId);

      // Cache message
      if (redis && message) {
        const cacheKey = `message:${messageId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(message));
      }

      return message;
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error getting message: ${err.message}`);
    }
  }

  // Lấy danh sách tin nhắn
  async getMessages(filter, options = {}) {
    try {
      await ensureMongoReady();
      const { page = 1, limit = 50, sort = { createdAt: -1 } } = options;

      const messages = await Message.find(filter)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Message.countDocuments(filter);

      return {
        messages,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error getting messages: ${err.message}`);
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markAsRead(messageId, userId) {
    try {
      await ensureMongoReady();
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
      const err = normalizeMongoError(error);
      throw new Error(`Error marking message as read: ${err.message}`);
    }
  }

  // Xóa tin nhắn (Soft delete - giữ message data nhưng đánh dấu deleted)
  async deleteMessage(messageId, userId) {
    try {
      await ensureMongoReady();
      const message = await Message.findOneAndUpdate(
        {
          _id: messageId,
          senderId: userId,
        },
        {
          isDeleted: true,
          deletedAt: new Date(),
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
      const err = normalizeMongoError(error);
      throw new Error(`Error deleting message: ${err.message}`);
    }
  }

  // Thu hồi tin nhắn (Recall) - ẩn nội dung nhưng giữ message
  async recallMessage(messageId, userId) {
    try {
      await ensureMongoReady();
      const message = await Message.findOneAndUpdate(
        {
          _id: messageId,
          senderId: userId,
        },
        {
          isRecalled: true,
          recalledAt: new Date(),
          // Lưu nội dung cũ
          originalContent: this._getPreviousContent ? await this._getPreviousContent(messageId) : undefined,
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
      const err = normalizeMongoError(error);
      throw new Error(`Error recalling message: ${err.message}`);
    }
  }

  // Chỉnh sửa tin nhắn
  async editMessage(messageId, userId, newContent) {
    try {
      await ensureMongoReady();
      
      // Lấy message cũ để backup content
      const oldMessage = await Message.findById(messageId);
      if (!oldMessage || oldMessage.senderId.toString() !== userId.toString()) {
        return null;
      }

      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          content: newContent,
          originalContent: oldMessage.content,
          editedAt: new Date(),
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
      const err = normalizeMongoError(error);
      throw new Error(`Error editing message: ${err.message}`);
    }
  }
}

module.exports = new MessageService();


