const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('/shared/middleware/auth');

// Tất cả routes đều cần authentication
router.use(authenticate);

// Tạo tin nhắn mới
router.post('/', messageController.createMessage.bind(messageController));

// Lấy tin nhắn theo ID
router.get('/:messageId', messageController.getMessageById.bind(messageController));

// Lấy danh sách tin nhắn
router.get('/', messageController.getMessages.bind(messageController));

// Đánh dấu tin nhắn đã đọc
router.patch('/:messageId/read', messageController.markAsRead.bind(messageController));

// Xóa tin nhắn
router.delete('/:messageId', messageController.deleteMessage.bind(messageController));

module.exports = router;

