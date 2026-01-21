import api from './api';

const fileService = {
  // Upload file
  uploadFile: async (file, metadata = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    return await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log('Upload progress:', percentCompleted);
      },
    });
  },

  // Get files
  getFiles: async (organizationId, filters = {}) => {
    const params = new URLSearchParams({ organizationId, ...filters });
    return await api.get(`/files?${params}`);
  },

  // Get file by ID
  getFile: async (fileId) => {
    return await api.get(`/files/${fileId}`);
  },

  // Delete file
  deleteFile: async (fileId) => {
    return await api.delete(`/files/${fileId}`);
  },

  // Get download URL
  getDownloadUrl: async (fileId) => {
    return await api.get(`/files/${fileId}/download`);
  },

  // Share file
  shareFile: async (fileId, userIds) => {
    return await api.post(`/files/${fileId}/share`, { userIds });
  },

  // Get file versions
  getVersions: async (fileId) => {
    return await api.get(`/files/${fileId}/versions`);
  },
};

export default fileService;
