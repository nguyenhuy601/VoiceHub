const express = require('express');
const router = express.Router();
const serverController = require('../controllers/server.controller');

// Tạo server mới
router.post('/', serverController.createServer.bind(serverController));

// Lấy danh sách servers trong organization
router.get('/organization/:organizationId', serverController.getServersByOrganization.bind(serverController));

// Lấy server theo ID
router.get('/:serverId', serverController.getServerById.bind(serverController));

// Thêm member vào server
router.post('/:serverId/members', serverController.addMember.bind(serverController));

// Xóa member khỏi server
router.delete('/:serverId/members/:userId', serverController.removeMember.bind(serverController));

// Cập nhật server
router.patch('/:serverId', serverController.updateServer.bind(serverController));
router.put('/:serverId', serverController.updateServer.bind(serverController));

// Xóa server
router.delete('/:serverId', serverController.deleteServer.bind(serverController));

module.exports = router;



