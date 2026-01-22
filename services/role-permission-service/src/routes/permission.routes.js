const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');

// Kiểm tra quyền truy cập (cho API Gateway)
router.post('/check', permissionController.checkPermission.bind(permissionController));

// Lấy permissions của user trong server
router.get('/user/:userId/server/:serverId', permissionController.getUserPermissions.bind(permissionController));

// Lấy role của user trong server (cho API Gateway)
router.get('/user/:userId/server/:serverId/role', permissionController.getUserRole.bind(permissionController));

module.exports = router;



