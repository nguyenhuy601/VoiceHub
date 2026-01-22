const EventEmitter = require('events');

class MessageEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Tăng số lượng listeners tối đa
  }

  // Emit event khi tin nhắn được tạo
  emitMessageCreated(message) {
    this.emit('message.created', message);
  }

  // Emit event khi tin nhắn được cập nhật
  emitMessageUpdated(message) {
    this.emit('message.updated', message);
  }

  // Emit event khi tin nhắn được xóa
  emitMessageDeleted(messageId) {
    this.emit('message.deleted', messageId);
  }

  // Emit event khi tin nhắn được đánh dấu đã đọc
  emitMessageRead(message) {
    this.emit('message.read', message);
  }
}

const messageEvent = new MessageEventEmitter();

// Event listeners
messageEvent.on('message.created', (message) => {
  console.log(`Message created: ${message._id}`);
  // Có thể thêm logic gửi notification, update cache, etc.
});

messageEvent.on('message.updated', (message) => {
  console.log(`Message updated: ${message._id}`);
});

messageEvent.on('message.deleted', (messageId) => {
  console.log(`Message deleted: ${messageId}`);
});

messageEvent.on('message.read', (message) => {
  console.log(`Message read: ${message._id}`);
});

module.exports = messageEvent;




