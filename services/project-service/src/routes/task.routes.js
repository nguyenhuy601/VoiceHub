const express = require('express');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const taskBoardRoutes = require('./taskBoard.routes');
const projectRoleAdminRoutes = require('./projectRoleAdmin.routes');

// Nội bộ: xóa toàn bộ task của tổ chức (organization-service khi owner xóa org)
router.delete(
  '/internal/purge-organization/:organizationId',
  internalGatewayAuth,
  taskController.purgeOrganizationTasks.bind(taskController)
);

// Tạo task mới
router.post('/', taskController.createTask.bind(taskController));

// Lấy danh sách tasks
router.get('/', taskController.getTasks.bind(taskController));

// Thống kê theo organization (đặt trước /:taskId — tránh khớp taskId = "statistics")
router.get('/statistics', taskController.getStatistics.bind(taskController));

// Tạo task từ file chat (async queue)
router.post('/from-chat-file', taskController.createTaskFromChatFile.bind(taskController));

// Task boards — mount trước /:taskId (tránh GET /api/tasks/boards → getTaskById("boards") → 500)
router.use('/boards', taskBoardRoutes);

// Project briefs (BGĐ → PM) — trước /:taskId
const projectBriefRoutes = require('./projectBrief.routes');
router.use('/project-briefs', projectBriefRoutes);

// Admin Project Roles catalog — trước /:taskId
router.use('/admin/project-roles', projectRoleAdminRoutes);

const worklog = require('../controllers/worklog.controller');
router.get('/:taskId/worklogs', worklog.listTaskWorklogs);
router.post('/:taskId/worklogs', worklog.createTaskWorklog);

// Lấy task theo ID
router.get('/:taskId', taskController.getTaskById.bind(taskController));

// Cập nhật task
router.patch('/:taskId', taskController.updateTask.bind(taskController));
router.put('/:taskId', taskController.updateTask.bind(taskController));

// Thêm comment
router.post('/:taskId/comments', taskController.addComment.bind(taskController));

// Xóa task
router.delete('/:taskId', taskController.deleteTask.bind(taskController));

module.exports = router;



