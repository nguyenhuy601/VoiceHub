const { mongo } = require('@enterprise/shared');
const { mongoose } = mongo;
const RoomReadCursor = require('../models/RoomReadCursor');
const Message = require('../models/Message');
const {
  shouldAdvanceCursor,
  resolveOutgoingRoomReceipt,
} = require('../utils/roomReadCursorLogic');

function toOid(value) {
  const s = String(value || '').trim();
  if (!s || !mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function cursorDto(doc) {
  if (!doc) return null;
  return {
    roomId: String(doc.roomId),
    userId: String(doc.userId),
    lastReadMessageId: String(doc.lastReadMessageId),
    lastReadAt: doc.lastReadAt ? new Date(doc.lastReadAt).toISOString() : null,
  };
}

async function listCursorsForRoom(roomId) {
  const rid = toOid(roomId);
  if (!rid) return [];
  const rows = await RoomReadCursor.find({ roomId: rid }).lean().exec();
  return rows.map(cursorDto).filter(Boolean);
}

/**
 * Advance watermark (monotonic). Nếu thiếu lastReadMessageId → lấy tin mới nhất trong room.
 */
async function markRoomReadUpTo({ roomId, userId, lastReadMessageId = null } = {}) {
  const rid = toOid(roomId);
  const uid = toOid(userId);
  if (!rid || !uid) {
    const err = new Error('roomId and userId are required');
    err.statusCode = 400;
    throw err;
  }

  let targetId = toOid(lastReadMessageId);
  if (!targetId) {
    const latest = await Message.findOne({ roomId: rid })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id')
      .lean()
      .exec();
    if (!latest?._id) {
      return {
        advanced: false,
        lastReadMessageId: null,
        readAt: null,
        cursors: await listCursorsForRoom(rid),
      };
    }
    targetId = latest._id;
  } else {
    const exists = await Message.findOne({ _id: targetId, roomId: rid }).select('_id').lean().exec();
    if (!exists) {
      const err = new Error('Message not found in this room');
      err.statusCode = 404;
      throw err;
    }
  }

  const existing = await RoomReadCursor.findOne({ roomId: rid, userId: uid }).lean().exec();
  const currentId = existing?.lastReadMessageId ? String(existing.lastReadMessageId) : '';
  const candidateId = String(targetId);

  if (!shouldAdvanceCursor(currentId, candidateId)) {
    return {
      advanced: false,
      lastReadMessageId: currentId || candidateId,
      readAt: existing?.lastReadAt ? new Date(existing.lastReadAt).toISOString() : null,
      cursors: await listCursorsForRoom(rid),
    };
  }

  const readAt = new Date();
  const updated = await RoomReadCursor.findOneAndUpdate(
    { roomId: rid, userId: uid },
    {
      $set: {
        roomId: rid,
        userId: uid,
        lastReadMessageId: targetId,
        lastReadAt: readAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    advanced: true,
    lastReadMessageId: String(updated.lastReadMessageId),
    readAt: readAt.toISOString(),
    cursors: await listCursorsForRoom(rid),
  };
}

/**
 * Map userId → lastReadMessageId cho nhiều room (unread).
 */
async function getCursorMapForUserRooms(userId, roomIds = []) {
  const uid = toOid(userId);
  if (!uid) return new Map();
  const ids = (Array.isArray(roomIds) ? roomIds : [])
    .map((id) => toOid(id))
    .filter(Boolean);
  if (!ids.length) return new Map();

  const rows = await RoomReadCursor.find({
    userId: uid,
    roomId: { $in: ids },
  })
    .select('roomId lastReadMessageId lastReadAt')
    .lean()
    .exec();

  const map = new Map();
  for (const row of rows) {
    map.set(String(row.roomId), {
      lastReadMessageId: String(row.lastReadMessageId),
      lastReadAt: row.lastReadAt,
    });
  }
  return map;
}

function receiptForOutgoingMessage(messageId, cursors, excludeUserId) {
  return resolveOutgoingRoomReceipt({
    messageId,
    peerCursors: cursors,
    excludeUserId,
  });
}

module.exports = {
  listCursorsForRoom,
  markRoomReadUpTo,
  getCursorMapForUserRooms,
  receiptForOutgoingMessage,
  cursorDto,
};
