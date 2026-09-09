const { mongo } = require('@enterprise/shared');
const { mongoose } = mongo;

/**
 * Watermark đã đọc theo kênh (multi-reader).
 * Không dùng Message.isRead boolean cho room — cờ đó chỉ hợp DM 1-1.
 */
const roomReadCursorSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    lastReadAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'room_read_cursors',
  }
);

roomReadCursorSchema.index({ roomId: 1, userId: 1 }, { unique: true });
roomReadCursorSchema.index({ userId: 1, lastReadAt: -1 });

module.exports = mongoose.model('RoomReadCursor', roomReadCursorSchema);
