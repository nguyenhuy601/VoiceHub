import apiClient from './apiClient';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v));
  });
  return params;
}

export const taskAPI = {
  // Get all tasks — truyền object: { organizationId?, dueFrom?, dueTo?, status?, ... }
  getTasks: (filters = {}) => {
    const params = buildQueryParams(filters);
    const q = params.toString();
    return apiClient.get(q ? `/tasks?${q}` : '/tasks');
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
    if (organizationId == null || organizationId === '') {
      return apiClient.get('/tasks/statistics');
    }
    return apiClient.get(`/tasks/statistics?organizationId=${encodeURIComponent(organizationId)}`);
  },
};
