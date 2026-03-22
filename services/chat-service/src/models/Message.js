const { mongo } = require('/shared');
const { mongoose } = mongo;

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
    },
    content: {
      type: String,
      required: true,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    // Soft delete - giữ message nhưng đánh dấu đã xóa
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    // Recall (thu hồi) - ẩn message nhưng giữ nó cho histories
    isRecalled: {
      type: Boolean,
      default: false,
    },
    recalledAt: {
      type: Date,
    },
    // Edit tracking - lưu lịch sử edit
    editedAt: {
      type: Date,
    },
    originalContent: {
      type: String,
    },
    encV: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ organizationId: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;




