const taskService = require('../services/task.service');
const { logger } = require('/shared');

class TaskController {
  // Tạo task mới
  async createTask(req, res) {
    try {
      const {
        title,
        description,
        assigneeId,
        serverId,
        organizationId,
        priority,
        dueDate,
        tags,
      } = req.body;
      const createdBy = req.user?.id || req.userContext?.userId;

      if (!title || !createdBy) {
        return res.status(400).json({
          success: false,
          message: 'title and createdBy are required',
        });
      }

      const task = await taskService.createTask({
        title,
        description,
        assigneeId,
        createdBy,
        serverId,
        organizationId,
        priority,
        dueDate,
        tags,
      });

      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Create task error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy task theo ID
  async getTaskById(req, res) {
    try {
      const { taskId } = req.params;
      const task = await taskService.getTaskById(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found',
        });
      }

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Get task error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách tasks
  async getTasks(req, res) {
    try {
      const { assigneeId, organizationId, serverId, status, priority, page, limit } = req.query;
      const userId = req.user?.id || req.userContext?.userId;

      const filter = { isActive: true };

      if (assigneeId) {
        filter.assigneeId = assigneeId;
      } else if (userId) {
        // Nếu không có assigneeId, lấy tasks của user
        filter.$or = [{ assigneeId: userId }, { createdBy: userId }];
      }

      if (organizationId) filter.organizationId = organizationId;
      if (serverId) filter.serverId = serverId;
      if (status) filter.status = status;
      if (priority) filter.priority = priority;

      const result = await taskService.getTasks(filter, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get tasks error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật task
  async updateTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const task = await taskService.updateTask(taskId, req.body, userId);

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Update task error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa task
  async deleteTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const task = await taskService.deleteTask(taskId, userId);

      res.json({
        success: true,
        message: 'Task deleted successfully',
        data: task,
      });
    } catch (error) {
      logger.error('Delete task error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thêm comment
  async addComment(req, res) {
    try {
      const { taskId } = req.params;
      const { content } = req.body;
      const userId = req.user?.id || req.userContext?.userId;

      if (!content || !userId) {
        return res.status(400).json({
          success: false,
          message: 'content and userId are required',
        });
      }

      const task = await taskService.addComment(taskId, userId, content);

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Add comment error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new TaskController();

