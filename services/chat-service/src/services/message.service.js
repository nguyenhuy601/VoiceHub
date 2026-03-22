const {
  mongo,
  getRedisClient,
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  unwrapPlaintext,
  recordLazyMigrate,
} = require('/shared');
const { mongoose } = mongo;
const Message = require('../models/Message');

const MONGO_UNAVAILABLE_MSG = 'Service temporarily unavailable. Please try again later.';

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

function encryptContentIfEnabled(plain) {
  if (!isEncryptionEnabled()) return plain;
  return encryptField(String(plain ?? ''));
}

function toClientMessage(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.content = unwrapPlaintext(o.content);
  if (o.originalContent) o.originalContent = unwrapPlaintext(o.originalContent);
  return o;
}

async function maybeMigrateMessageContent(doc) {
  if (!doc || !isEncryptionEnabled()) return;
  const updates = {};
  if (doc.content && !isEncrypted(doc.content)) {
    updates.content = encryptField(String(doc.content));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (doc.originalContent && !isEncrypted(doc.originalContent)) {
    updates.originalContent = encryptField(String(doc.originalContent));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (Object.keys(updates).length > 0) {
    await Message.updateOne({ _id: doc._id }, { $set: updates });
    Object.assign(doc, updates);
  }
}

class MessageService {
  async createMessage(messageData) {
    try {
      await ensureMongoReady();
      const payload = { ...messageData };
      if (payload.content !== undefined) {
        payload.content = encryptContentIfEnabled(payload.content);
        if (isEncryptionEnabled()) payload.encV = 1;
      }

      const message = new Message(payload);
      await message.save();

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${message._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(toClientMessage(message)));
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error creating message: ${err.message}`);
    }
  }

  async getMessageById(messageId) {
    try {
      await ensureMongoReady();
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const message = await Message.findById(messageId);
      if (message) await maybeMigrateMessageContent(message);

      if (redis && message) {
        const cacheKey = `message:${messageId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(toClientMessage(message)));
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error getting message: ${err.message}`);
    }
  }

  async getMessages(filter, options = {}) {
    try {
      await ensureMongoReady();
      const { page = 1, limit = 50, sort = { createdAt: -1 } } = options;

      const messages = await Message.find(filter).sort(sort).limit(limit * 1).skip((page - 1) * limit);

      for (const m of messages) {
        await maybeMigrateMessageContent(m);
      }

      const total = await Message.countDocuments(filter);

      return {
        messages: messages.map((m) => toClientMessage(m)),
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error getting messages: ${err.message}`);
    }
  }

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

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error marking message as read: ${err.message}`);
    }
  }

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

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error deleting message: ${err.message}`);
    }
  }

  async recallMessage(messageId, userId) {
    try {
      await ensureMongoReady();
      const oldMessage = await Message.findById(messageId);
      if (!oldMessage || oldMessage.senderId.toString() !== userId.toString()) {
        return null;
      }

      const prevContent = oldMessage.content;
      const encPrev = isEncryptionEnabled() ? encryptField(unwrapPlaintext(prevContent)) : prevContent;

      const message = await Message.findOneAndUpdate(
        {
          _id: messageId,
          senderId: userId,
        },
        {
          isRecalled: true,
          recalledAt: new Date(),
          originalContent: encPrev,
        },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error recalling message: ${err.message}`);
    }
  }

  async editMessage(messageId, userId, newContent) {
    try {
      await ensureMongoReady();

      const oldMessage = await Message.findById(messageId);
      if (!oldMessage || oldMessage.senderId.toString() !== userId.toString()) {
        return null;
      }

      const encNew = encryptContentIfEnabled(newContent);
      const encOrig = encryptContentIfEnabled(unwrapPlaintext(oldMessage.content));

      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          content: encNew,
          originalContent: encOrig,
          editedAt: new Date(),
          ...(isEncryptionEnabled() ? { encV: 1 } : {}),
        },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error editing message: ${err.message}`);
    }
  }
}

module.exports = new MessageService();
