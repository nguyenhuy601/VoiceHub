import apiClient from './apiClient';

export const taskAPI = {
  // Get all tasks
  getTasks: (organizationId, filters = {}) => {
    const params = new URLSearchParams({ organizationId, ...filters });
    return apiClient.get(`/tasks?${params}`);
  },

  // Create new task
  createTask: (taskData) => {
    return apiClient.post('/tasks', taskData);
  },

  // Get task by ID
  getTask: (id) => {
    return apiClient.get(`/tasks/${id}`);
  },

  // Update task
  updateTask: (id, updates) => {
    return apiClient.put(`/tasks/${id}`, updates);
  },

  // Delete task
  deleteTask: (id) => {
    return apiClient.delete(`/tasks/${id}`);
  },

  // Update task status
  updateStatus: (id, status) => {
    return apiClient.patch(`/tasks/${id}/status`, { status });
  },

  // Assign task to user
  assignTask: (id, userId) => {
    return apiClient.post(`/tasks/${id}/assign`, { userId });
  },

  // Get task statistics
  getStatistics: (organizationId) => {
    return apiClient.get(`/tasks/statistics?organizationId=${organizationId}`);
  }
};
