import api from './api';

const taskService = {
  // Get tasks
  getTasks: async (organizationId, filters = {}) => {
    const params = new URLSearchParams(filters);
    return await api.get(`/tasks?organizationId=${organizationId}&${params}`);
  },

  // Get task by ID
  getTask: async (taskId) => {
    return await api.get(`/tasks/${taskId}`);
  },

  // Create task
  createTask: async (data) => {
    return await api.post('/tasks', data);
  },

  // Update task
  updateTask: async (taskId, data) => {
    return await api.put(`/tasks/${taskId}`, data);
  },

  // Delete task
  deleteTask: async (taskId) => {
    return await api.delete(`/tasks/${taskId}`);
  },

  // Assign task
  assignTask: async (taskId, userId) => {
    return await api.post(`/tasks/${taskId}/assign`, { userId });
  },

  // Update task status
  updateTaskStatus: async (taskId, status) => {
    return await api.patch(`/tasks/${taskId}/status`, { status });
  },

  // Add comment
  addComment: async (taskId, content) => {
    return await api.post(`/tasks/${taskId}/comments`, { content });
  },

  // Get task statistics
  getStatistics: async (organizationId, departmentId, teamId) => {
    const params = new URLSearchParams({
      organizationId,
      ...(departmentId && { departmentId }),
      ...(teamId && { teamId }),
    });
    return await api.get(`/tasks/statistics?${params}`);
  },
};

export default taskService;
