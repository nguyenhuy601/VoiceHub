const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const userContext = require('../middlewares/userContext');

// Apply user context middleware cho tất cả routes
router.use(userContext);

// Tạo user profile mới
router.post('/', userController.createUserProfile.bind(userController));

// Lấy thông tin user hiện tại
router.get('/me', userController.getCurrentUser.bind(userController));

// Tìm kiếm users
router.get('/search', userController.searchUsers.bind(userController));

// Lấy user profile theo ID
router.get('/:userId', userController.getUserProfileById.bind(userController));

// Lấy user profile theo username
router.get('/username/:username', userController.getUserProfileByUsername.bind(userController));

// Cập nhật user profile
router.patch('/me', userController.updateUserProfile.bind(userController));
router.put('/:userId', userController.updateUserProfile.bind(userController));

// Cập nhật status
router.patch('/me/status', userController.updateStatus.bind(userController));

// Xóa user profile
router.delete('/:userId', userController.deleteUserProfile.bind(userController));

module.exports = router;



